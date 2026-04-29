"use client";
import { useEffect, useRef, useState } from "react";
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
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function maybeResize(file: File): Promise<Blob> {
  // Only resize JPG/PNG over 500KB; preserve animations in GIF/WebP
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

export default function ChatPanel({ messages, onSend, roomId }: Props) {
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only images are supported.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      setError("Use JPG, PNG, GIF, or WebP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image too large (max 8 MB).");
      return;
    }
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
        if (f) {
          acceptFile(f);
          e.preventDefault();
          return;
        }
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
        fd.append(
          "file",
          blob,
          pendingFile.name || (blob.type === "image/jpeg" ? "image.jpg" : "image")
        );
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
    <div className="flex flex-col h-80">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-2.5 pr-1 mb-2">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500">Say hi 👋</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2 text-sm">
              <Avatar pokemonId={m.userPokemonId} size={22} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 font-medium truncate">
                  {m.userName}
                </div>
                {m.text && (
                  <div className="text-gray-200 break-words whitespace-pre-wrap">
                    {m.text}
                  </div>
                )}
                {m.imageUrl && (
                  <a
                    href={m.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-1"
                  >
                    <img
                      src={m.imageUrl}
                      alt=""
                      loading="lazy"
                      className="max-w-full max-h-56 rounded cursor-zoom-in object-contain bg-zinc-950"
                    />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {previewUrl && (
        <div className="mb-2 flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-md p-1.5">
          <img
            src={previewUrl}
            alt=""
            className="w-12 h-12 object-cover rounded"
          />
          <div className="flex-1 min-w-0 text-xs text-gray-400 truncate">
            {pendingFile?.name || "image"}
          </div>
          <button
            type="button"
            onClick={clearImage}
            className="text-gray-400 hover:text-white text-xs px-2"
            aria-label="Remove attached image"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 mb-1">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) acceptFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-gray-300 px-2 py-2 rounded-md text-sm flex-shrink-0"
          title="Attach image"
          aria-label="Attach image"
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          placeholder={uploading ? "Uploading…" : "Send a message"}
          maxLength={500}
          disabled={uploading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-400 min-w-0 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={uploading || (!input.trim() && !pendingFile)}
          className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
        >
          {uploading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
