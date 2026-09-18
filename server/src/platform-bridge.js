// Arcade Link platform bridge adapter. This endpoint intentionally exposes
// only public lobby data; passwords, roles, cards and player tokens stay here.
export function createSabotajiPlatformBridge(rooms, baseUrl) {
  return {
    publicState() {
      return {
        version: 1,
        gameId: 'sabotaji',
        updatedAt: new Date().toISOString(),
        capabilities: { canSpectate: true, canReserveNextRound: false },
        rooms: rooms.listPublicRooms().map((room) => {
          const url = new URL(baseUrl);
          url.searchParams.set('room', room.roomCode);
          const status = room.status === 'LOBBY' ? 'WAITING' : room.status === 'PLAYING' ? 'PLAYING' : 'FINISHED';
          return {
            roomCode: room.roomCode,
            hostNickname: room.hostNickname,
            playerCount: room.playerCount,
            maxPlayers: room.maxPlayers,
            spectatorCount: room.spectatorCount,
            status,
            requiresPassword: room.requiresPassword,
            canJoin: status === 'WAITING' && room.playerCount < room.maxPlayers,
            canSpectate: true,
            canReserveNextRound: false,
            joinUrl: url.toString()
          };
        })
      };
    }
  };
}
