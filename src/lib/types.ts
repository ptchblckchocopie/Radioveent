export type Mode = "synced" | "host";
export type RepeatMode = "off" | "one" | "all";

export interface Track {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  durationSec: number;
  addedByName: string;
  addedByPokemonId: number | null;
}

export interface User {
  id: string;
  name: string;
  pokemonId: number | null;
}

export interface Playback {
  playing: boolean;
  positionSec: number;
  serverUpdatedAt: number;
}

export type ActivityType =
  | "user_joined"
  | "user_left"
  | "track_added"
  | "playlist_added"
  | "track_removed"
  | "tracks_removed"
  | "track_skipped"
  | "paused"
  | "resumed"
  | "seeked"
  | "queue_reordered";

export interface ChatMessage {
  id: string;
  userName: string;
  userPokemonId: number | null;
  text: string;
  imageUrl?: string | null;
  timestamp: number;
}

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  userName: string;
  userPokemonId: number | null;
  payload: {
    trackTitle?: string;
    playlistTitle?: string;
    count?: number;
    positionSec?: number;  // for paused / resumed
    fromSec?: number;      // for seeked
    toSec?: number;        // for seeked
    fromIdx?: number;      // for queue_reordered (1-indexed for display)
    toIdx?: number;        // for queue_reordered
  };
  timestamp: number;
}

export interface RoomSnapshot {
  id: string;
  name: string;
  placeId: string | null;
  mode: Mode;
  hostUserId: string | null;
  creatorUserId: string | null;
  queue: Track[];
  current: Track | null;
  playback: Playback;
  shuffle: boolean;
  repeat: RepeatMode;
  users: User[];
  youUserId: string;
  activity: ActivityEvent[];
  chat: ChatMessage[];
}

export interface RoomSummary {
  id: string;
  name: string;
  placeId: string | null;
  listenerCount: number;
  currentTrack: { title: string; thumbnail: string } | null;
  avatars: number[];
  createdAt: number;
}
