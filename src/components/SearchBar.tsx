"use client";
import { useEffect, useRef, useState } from "react";

export type SearchResult = {
  videoId: string;
  title: string;
  thumbnail: string;
  durationLabel: string;
  isPlaylist?: boolean;
  playlistId?: string;
  videoCount?: number;
};

export type TrackStatus = "playing" | "queued" | null;

type Props = {
  onAdd: (videoId: string) => void;
  onAddPlaylist: (playlistId: string) => void;
  search: (query: string, cb: (resp: { results: SearchResult[]; error?: string }) => void) => void;
  getStatus: (videoId: string) => TrackStatus;
};

export default function SearchBar({ onAdd, onAddPlaylist, search, getStatus }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

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
        if (myReqId !== reqIdRef.current) return; // stale response
        setLoading(false);
        if (resp.error) setError(resp.error);
        setResults(resp.results || []);
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleAdd = (r: SearchResult) => {
    onAdd(r.videoId);
    setQuery("");
    setResults([]);
  };

  const handleAddPlaylist = (r: SearchResult) => {
    if (!r.playlistId) return;
    onAddPlaylist(r.playlistId);
    setQuery("");
    setResults([]);
  };

  const showResults = query.trim().length > 0;

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search YouTube or paste a link"
        className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 outline-none focus:border-indigo-400"
      />
      {showResults && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loading && <div className="px-4 py-3 text-sm text-gray-500">Searching…</div>}
          {!loading && error && (
            <div className="px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">No matches.</div>
          )}
          {!loading && results.length > 0 && (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((r) => {
                const status = r.isPlaylist ? null : getStatus(r.videoId);
                return (
                  <li
                    key={r.isPlaylist ? `pl:${r.playlistId}` : r.videoId}
                    className="px-3 py-2 flex items-center gap-3 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40"
                  >
                    <img src={r.thumbnail} alt="" className="w-20 h-12 object-cover rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm">
                        {r.isPlaylist && (
                          <span className="text-xs text-indigo-400 mr-1.5 font-semibold">PLAYLIST</span>
                        )}
                        {r.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.isPlaylist
                          ? `${r.videoCount || 0} songs`
                          : r.durationLabel}
                      </div>
                    </div>
                    {r.isPlaylist ? (
                      <button
                        onClick={() => handleAddPlaylist(r)}
                        className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded text-sm font-medium flex-shrink-0 whitespace-nowrap"
                      >
                        Add {r.videoCount || ""} songs
                      </button>
                    ) : status === "playing" ? (
                      <span className="text-xs text-indigo-400 font-medium px-3 py-1 flex-shrink-0">
                        Now Playing
                      </span>
                    ) : status === "queued" ? (
                      <span className="text-xs text-gray-500 font-medium px-3 py-1 flex-shrink-0">
                        In Queue
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAdd(r)}
                        className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded text-sm font-medium flex-shrink-0"
                      >
                        Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
