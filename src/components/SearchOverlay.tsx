"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchResult, TrackStatus } from "./SearchBar";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (videoId: string) => void;
  onAddPlaylist: (playlistId: string) => void;
  search: (query: string, cb: (resp: { results: SearchResult[]; error?: string }) => void) => void;
  getStatus: (videoId: string) => TrackStatus;
};

export default function SearchOverlay({
  open,
  onClose,
  onAdd,
  onAddPlaylist,
  search,
  getStatus,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setError(null);
    setRecentlyAdded(new Set());
    setFocusIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setError(null);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myReqId = ++reqIdRef.current;
    debounceRef.current = setTimeout(() => {
      search(query.trim(), (resp) => {
        if (myReqId !== reqIdRef.current) return;
        setLoading(false);
        if (resp.error) setError(resp.error);
        setResults(resp.results || []);
        setFocusIdx(0);
      });
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const handleAdd = (r: SearchResult) => {
    if (r.isPlaylist && r.playlistId) {
      onAddPlaylist(r.playlistId);
    } else {
      onAdd(r.videoId);
    }
    setRecentlyAdded((prev) => new Set([...prev, r.isPlaylist ? `pl:${r.playlistId}` : r.videoId]));
    // Don't clear input — let them add multiple. Close on Esc.
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[focusIdx];
      if (r) {
        const status = r.isPlaylist ? null : getStatus(r.videoId);
        if (!status) handleAdd(r);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="search-input-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search a song, paste a YouTube link, or paste a playlist…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="search-close" onClick={onClose}>ESC</button>
        </div>

        {query.trim() && (
          <div className="search-section-label">
            {loading ? "Searching…" : error ? error : `Results for "${query.trim()}"`}
          </div>
        )}

        <div className="search-results scroll">
          {!loading && !error && query.trim() && results.length === 0 && (
            <div className="search-empty">
              <div className="big">🔎</div>
              <div className="label">No matches. Try a different query or paste a link.</div>
            </div>
          )}
          {!query.trim() && (
            <div className="search-empty">
              <div className="big">🎵</div>
              <div className="label">Type to search YouTube — or paste a video / playlist link.</div>
            </div>
          )}
          {results.map((r, i) => {
            const key = r.isPlaylist ? `pl:${r.playlistId}` : r.videoId;
            const status = r.isPlaylist ? null : getStatus(r.videoId);
            const justAdded = recentlyAdded.has(key);
            const disabled = !!status;
            return (
              <div
                key={key}
                className={`search-result ${i === focusIdx ? "focused" : ""}`}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => !disabled && handleAdd(r)}
                style={disabled ? { cursor: "default", opacity: 0.7 } : undefined}
              >
                <img className="cover" src={r.thumbnail} alt="" />
                <div className="meta">
                  <div className="title">
                    {r.isPlaylist && (
                      <span style={{ fontSize: 10, color: "var(--brand)", fontWeight: 700, marginRight: 6, letterSpacing: "0.06em" }}>
                        PLAYLIST
                      </span>
                    )}
                    {r.title}
                  </div>
                  <div className="sub">
                    {r.isPlaylist
                      ? `${r.videoCount || 0} songs`
                      : status === "playing"
                      ? "Now playing"
                      : status === "queued"
                      ? "Already in queue"
                      : r.durationLabel || ""}
                  </div>
                </div>
                {!r.isPlaylist && r.durationLabel && !status && (
                  <div className="duration">{r.durationLabel}</div>
                )}
                {!r.isPlaylist && (
                  status === "playing" ? (
                    <div className="duration" style={{ color: "var(--brand)" }}>NOW</div>
                  ) : status === "queued" ? (
                    <div className="duration">QUEUED</div>
                  ) : (
                    <button
                      className={`add ${justAdded ? "added" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handleAdd(r); }}
                      title="Add to queue"
                    >
                      {justAdded ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12 5 5L20 7" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                    </button>
                  )
                )}
                {r.isPlaylist && (
                  <button
                    className={`add playlist ${justAdded ? "added" : ""}`}
                    onClick={(e) => { e.stopPropagation(); handleAdd(r); }}
                  >
                    {justAdded ? "Added" : `Add ${r.videoCount || ""} songs`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> add to queue</span>
          <span><kbd>ESC</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>Tip: paste a YouTube link or playlist URL</span>
        </div>
      </div>
    </div>
  );
}
