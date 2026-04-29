const next = require("next");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");
const YouTube = require("youtube-sr").default;
const Busboy = require("busboy");

const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_MIMES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_FILENAME_RE = /^[A-Za-z0-9_-]+\.(jpg|png|gif|webp)$/;
const MIME_FOR_EXT = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const execFileAsync = promisify(execFile);
const YTDLP_PATH = process.env.YTDLP_PATH || path.join(os.homedir(), ".local/bin/yt-dlp");

// videoId -> { url, expiresAt }
const audioUrlCache = new Map();
const AUDIO_URL_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

async function extractAudioUrl(videoId) {
  const { stdout } = await execFileAsync(
    YTDLP_PATH,
    ["-f", "bestaudio", "-g", "--no-warnings", `https://www.youtube.com/watch?v=${videoId}`],
    { timeout: 20000, maxBuffer: 1024 * 1024 }
  );
  const url = stdout.split("\n").find((line) => line.startsWith("http"));
  if (!url) throw new Error("no url in yt-dlp output");
  return url.trim();
}

async function getAudioUrlCached(videoId, force = false) {
  if (!force) {
    const cached = audioUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
  }
  const url = await extractAudioUrl(videoId);
  audioUrlCache.set(videoId, { url, expiresAt: Date.now() + AUDIO_URL_TTL_MS });
  return url;
}

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

// roomId -> Room
const rooms = new Map();
// socketId -> { userId, roomId }
const socketIndex = new Map();

const ROOM_TTL_MS = 5 * 60 * 1000;
const cleanupTimers = new Map();

function tryParseUrl(input) {
  let s = (input || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function parseYouTubeId(input) {
  const trimmed = (input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const url = tryParseUrl(trimmed);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      return v && /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null;
    }
    const shorts = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shorts) return shorts[1];
    const embed = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
  }
  return null;
}

function parseYouTubePlaylistId(input) {
  const url = tryParseUrl(input);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
  const list = url.searchParams.get("list");
  if (!list || !/^[A-Za-z0-9_-]+$/.test(list)) return null;
  // Treat as playlist URL only if explicitly /playlist OR no v= present.
  // For watch?v=X&list=PL we prefer to add the single video.
  if (url.pathname === "/playlist" || !url.searchParams.get("v")) return list;
  return null;
}

async function fetchYouTubeMeta(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || "Unknown title",
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: "Unknown title",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: "",
      createdAt: Date.now(),
      mode: "synced",
      hostUserId: null,
      queue: [],
      current: null,
      playback: { playing: false, positionSec: 0, serverUpdatedAt: Date.now() },
      users: new Map(),
      activity: [],
      chat: [],
      uploads: [],
    });
  }
  const t = cleanupTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    cleanupTimers.delete(roomId);
  }
  return rooms.get(roomId);
}

function scheduleCleanup(roomId) {
  if (cleanupTimers.has(roomId)) return;
  const timer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (r && r.users.size === 0) {
      // Delete uploaded images associated with this room
      for (const filename of r.uploads || []) {
        if (UPLOAD_FILENAME_RE.test(filename)) {
          fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
        }
      }
      rooms.delete(roomId);
      if (lastIoInstance) scheduleLobbyBroadcast(lastIoInstance);
    }
    cleanupTimers.delete(roomId);
  }, ROOM_TTL_MS);
  cleanupTimers.set(roomId, timer);
}

let lastIoInstance = null;

function serveUpload(req, res) {
  const url = req.url || "";
  const filename = decodeURIComponent(url.replace(/^\/uploads\//, "").split("?")[0]);
  if (!UPLOAD_FILENAME_RE.test(filename)) {
    res.writeHead(404).end();
    return;
  }
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.stat(filepath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404).end();
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_FOR_EXT[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filepath).pipe(res);
  });
}

function handleUpload(req, res) {
  let bb;
  try {
    bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    });
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid request" }));
    return;
  }

  let savedFilename = null;
  let aborted = false;
  let abortReason = "";
  let roomIdField = null;
  let writer = null;

  bb.on("field", (name, value) => {
    if (name === "roomId" && typeof value === "string" && value.length <= 32) {
      roomIdField = value;
    }
  });

  bb.on("file", (_name, file, info) => {
    const mime = (info?.mimeType || "").toLowerCase();
    const ext = ALLOWED_IMAGE_MIMES.get(mime);
    if (!ext) {
      aborted = true;
      abortReason = "unsupported file type";
      file.resume();
      return;
    }
    const id = nanoid(14);
    const filename = `${id}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    savedFilename = filename;
    writer = fs.createWriteStream(filepath);
    file.pipe(writer);
    file.on("limit", () => {
      aborted = true;
      abortReason = "file too large (max 8 MB)";
      writer?.destroy();
      fs.unlink(filepath, () => {});
      savedFilename = null;
    });
  });

  bb.on("error", () => {
    aborted = true;
    abortReason = "upload error";
  });

  bb.on("close", () => {
    if (aborted || !savedFilename) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: abortReason || "no file uploaded" }));
      return;
    }
    if (roomIdField) {
      const room = rooms.get(roomIdField);
      if (room) {
        if (!room.uploads) room.uploads = [];
        room.uploads.push(savedFilename);
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ url: `/uploads/${savedFilename}` }));
  });

  req.pipe(bb);
}

function effectivePosition(room) {
  const p = room.playback;
  if (!p.playing) return p.positionSec;
  return p.positionSec + (Date.now() - p.serverUpdatedAt) / 1000;
}

function snapshot(room, youUserId) {
  return {
    id: room.id,
    name: room.name || `Room ${room.id}`,
    mode: room.mode,
    hostUserId: room.hostUserId,
    queue: room.queue,
    current: room.current,
    playback: {
      playing: room.playback.playing,
      positionSec: effectivePosition(room),
      serverUpdatedAt: Date.now(),
    },
    users: Array.from(room.users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      pokemonId: u.pokemonId ?? null,
    })),
    youUserId,
    activity: (room.activity || []).slice(-20),
    chat: (room.chat || []).slice(-50),
  };
}

function validPokemonId(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 1025;
}

const ACTIVITY_CAP = 30;
function logActivity(io, room, type, user, payload = {}) {
  const event = {
    id: nanoid(8),
    type,
    userName: user?.name || "Anonymous",
    userPokemonId: user?.pokemonId ?? null,
    payload,
    timestamp: Date.now(),
  };
  if (!room.activity) room.activity = [];
  room.activity.push(event);
  if (room.activity.length > ACTIVITY_CAP) room.activity.shift();
  io.to(room.id).emit("activity_added", event);
  return event;
}

function getRoomSummaries() {
  const list = [];
  for (const room of rooms.values()) {
    if (room.users.size === 0) continue;
    const avatars = [];
    for (const u of room.users.values()) {
      if (u.pokemonId) avatars.push(u.pokemonId);
      if (avatars.length >= 5) break;
    }
    list.push({
      id: room.id,
      name: room.name || `Room ${room.id}`,
      listenerCount: room.users.size,
      currentTrack: room.current
        ? { title: room.current.title, thumbnail: room.current.thumbnail }
        : null,
      avatars,
      createdAt: room.createdAt || 0,
    });
  }
  list.sort((a, b) => b.listenerCount - a.listenerCount || b.createdAt - a.createdAt);
  return list;
}

let lobbyBroadcastScheduled = false;
function scheduleLobbyBroadcast(ioInstance) {
  if (lobbyBroadcastScheduled) return;
  lobbyBroadcastScheduled = true;
  setImmediate(() => {
    lobbyBroadcastScheduled = false;
    ioInstance.to("browse").emit("rooms_updated", getRoomSummaries());
  });
}

function takenPokemonIds(room) {
  const out = [];
  for (const u of room.users.values()) {
    if (u.pokemonId) out.push(u.pokemonId);
  }
  return out;
}

function broadcastUsers(io, room) {
  const users = Array.from(room.users.values()).map((u) => ({
    id: u.id,
    name: u.name,
    pokemonId: u.pokemonId ?? null,
  }));
  io.to(room.id).emit("users_updated", users);
  const taken = takenPokemonIds(room);
  io.to(room.id).emit("taken_pokemon_updated", taken);
  io.to(`lobby:${room.id}`).emit("taken_pokemon_updated", taken);
  scheduleLobbyBroadcast(io);
}

function broadcastQueue(io, room) {
  io.to(room.id).emit("queue_updated", { queue: room.queue, current: room.current });
  scheduleLobbyBroadcast(io);
}

function broadcastPlayback(io, room) {
  io.to(room.id).emit("playback_update", {
    playing: room.playback.playing,
    positionSec: room.playback.positionSec,
    serverUpdatedAt: room.playback.serverUpdatedAt,
  });
}

function broadcastMode(io, room) {
  io.to(room.id).emit("mode_changed", { mode: room.mode, hostUserId: room.hostUserId });
}

function setPlayback(room, { playing, positionSec }) {
  room.playback = {
    playing,
    positionSec: Math.max(0, positionSec),
    serverUpdatedAt: Date.now(),
  };
}

function advanceQueue(io, room) {
  const next = room.queue.shift() || null;
  room.current = next;
  setPlayback(room, { playing: !!next, positionSec: 0 });
  broadcastQueue(io, room);
  broadcastPlayback(io, room);
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const url = req.url || "";
    if (url.startsWith("/uploads/")) {
      return serveUpload(req, res);
    }
    if (url.startsWith("/api/upload") && req.method === "POST") {
      return handleUpload(req, res);
    }
    return handle(req, res);
  });
  const io = new Server(server, { cors: { origin: "*" } });
  lastIoInstance = io;

  io.on("connection", (socket) => {
    let userId = nanoid(8);

    socket.on("subscribe_browse", (_payload, ack) => {
      socket.join("browse");
      if (typeof ack === "function") ack({ rooms: getRoomSummaries() });
    });

    socket.on("unsubscribe_browse", () => {
      socket.leave("browse");
    });

    socket.on("set_room_name", ({ name }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (typeof name !== "string") return;
      const trimmed = name.trim().slice(0, 60);
      if (!trimmed) return;
      if (room.name === trimmed) return;
      room.name = trimmed;
      io.to(room.id).emit("room_name_updated", { name: room.name });
      scheduleLobbyBroadcast(io);
    });

    socket.on("peek_room", ({ roomId }, ack) => {
      const respond = (p) => {
        if (typeof ack === "function") ack(p);
      };
      if (!roomId || typeof roomId !== "string") {
        respond({ takenPokemonIds: [] });
        return;
      }
      socket.join(`lobby:${roomId}`);
      const room = rooms.get(roomId);
      respond({ takenPokemonIds: room ? takenPokemonIds(room) : [] });
    });

    socket.on("join", ({ roomId, name, pokemonId }, ack) => {
      const respond = (p) => {
        if (typeof ack === "function") ack(p);
      };
      if (!roomId || typeof roomId !== "string") {
        respond({ error: "invalid_room" });
        return;
      }
      const room = getOrCreateRoom(roomId);
      const taken = new Set(takenPokemonIds(room));
      if (validPokemonId(pokemonId) && taken.has(pokemonId)) {
        respond({ error: "pokemon_taken", takenPokemonIds: Array.from(taken) });
        return;
      }
      const newUser = {
        id: userId,
        name: (name || "").toString().slice(0, 32) || "Anonymous",
        pokemonId: validPokemonId(pokemonId) ? pokemonId : null,
      };
      room.users.set(userId, newUser);
      socketIndex.set(socket.id, { userId, roomId });
      socket.leave(`lobby:${roomId}`);
      socket.join(roomId);
      socket.emit("room_state", snapshot(room, userId));
      broadcastUsers(io, room);
      logActivity(io, room, "user_joined", newUser);
      respond({ ok: true });
    });

    socket.on("rename", ({ name, pokemonId }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const u = room.users.get(ref.userId);
      if (!u) return;
      if (typeof name === "string") {
        u.name = name.slice(0, 32) || "Anonymous";
      }
      if (pokemonId === null || validPokemonId(pokemonId)) {
        u.pokemonId = pokemonId;
      }
      broadcastUsers(io, room);
    });

    socket.on("set_mode", ({ mode }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (mode !== "host" && mode !== "synced") return;
      room.mode = mode;
      if (mode === "host" && !room.hostUserId) {
        room.hostUserId = ref.userId;
      }
      if (mode === "synced") {
        room.hostUserId = null;
      }
      broadcastMode(io, room);
    });

    socket.on("claim_host", () => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      room.hostUserId = ref.userId;
      if (room.mode !== "host") room.mode = "host";
      broadcastMode(io, room);
    });

    socket.on("get_audio_url", async ({ videoId, refresh }, ack) => {
      const respond = (payload) => {
        if (typeof ack === "function") ack(payload);
      };
      if (!videoId || typeof videoId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        respond({ error: "invalid videoId" });
        return;
      }
      try {
        const url = await getAudioUrlCached(videoId, !!refresh);
        respond({ url });
      } catch (e) {
        respond({ error: "extraction failed: " + (e?.message || "unknown") });
      }
    });

    socket.on("search", async ({ query }, ack) => {
      const respond = (payload) => {
        if (typeof ack === "function") ack(payload);
      };
      const q = (query || "").toString().trim().slice(0, 100);
      if (!q) {
        respond({ results: [] });
        return;
      }
      // If they pasted a URL, return that single video as a "result"
      const directId = parseYouTubeId(q);
      if (directId) {
        const meta = await fetchYouTubeMeta(directId);
        respond({
          results: [
            {
              videoId: directId,
              title: meta?.title || "Unknown title",
              thumbnail: meta?.thumbnail || `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
              durationLabel: "",
            },
          ],
        });
        return;
      }
      // If they pasted a playlist URL, return a single playlist preview
      const playlistId = parseYouTubePlaylistId(q);
      if (playlistId) {
        try {
          const pl = await YouTube.getPlaylist(`https://www.youtube.com/playlist?list=${playlistId}`);
          const firstVideo = pl.videos?.[0];
          const count = pl.videoCount || pl.videos?.length || 0;
          if (!count) {
            respond({ error: "Playlist is empty or private.", results: [] });
            return;
          }
          respond({
            results: [
              {
                videoId: "",
                title: pl.title || "Playlist",
                thumbnail:
                  pl.thumbnail?.url ||
                  firstVideo?.thumbnail?.url ||
                  (firstVideo?.id ? `https://i.ytimg.com/vi/${firstVideo.id}/hqdefault.jpg` : ""),
                durationLabel: "",
                isPlaylist: true,
                playlistId,
                videoCount: count,
              },
            ],
          });
          return;
        } catch (e) {
          console.error("getPlaylist failed for", playlistId, e?.message || e);
          respond({ error: "Could not load that playlist (private or unavailable).", results: [] });
          return;
        }
      }
      try {
        const items = await YouTube.search(q, { limit: 8, type: "video", safeSearch: false });
        const results = items
          .map((v) => ({
            videoId: v.id || "",
            title: v.title || "Unknown title",
            thumbnail: v.thumbnail?.url || (v.id ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : ""),
            durationLabel: v.durationFormatted || "",
          }))
          .filter((r) => r.videoId);
        respond({ results });
      } catch (e) {
        respond({ error: "search failed", results: [] });
      }
    });

    socket.on("add_track", async ({ url }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const videoId = parseYouTubeId(url);
      if (!videoId) {
        socket.emit("error_msg", { message: "That doesn't look like a YouTube link." });
        return;
      }
      const meta = await fetchYouTubeMeta(videoId);
      const adder = room.users.get(ref.userId);
      const track = {
        id: nanoid(10),
        videoId,
        title: meta?.title || "Unknown title",
        thumbnail: meta?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationSec: 0,
        addedByName: adder?.name || "Anonymous",
        addedByPokemonId: adder?.pokemonId ?? null,
      };
      if (!room.current) {
        room.current = track;
        setPlayback(room, { playing: true, positionSec: 0 });
        broadcastPlayback(io, room);
      } else {
        room.queue.push(track);
      }
      broadcastQueue(io, room);
      logActivity(io, room, "track_added", adder, { trackTitle: track.title });
    });

    socket.on("add_playlist", async ({ playlistId }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (!playlistId || typeof playlistId !== "string" || !/^[A-Za-z0-9_-]+$/.test(playlistId)) {
        socket.emit("error_msg", { message: "Invalid playlist." });
        return;
      }
      try {
        const pl = await YouTube.getPlaylist(
          `https://www.youtube.com/playlist?list=${playlistId}`,
          { fetchAll: true, limit: 100 }
        );
        const adder = room.users.get(ref.userId);
        const existingIds = new Set([
          ...(room.current ? [room.current.videoId] : []),
          ...room.queue.map((t) => t.videoId),
        ]);
        let added = 0;
        for (const v of pl.videos || []) {
          if (!v.id) continue;
          if (existingIds.has(v.id)) continue; // skip duplicates
          existingIds.add(v.id);
          const track = {
            id: nanoid(10),
            videoId: v.id,
            title: v.title || "Unknown title",
            thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
            durationSec: 0,
            addedByName: adder?.name || "Anonymous",
            addedByPokemonId: adder?.pokemonId ?? null,
          };
          if (!room.current) {
            room.current = track;
            setPlayback(room, { playing: true, positionSec: 0 });
            broadcastPlayback(io, room);
          } else {
            room.queue.push(track);
          }
          added++;
          if (added >= 100) break;
        }
        broadcastQueue(io, room);
        if (added === 0) {
          socket.emit("error_msg", { message: "Playlist was empty or all songs already in queue." });
        } else {
          logActivity(io, room, "playlist_added", adder, {
            playlistTitle: pl.title || "playlist",
            count: added,
          });
        }
      } catch (e) {
        socket.emit("error_msg", { message: "Could not load playlist." });
      }
    });

    socket.on("remove_track", ({ trackId }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const idx = room.queue.findIndex((t) => t.id === trackId);
      if (idx >= 0) {
        const removed = room.queue[idx];
        room.queue.splice(idx, 1);
        broadcastQueue(io, room);
        const user = room.users.get(ref.userId);
        logActivity(io, room, "track_removed", user, { trackTitle: removed.title });
      }
    });

    socket.on("remove_tracks", ({ trackIds }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room || !Array.isArray(trackIds)) return;
      const idsToRemove = new Set(trackIds.filter((id) => typeof id === "string"));
      if (idsToRemove.size === 0) return;
      const before = room.queue.length;
      room.queue = room.queue.filter((t) => !idsToRemove.has(t.id));
      const removedCount = before - room.queue.length;
      if (removedCount > 0) {
        broadcastQueue(io, room);
        const user = room.users.get(ref.userId);
        logActivity(io, room, "tracks_removed", user, { count: removedCount });
      }
    });

    socket.on("reorder", ({ trackIds }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room || !Array.isArray(trackIds)) return;
      const byId = new Map(room.queue.map((t) => [t.id, t]));
      const reordered = trackIds.map((id) => byId.get(id)).filter(Boolean);
      if (reordered.length === room.queue.length) {
        room.queue = reordered;
        broadcastQueue(io, room);
      }
    });

    socket.on("play", () => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room || !room.current) return;
      setPlayback(room, { playing: true, positionSec: effectivePosition(room) });
      broadcastPlayback(io, room);
    });

    socket.on("pause", () => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      setPlayback(room, { playing: false, positionSec: effectivePosition(room) });
      broadcastPlayback(io, room);
    });

    socket.on("seek", ({ positionSec }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const pos = Number(positionSec);
      if (!Number.isFinite(pos)) return;
      setPlayback(room, { playing: room.playback.playing, positionSec: pos });
      broadcastPlayback(io, room);
    });

    socket.on("skip", () => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const skippedTitle = room.current?.title;
      const user = room.users.get(ref.userId);
      advanceQueue(io, room);
      if (skippedTitle) {
        logActivity(io, room, "track_skipped", user, { trackTitle: skippedTitle });
      }
    });

    socket.on("send_chat", ({ text, imageUrl }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const trimmed = (text || "").toString().slice(0, 500).trim();
      let cleanImageUrl = null;
      if (typeof imageUrl === "string") {
        const m = imageUrl.match(/^\/uploads\/([A-Za-z0-9_-]+\.(?:jpg|png|gif|webp))$/);
        if (m) cleanImageUrl = imageUrl;
      }
      if (!trimmed && !cleanImageUrl) return;
      const u = room.users.get(ref.userId);
      const msg = {
        id: nanoid(8),
        userName: u?.name || "Anonymous",
        userPokemonId: u?.pokemonId ?? null,
        text: trimmed,
        imageUrl: cleanImageUrl,
        timestamp: Date.now(),
      };
      if (!room.chat) room.chat = [];
      room.chat.push(msg);
      if (room.chat.length > 100) room.chat.shift();
      io.to(room.id).emit("chat_message", msg);
    });

    socket.on("track_ended", ({ trackId }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (room.current && room.current.id === trackId) {
        advanceQueue(io, room);
      }
    });

    socket.on("disconnect", () => {
      const ref = socketIndex.get(socket.id);
      socketIndex.delete(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      const leavingUser = room.users.get(ref.userId);
      room.users.delete(ref.userId);
      if (room.hostUserId === ref.userId) {
        const remaining = Array.from(room.users.keys());
        room.hostUserId = remaining[0] || null;
        broadcastMode(io, room);
      }
      if (room.users.size === 0) {
        scheduleCleanup(room.id);
        scheduleLobbyBroadcast(io);
      } else {
        broadcastUsers(io, room);
        if (leavingUser) logActivity(io, room, "user_left", leavingUser);
      }
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
