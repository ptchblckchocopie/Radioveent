import RoomClient from "@/components/RoomClient";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ name?: string | string[]; place?: string | string[] }>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  const initialName = Array.isArray(sp.name) ? sp.name[0] : sp.name;
  const initialPlace = Array.isArray(sp.place) ? sp.place[0] : sp.place;
  return (
    <RoomClient
      roomId={roomId}
      initialRoomName={initialName}
      initialPlaceId={initialPlace}
    />
  );
}
