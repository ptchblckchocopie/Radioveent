export type Mode = "synced" | "host";

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
  | "track_skipped";

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
  };
  timestamp: number;
}

export interface RoomSnapshot {
  id: string;
  name: string;
  mode: Mode;
  hostUserId: string | null;
  queue: Track[];
  current: Track | null;
  playback: Playback;
  users: User[];
  youUserId: string;
  activity: ActivityEvent[];
  chat: ChatMessage[];
}

export interface RoomSummary {
  id: string;
  name: string;
  listenerCount: number;
  currentTrack: { title: string; thumbnail: string } | null;
  avatars: number[];
  createdAt: number;
}
