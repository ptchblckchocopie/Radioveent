"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Track } from "@/lib/types";
import Avatar from "./Avatar";

type Props = {
  track: Track;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

function DragHandleIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="4" cy="16" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

export default function SortableQueueItem({
  track,
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

  const baseClasses =
    "px-4 py-3 flex items-center gap-3 border-b border-zinc-800 last:border-b-0";
  const modeClasses = selectMode
    ? "cursor-pointer hover:bg-zinc-800/50 " + (isSelected ? "bg-indigo-500/10" : "")
    : "bg-zinc-900";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${baseClasses} ${modeClasses}`}
      onClick={selectMode ? () => onToggleSelect(track.id) : undefined}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(track.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-indigo-500 cursor-pointer flex-shrink-0"
        />
      ) : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none flex-shrink-0 p-1 -m-1"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </button>
      )}
      <img
        src={track.thumbnail}
        alt=""
        className="w-16 h-10 object-cover rounded flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="truncate">{track.title}</div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <span>added by</span>
          <Avatar pokemonId={track.addedByPokemonId} size={16} />
          <span>{track.addedByName}</span>
        </div>
      </div>
      {!selectMode && (
        <button
          onClick={() => onRemove(track.id)}
          className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 flex-shrink-0"
          title="Remove"
        >
          Remove
        </button>
      )}
    </li>
  );
}
