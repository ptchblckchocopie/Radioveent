"use client";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

// Public Google STUN servers. STUN-only works for ~85% of NAT setups; symmetric
// NATs (some corporate / mobile carriers) need a TURN server, which we don't
// run for v1 — those users will see a black panel and an error.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Target Opus bitrate for music-grade audio. Default Opus negotiation lands
// around 32–40 kbps because it assumes voice; that sounds awful on music.
// 256 kbps stereo is roughly Spotify "high quality".
const AUDIO_MAX_BITRATE = 256_000;

// Rewrite the Opus fmtp line in an SDP to ask the encoder for music settings:
//   stereo=1 / sprop-stereo=1  → both sides expect 2-channel
//   maxaveragebitrate=256000   → bumps from voice-default ~32k
//   usedtx=0                   → no "discontinuous transmission" — DTX mutes
//                                 perceived-silence segments and chops music
//   useinbandfec=1             → forward error correction so packet loss
//                                 produces graceful degradation, not glitches
function tuneSdpForMusic(sdp: string): string {
  const rtpmap = sdp.match(/a=rtpmap:(\d+) opus\/\d+\/2/i);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];
  const newFmtp =
    `a=fmtp:${pt} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;` +
    `maxaveragebitrate=${AUDIO_MAX_BITRATE};usedtx=0`;
  const fmtpRe = new RegExp(`a=fmtp:${pt} [^\\r\\n]+`);
  return fmtpRe.test(sdp)
    ? sdp.replace(fmtpRe, newFmtp)
    : sdp.replace(rtpmap[0], rtpmap[0] + "\r\n" + newFmtp);
}

// Bump the audio sender's encoding bitrate. setParameters complements the SDP
// fmtp because some browsers cap bitrate via RTCRtpSender regardless of SDP.
async function raiseAudioBitrate(pc: RTCPeerConnection) {
  const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
  if (!audioSender) return;
  const params = audioSender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
  try {
    await audioSender.setParameters(params);
  } catch {
    // Older browsers throw if encodings was lazy-initialised. Safe to ignore —
    // SDP munging already covers the common case.
  }
}

type SignalPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit | null };

type Props = {
  socket: Socket | null;
  // userId of whoever's currently sharing, or null if no share active.
  watchPartyHostUserId: string | null;
  // userId of THIS client.
  youUserId: string;
  // Called when the host's local capture ends (user clicked "Stop sharing"
  // in the browser permission UI). Signals the parent to emit wp_stop.
  onLocalCaptureEnded: () => void;
};

export default function WatchParty({
  socket,
  watchPartyHostUserId,
  youUserId,
  onLocalCaptureEnded,
}: Props) {
  const isHost = !!watchPartyHostUserId && watchPartyHostUserId === youUserId;
  const isViewer = !!watchPartyHostUserId && watchPartyHostUserId !== youUserId;

  // Host: one peer connection per viewer (keyed by viewer userId).
  // Viewer: a single peer connection (key is hostUserId).
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  // Browsers block autoplay of media with sound until the user interacts with
  // the document. When that happens we fall back to muted playback and surface
  // a click-to-unmute affordance instead of silently dropping audio.
  const [needsTapToUnmute, setNeedsTapToUnmute] = useState(false);

  // Tear down everything (peers + local capture) when the role changes or the
  // component unmounts. Keeps zombie tracks from continuing to consume CPU.
  function teardown() {
    for (const pc of peersRef.current.values()) {
      try { pc.close(); } catch {}
    }
    peersRef.current.clear();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) {
        try { t.stop(); } catch {}
      }
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setHasRemoteStream(false);
  }

  // ── HOST: capture screen, accept incoming viewer-ready signals ───
  useEffect(() => {
    if (!isHost || !socket) return;
    let cancelled = false;

    (async () => {
      try {
        // audio: { ... } asks the browser to capture tab/system audio AND
        // disable the voice-DSP pipeline (echo cancellation, noise suppression,
        // auto-gain control). Those filters are tuned for human speech and
        // wreck music — pumping, hollow timbre, dropped low frequencies. The
        // user still has to tick "Share tab audio" in the picker; if they
        // don't, getDisplayMedia returns a video-only stream with no error.
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Browser's "Stop sharing" button ends the track — propagate up so
        // the room state matches reality.
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          onLocalCaptureEnded();
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Screen share permission denied."
              : "Couldn't start screen share."
          );
          onLocalCaptureEnded();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, socket]);

  // ── HOST: when a viewer announces itself, create a peer + send an offer ─
  useEffect(() => {
    if (!isHost || !socket) return;
    const onViewerReady = async ({ viewerUserId }: { viewerUserId: string }) => {
      // Discard stale peer for this viewer if any (refresh / reconnect).
      const old = peersRef.current.get(viewerUserId);
      if (old) { try { old.close(); } catch {} }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(viewerUserId, pc);

      pc.onicecandidate = (e) => {
        socket.emit("wp_signal", {
          toUserId: viewerUserId,
          payload: { type: "candidate", candidate: e.candidate?.toJSON() ?? null },
        });
      };

      // Add the live screen tracks to this peer.
      const stream = localStreamRef.current;
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const offer = await pc.createOffer();
      // Munge the SDP before setLocalDescription so the negotiated codec
      // parameters reflect music settings on both sides of the connection.
      offer.sdp = offer.sdp ? tuneSdpForMusic(offer.sdp) : offer.sdp;
      await pc.setLocalDescription(offer);
      await raiseAudioBitrate(pc);
      socket.emit("wp_signal", {
        toUserId: viewerUserId,
        payload: { type: "offer", sdp: pc.localDescription! },
      });
    };

    socket.on("wp_viewer_ready", onViewerReady);
    return () => { socket.off("wp_viewer_ready", onViewerReady); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, socket]);

  // ── VIEWER: announce ourselves, accept offer, send answer ────────
  useEffect(() => {
    if (!isViewer || !socket || !watchPartyHostUserId) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(watchPartyHostUserId, pc);

    pc.onicecandidate = (e) => {
      socket.emit("wp_signal", {
        toUserId: watchPartyHostUserId,
        payload: { type: "candidate", candidate: e.candidate?.toJSON() ?? null },
      });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      const v = remoteVideoRef.current;
      if (!v || !stream) return;
      v.srcObject = stream;
      setHasRemoteStream(true);
      // Try to play unmuted. If the browser blocks autoplay-with-sound (very
      // common when the viewer hasn't interacted with the page yet), fall back
      // to muted playback and surface a tap-to-unmute prompt instead of
      // silently dropping the host's audio.
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        setNeedsTapToUnmute(true);
        v.play().catch(() => {});
      });
    };

    // Tell the host we're ready for an offer.
    socket.emit("wp_request_offer");

    return () => {
      try { pc.close(); } catch {}
      peersRef.current.delete(watchPartyHostUserId);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setHasRemoteStream(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewer, socket, watchPartyHostUserId]);

  // ── BOTH SIDES: handle inbound signals (offer/answer/candidate) ──
  useEffect(() => {
    if (!socket) return;
    const onSignal = async ({ fromUserId, payload }: { fromUserId: string; payload: SignalPayload }) => {
      const pc = peersRef.current.get(fromUserId);
      if (!pc) return;
      try {
        if (payload.type === "offer") {
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          // Mirror the music-grade Opus params on the viewer's answer so both
          // halves of the negotiation agree on stereo + bitrate ceiling.
          answer.sdp = answer.sdp ? tuneSdpForMusic(answer.sdp) : answer.sdp;
          await pc.setLocalDescription(answer);
          socket.emit("wp_signal", {
            toUserId: fromUserId,
            payload: { type: "answer", sdp: pc.localDescription! },
          });
        } else if (payload.type === "answer") {
          await pc.setRemoteDescription(payload.sdp);
        } else if (payload.type === "candidate") {
          if (payload.candidate) {
            await pc.addIceCandidate(payload.candidate);
          }
        }
      } catch (e) {
        // Most failures here are benign (e.g. candidate added before remote
        // description set) — log and keep going rather than tearing down.
        console.warn("wp signal handle failed", e);
      }
    };
    socket.on("wp_signal", onSignal);
    return () => { socket.off("wp_signal", onSignal); };
  }, [socket]);

  // Tear down on disable or unmount.
  useEffect(() => {
    if (!watchPartyHostUserId) teardown();
    return () => teardown();
  }, [watchPartyHostUserId]);

  if (!watchPartyHostUserId) return null;

  return (
    <div className="watch-party watch-party--solo">
      {isHost ? (
        <>
          <div className="wp-eyebrow">You're sharing your screen</div>
          <video
            ref={localVideoRef}
            className="wp-video"
            autoPlay
            muted
            playsInline
          />
          <div className="wp-hint">
            For others to hear audio: re-share via the <strong>Chrome Tab</strong> tab in the picker (not "Entire Screen" or "Window") and tick <strong>Share tab audio</strong>. On Linux, audio sharing is only available for tabs.
          </div>
        </>
      ) : (
        <>
          <div className="wp-eyebrow">Watch party</div>
          <video
            ref={remoteVideoRef}
            className="wp-video"
            autoPlay
            playsInline
          />
          {!hasRemoteStream && (
            <div className="wp-loading">Connecting to host's screen…</div>
          )}
          {needsTapToUnmute && (
            <button
              type="button"
              className="wp-unmute"
              onClick={() => {
                const v = remoteVideoRef.current;
                if (!v) return;
                v.muted = false;
                v.play().catch(() => {});
                setNeedsTapToUnmute(false);
              }}
            >
              Tap to unmute
            </button>
          )}
        </>
      )}
      {error && <div className="wp-error">{error}</div>}
    </div>
  );
}
