"use client";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";

export default function CreateRoomButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/r/${nanoid(6)}`)}
      className="bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg w-full transition"
    >
      Create a room
    </button>
  );
}
