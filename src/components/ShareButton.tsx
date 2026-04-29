"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  inviteUrl: string;
  listenerCount: number;
};

export default function ShareButton({ inviteUrl, listenerCount }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); } catch {}
    setCopied(true);
    setToast(true);
    setTimeout(() => setCopied(false), 1800);
    setTimeout(() => setToast(false), 1600);
  };

  const shareToDiscord = () => {
    // No Discord deep-link share on web — fall back to copy.
    copy();
  };
  const shareToX = () => {
    const tweet = encodeURIComponent(`Listening on Veent Radio · ${inviteUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${tweet}`, "_blank");
  };
  const shareViaEmail = () => {
    const subject = encodeURIComponent("Veent Radio invite");
    const body = encodeURIComponent(`Drop in: ${inviteUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  const showQR = () => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(inviteUrl)}`;
    window.open(url, "_blank");
  };

  // Display: strip "https://" for the pretty URL row
  const display = inviteUrl.replace(/^https?:\/\//, "");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className={`share-btn ${open ? "open" : ""} ${copied ? "copied" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Invite people to this radio"
      >
        <span className="sb-leading">
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2.5 7.5 5.5 10.5 11.5 4" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07L11.7 5.3" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </span>
        <span className="sb-text">{copied ? "Link copied" : "Invite"}</span>
        <span className="sb-trailing">
          <span className="live" />
          {listenerCount}
        </span>
      </button>

      <div className={`share-toast ${toast ? "show" : ""}`}>✓ Copied to clipboard</div>

      {open && (
        <div className="share-popover" onClick={(e) => e.stopPropagation()}>
          <div className="share-hero">
            <h4>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07L11.7 5.3" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Invite to Veent Radio
            </h4>
            <p>Anyone with this link can drop in. They'll pick a nickname and Pokémon on arrival.</p>
          </div>
          <div className="share-body">
            <div className="share-link-row">
              <span className="url">
                <span className="scheme">https://</span>
                <span className="room">{display}</span>
              </span>
              <button className={`copy ${copied ? "copied" : ""}`} onClick={copy}>
                {copied ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                    Copied
                  </>
                ) : (
                  "Copy"
                )}
              </button>
            </div>

            <div className="share-quick">
              <button className="discord" onClick={shareToDiscord} title="Copy for Discord">
                <span className="qi">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.418 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                </span>
                Discord
              </button>
              <button className="twitter" onClick={shareToX} title="Post on X">
                <span className="qi">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </span>
                Post on X
              </button>
              <button className="qr" onClick={showQR} title="Show QR code">
                <span className="qi">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="1" y="1" width="4.5" height="4.5" />
                    <rect x="8.5" y="1" width="4.5" height="4.5" />
                    <rect x="1" y="8.5" width="4.5" height="4.5" />
                    <path d="M8.5 8.5h2v2M13 13v-2m-2.5 2.5h2M8.5 13v-2.5" />
                  </svg>
                </span>
                QR code
              </button>
              <button className="email" onClick={shareViaEmail} title="Email invite">
                <span className="qi">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <rect x="1.5" y="3" width="11" height="8" rx="1.2" />
                    <path d="M1.5 4l5.5 4 5.5-4" />
                  </svg>
                </span>
                Email
              </button>
            </div>

            <div className="share-meta">
              <span className="meta-item">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="5.5" cy="5.5" r="4.2" />
                  <path d="M5.5 3v2.5l1.6 1" />
                </svg>
                Persistent link
              </span>
              <span className="dot" />
              <span className="meta-item">{listenerCount} active now</span>
              <span className="dot" />
              <span className="meta-item">Anyone can join</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
