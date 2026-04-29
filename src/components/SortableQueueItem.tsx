"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Track } from "@/lib/types";
import Avatar from "./Avatar";

type Props = {
  track: Track;
  index: number;
  isUpNext: boolean;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

function DragHandleIcon() {
  return (
    <svg width="12" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="1.4" />
      <circle cx="10" cy="4" r="1.4" />
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="4" cy="16" r="1.4" />
      <circle cx="10" cy="16" r="1.4" />
    </svg>
  );
}

const RemoveIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export default function SortableQueueItem({
  track,
  index,
  isUpNext,
  selectMode,
  isSelected,
  onToggleSelect,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
    disabled: selectMode,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  const itemClass =
    "queue-item" +
    (isUpNext ? " up-next" : "") +
    (selectMode ? " selecting" : "") +
    (isSelected ? " selected" : "");

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={itemClass}
      onClick={selectMode ? () => onToggleSelect(track.id) : undefined}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(track.id)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer" }}
          aria-label="Select track"
        />
      ) : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </button>
      )}

      <img src={track.thumbnail} alt="" className="queue-cover" />

      <div className="queue-info">
        <div className="title">{track.title}</div>
        <div className="sub">
          <span className="added-by">
            <Avatar pokemonId={track.addedByPokemonId} size={14} />
            {track.addedByName}
          </span>
        </div>
      </div>

      <span /> {/* duration spacer */}

      {!selectMode && (
        <div className="queue-actions">
          <button
            className="danger"
            onClick={() => onRemove(track.id)}
            title="Remove"
            aria-label="Remove from queue"
          >
            {RemoveIcon}
          </button>
        </div>
      )}
    </li>
  );
}
