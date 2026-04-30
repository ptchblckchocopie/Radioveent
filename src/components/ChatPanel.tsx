"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import Avatar from "./Avatar";

type Props = {
  messages: ChatMessage[];
  onSend: (text: string, imageUrl?: string) => void;
  roomId: string;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function maybeResize(file: File): Promise<Blob> {
  const resizable = (file.type === "image/jpeg" || file.type === "image/png") && file.size > 500 * 1024;
  if (!resizable) return file;
  try {
    const img = await loadImage(file);
    const maxDim = 1600;
    let { width, height } = img;
    if (width <= maxDim && height <= maxDim) return file;
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    return blob || file;
  } catch {
    return file;
  }
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const EMOJI_LIST = [
  "😀","😂","🥹","😍","🥰","😎","🤩","😭","🔥","✨",
  "💀","👀","🫡","🤔","😤","🥺","💜","❤️","💙","💚",
  "👏","🙌","🤝","✌️","🤙","👋","🎵","🎶","🎧","🎤",
  "🎸","🎹","🥁","🎷","🎺","🪗","💿","📻","🔊","🎼",
];

export default function ChatPanel({ messages, onSend, roomId }: Props) {
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiOpen]);

  const insertEmoji = useCallback((emoji: string) => {
    setInput((prev) => prev + emoji);
    setEmojiOpen(false);
    textInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith("image/")) return setError("Only images.");
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      return setError("Use JPG, PNG, GIF, or WebP.");
    }
    if (file.size > MAX_UPLOAD_BYTES) return setError("Too large (max 8 MB).");
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) { acceptFile(f); e.preventDefault(); return; }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim().slice(0, 500);
    if (!trimmed && !pendingFile) return;
    if (uploading) return;

    let imageUrl: string | undefined;
    if (pendingFile) {
      setUploading(true);
      try {
        const blob = await maybeResize(pendingFile);
        const fd = new FormData();
        fd.append("roomId", roomId);
        fd.append("file", blob, pendingFile.name || "image.jpg");
        const resp = await fetch("/api/upload", { method: "POST", body: fd });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error || "upload failed");
        }
        const data = (await resp.json()) as { url: string };
        imageUrl = data.url;
      } catch (err: any) {
        setError(err?.message || "Upload failed.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(trimmed, imageUrl);
    setInput("");
    clearImage();
  };

  return (
    <>
      <div className="right-body scroll" ref={listRef}>
        {messages.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Say hi 👋
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const isCont =
            prev &&
            prev.userName === m.userName &&
            prev.userPokemonId === m.userPokemonId &&
            m.timestamp - prev.timestamp < 5 * 60 * 1000;
          return (
            <div key={m.id} className={`chat-msg ${isCont ? "continuation" : ""}`}>
              <div className="chat-avatar-slot">
                <Avatar pokemonId={m.userPokemonId} size={36} />
              </div>
              <div>
                <div className="chat-head">
                  <span className="name">{m.userName}</span>
                  <span className="time">{formatTime(m.timestamp)}</span>
                </div>
                {m.text && <div className="chat-text">{m.text}</div>}
                {m.imageUrl && (
                  <a className="chat-image-link" href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img src={m.imageUrl} alt="" loading="lazy" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-input-wrap">
        {previewUrl && (
          <div className="chat-attachment">
            <img src={previewUrl} alt="" />
            <span className="label">{pendingFile?.name || "image"}</span>
            <button type="button" className="remove" onClick={clearImage} aria-label="Remove">✕</button>
          </div>
        )}
        {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 6 }}>{error}</div>}
        <form onSubmit={handleSubmit} className="chat-input">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
            }}
          />
          <button
            type="button"
            className="icon-action"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            aria-label="Attach image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.83l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <div ref={emojiRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="icon-action"
              onClick={() => setEmojiOpen((v) => !v)}
              title="Emoji"
              aria-label="Emoji"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {emojiOpen && (
              <div className="emoji-picker">
                {EMOJI_LIST.map((e) => (
                  <button key={e} type="button" className="emoji-item" onClick={() => insertEmoji(e)}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={textInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={uploading ? "Uploading…" : "Send a message"}
            maxLength={500}
            disabled={uploading}
          />
          <button
            type="submit"
            className={`icon-action send ${input.trim() || pendingFile ? "ready" : ""}`}
            disabled={uploading || (!input.trim() && !pendingFile)}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
