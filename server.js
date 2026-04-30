const next = require("next");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");
const ytsrPkg = require("youtube-sr");
const YouTube = ytsrPkg.default;
// youtube-sr@4.3.12 throws inside parseVideo on result items whose shape it doesn't expect
// (music shelves / topic-channel blocks YouTube includes for popular queries like "Dalangin",
// "Bohemian", etc.). The caller in formatSearchResult skips items that return undefined, so
// catching the throw turns "search failed" into "skip the bad item, keep the rest".
if (ytsrPkg.Util && typeof ytsrPkg.Util.parseVideo === "function") {
  const origParseVideo = ytsrPkg.Util.parseVideo.bind(ytsrPkg.Util);
  ytsrPkg.Util.parseVideo = function safeParseVideo(data) {
    try {
      return origParseVideo(data);
    } catch {
      return undefined;
    }
  };
}
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
const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

// videoId -> { url, expiresAt }
const audioUrlCache = new Map();
const AUDIO_URL_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

// videoId -> { lyrics: { synced, plain, title, artist } | null, expiresAt }
const lyricsCache = new Map();
const LYRICS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LYRICS_NEG_TTL_MS = 30 * 60 * 1000; // 30 min for "no match" so missing tracks can re-resolve sooner

// videoId -> { durationSec, expiresAt }  (ms) — duration via youtube-sr, used for lrclib disambiguation
const durationCache = new Map();
const DURATION_TTL_MS = 60 * 60 * 1000; // 1 hour
const DURATION_FETCH_TIMEOUT_MS = 5000;

const LRCLIB_HEADERS = {
  "User-Agent": "VeentRadio/0.1 (https://github.com/ptchblckchocopie/Radioveent)",
};

// Strip bracketed YouTube cruft like "(Official Video)" / "[Lyric Video]" / "(feat. X)".
// Leaves bare "ft./feat. X" alone so it can be removed AFTER the artist/title split
// (otherwise titles like "Drake feat. Future - Used To This" get mangled).
function cleanTitleForLyrics(title) {
  if (!title) return "";
  const KW = "official|music|lyric|video|audio|hd|hq|4k|m\\/v|mv|visualizer|live|cover|remix|extended|edit|version|reissue|remaster(?:ed)?|feat|ft|with";
  return title
    .replace(new RegExp(`\\((?:${KW})[^)]*\\)`, "gi"), "")
    .replace(new RegExp(`\\[(?:${KW})[^\\]]*\\]`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Strip trailing bare "ft./feat./featuring/with X[, Y]" from the end of a string.
// Safe to run on either side of an artist-title split.
function stripBareFeatures(s) {
  if (!s) return s;
  return s
    .replace(/\s*[-–—]?\s*\b(?:ft|feat|featuring|w\/|with)\.?\s+.+$/i, "")
    .trim();
}

// Pull "Artist" out of a YouTube channel name. Strips Topic / VEVO / Official / Records suffixes.
function normalizeChannelAsArtist(channel) {
  if (!channel || typeof channel !== "string") return null;
  let c = channel
    .replace(/\s*[-–—]\s*Topic\s*$/i, "")
    .replace(/\s*VEVO\s*$/i, "")
    .replace(/\s*Official(?:\s+(?:Music|Channel|Artist))?\s*$/i, "")
    .replace(/\s*Records\s*$/i, "")
    .trim();
  return c || null;
}

// Heuristic split of a YouTube title into { artist, track }. Falls back to channel as artist.
function splitTitleArtist(rawTitle, channel) {
  const cleaned = cleanTitleForLyrics(rawTitle || "");
  if (!cleaned) return { artist: null, track: "" };
  // Try common artist/title separators, longest first.
  const seps = [" – ", " — ", " - ", " | ", " : ", ": "];
  for (const sep of seps) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0 && idx < cleaned.length - sep.length) {
      const left = stripBareFeatures(cleaned.slice(0, idx).trim());
      const right = stripBareFeatures(cleaned.slice(idx + sep.length).trim());
      if (left && right) return { artist: left, track: right };
    }
  }
  // No separator: strip trailing features and fall back to channel name as artist.
  return { artist: normalizeChannelAsArtist(channel), track: stripBareFeatures(cleaned) };
}

// Dice coefficient over character bigrams, case- and punctuation-insensitive.
function similarity(a, b) {
  if (!a || !b) return 0;
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const A = norm(a);
  const B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return A === B ? 1 : 0;
  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const ag = bigrams(A);
  const bg = bigrams(B);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ag) {
    inter += Math.min(n, bg.get(g) || 0);
    total += n;
  }
  for (const n of bg.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

function scoreLyricsCandidate(c, target) {
  const titleSim = similarity(c.trackName, target.track);
  // Neutral when we have no artist to compare — don't penalize candidates for our missing data.
  const artistSim = target.artist ? similarity(c.artistName, target.artist) : 0.5;
  let durScore = 0.5;
  if (target.durationSec > 0 && Number.isFinite(c.duration) && c.duration > 0) {
    const delta = Math.abs(c.duration - target.durationSec);
    if (delta <= 2) durScore = 1;
    else if (delta <= 5) durScore = 0.85;
    else if (delta <= 15) durScore = 0.5;
    else durScore = 0.1;
  }
  const syncedBonus = c.syncedLyrics ? 0.05 : 0;
  return titleSim * 0.45 + artistSim * 0.25 + durScore * 0.3 + syncedBonus;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function fetchTrackDurationSec(videoId) {
  const cached = durationCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.durationSec;
  try {
    const v = await withTimeout(
      YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`),
      DURATION_FETCH_TIMEOUT_MS
    );
    const ms = Number(v?.duration);
    const durationSec = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
    durationCache.set(videoId, { durationSec, expiresAt: Date.now() + DURATION_TTL_MS });
    return durationSec;
  } catch {
    // Cache the failure briefly so we don't hammer on every lyrics request.
    durationCache.set(videoId, { durationSec: 0, expiresAt: Date.now() + 5 * 60 * 1000 });
    return 0;
  }
}

async function fetchLyrics(videoId, force = false) {
  if (!force) {
    const cached = lyricsCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.lyrics;
  }

  const meta = await fetchYouTubeMeta(videoId);
  if (!meta?.title) {
    lyricsCache.set(videoId, { lyrics: null, expiresAt: Date.now() + LYRICS_NEG_TTL_MS });
    return null;
  }

  const { artist, track } = splitTitleArtist(meta.title, meta.channel);
  const durationSec = await fetchTrackDurationSec(videoId);
  const target = { artist, track, durationSec };

  let pick = null;

  // Strategy 1: precise /api/get when we have artist + track + duration.
  if (artist && track && durationSec > 0) {
    try {
      const url =
        "https://lrclib.net/api/get?" +
        new URLSearchParams({
          artist_name: artist,
          track_name: track,
          duration: String(durationSec),
        });
      const res = await fetch(url, { headers: LRCLIB_HEADERS });
      if (res.ok) pick = await res.json();
    } catch (e) {
      console.error("lrclib /api/get failed:", e?.message || e);
    }
  }

  // Strategy 2: structured /api/search with track_name + artist_name, scored.
  if (!pick && (artist || track)) {
    try {
      const params = new URLSearchParams();
      if (track) params.set("track_name", track);
      if (artist) params.set("artist_name", artist);
      const res = await fetch(`https://lrclib.net/api/search?${params}`, { headers: LRCLIB_HEADERS });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          pick = data
            .map((c) => ({ c, score: scoreLyricsCandidate(c, target) }))
            .sort((a, b) => b.score - a.score)[0].c;
        }
      }
    } catch (e) {
      console.error("lrclib /api/search (structured) failed:", e?.message || e);
    }
  }

  // Strategy 3: free-text fallback on the whole cleaned title, scored.
  if (!pick) {
    try {
      const q = stripBareFeatures(cleanTitleForLyrics(meta.title));
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        { headers: LRCLIB_HEADERS }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          pick = data
            .map((c) => ({ c, score: scoreLyricsCandidate(c, target) }))
            .sort((a, b) => b.score - a.score)[0].c;
        }
      }
    } catch (e) {
      console.error("lrclib /api/search (q) failed:", e?.message || e);
    }
  }

  if (!pick) {
    lyricsCache.set(videoId, { lyrics: null, expiresAt: Date.now() + LYRICS_NEG_TTL_MS });
    return null;
  }

  const lyrics = {
    synced: pick.syncedLyrics || null,
    plain: pick.plainLyrics || null,
    title: pick.trackName || null,
    artist: pick.artistName || null,
  };
  lyricsCache.set(videoId, { lyrics, expiresAt: Date.now() + LYRICS_TTL_MS });
  return lyrics;
}

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

// Keep empty rooms alive for half an hour so a user who briefly disconnects
// (tab close, wifi switch, mobile suspend, server restart) can come back and find
// their room still there — instead of "the radio randomly disappeared".
const ROOM_TTL_MS = 30 * 60 * 1000;
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
      channel: data.author_name || null,
    };
  } catch {
    return {
      title: "Unknown title",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channel: null,
    };
  }
}

// Curated set of Pokémon-world place IDs (matches src/lib/places.ts)
const VALID_PLACE_IDS = new Set([
  "pallet-town", "viridian-forest", "cerulean-cape", "lavender-tower",
  "cinnabar-volcano", "mt-moon", "goldenrod-skyline", "ecruteak",
  "ilex-forest", "sootopolis", "route-113", "mt-pyre", "snowpoint",
  "eterna-forest", "spear-pillar", "castelia", "dragonspiral",
  "lumiose", "akala-beach", "lake-of-the-moone", "galar-route-2", "crown-tundra",
]);
function isValidPlaceId(v) {
  return typeof v === "string" && VALID_PLACE_IDS.has(v);
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: "",
      placeId: null,
      createdAt: Date.now(),
      mode: "synced",
      hostUserId: null,
      queue: [],
      current: null,
      playback: { playing: false, positionSec: 0, serverUpdatedAt: Date.now() },
      shuffle: false,
      repeat: "off",
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
    placeId: room.placeId || null,
    mode: room.mode,
    shuffle: !!room.shuffle,
    repeat: room.repeat || "off",
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
      placeId: room.placeId || null,
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

function advanceQueue(io, room, opts = {}) {
  const isNaturalEnd = !!opts.isNaturalEnd;

  // Repeat-one: only on natural end of track. Skip bypasses it.
  if (isNaturalEnd && room.repeat === "one" && room.current) {
    setPlayback(room, { playing: true, positionSec: 0 });
    broadcastPlayback(io, room);
    return;
  }

  // Repeat-all: push the current track to the end of the queue before advancing
  if (room.repeat === "all" && room.current) {
    room.queue.push(room.current);
  }

  // Pick next: shuffled or sequential
  let next = null;
  if (room.queue.length > 0) {
    if (room.shuffle) {
      const i = Math.floor(Math.random() * room.queue.length);
      next = room.queue.splice(i, 1)[0];
    } else {
      next = room.queue.shift();
    }
  }

  room.current = next || null;
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

    socket.on("set_room_place", ({ placeId }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (!isValidPlaceId(placeId)) return;
      if (room.placeId === placeId) return;
      room.placeId = placeId;
      io.to(room.id).emit("room_place_updated", { placeId });
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

    socket.on("get_lyrics", async ({ videoId, refresh }, ack) => {
      const respond = (p) => {
        if (typeof ack === "function") ack(p);
      };
      if (!videoId || typeof videoId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        respond({ lyrics: null });
        return;
      }
      const lyrics = await fetchLyrics(videoId, !!refresh);
      respond({ lyrics: lyrics || null });
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
        advanceQueue(io, room, { isNaturalEnd: true });
      }
    });

    socket.on("set_shuffle", ({ shuffle }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      room.shuffle = !!shuffle;
      io.to(room.id).emit("playback_settings_updated", {
        shuffle: room.shuffle,
        repeat: room.repeat,
      });
    });

    socket.on("set_repeat", ({ repeat }) => {
      const ref = socketIndex.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (!room) return;
      if (repeat !== "off" && repeat !== "one" && repeat !== "all") return;
      room.repeat = repeat;
      io.to(room.id).emit("playback_settings_updated", {
        shuffle: room.shuffle,
        repeat: room.repeat,
      });
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
