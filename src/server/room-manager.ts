import type { WebSocket } from 'ws';
import {
  type Room,
  type PlayerConnection,
  type ServerMessage,
  type PlayerInfo,
  type StateSyncData,
  MessageType,
  ErrorCode,
  MAX_PLAYERS_PER_ROOM,
  generateRoomId,
  generatePlayerId,
  isValidRoomId,
  isValidUsername,
  PROTOCOL_VERSION,
} from './types.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleRooms();
    }, 5 * 60 * 1000);
  }

  createRoom(): Room {
    const roomId = this.generateUniqueRoomId();
    const room: Room = {
      id: roomId,
      hostId: '',
      players: new Map(),
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      currentStageId: null,
      lastStateSync: null,
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    console.log(`Room created: ${roomId}`);
    return room;
  }

  getRoom(roomId: string): Room | null {
    if (!isValidRoomId(roomId)) {
      return null;
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        hostId: '',
        players: new Map(),
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        currentStageId: null,
        lastStateSync: null,
        createdAt: Date.now(),
      };
      this.rooms.set(roomId, room);
      console.log(`room created with specific ID: ${roomId}`);
    }
    return room;
  }

  addPlayerToRoom(
    roomId: string,
    username: string,
    socket: WebSocket
  ): { success: boolean; playerId?: string; error?: { code: ErrorCode; message: string } } {
    if (!isValidRoomId(roomId)) {
      return {
        success: false,
        error: { code: ErrorCode.INVALID_ROOM, message: 'Invalid room ID format' },
      };
    }

    if (!isValidUsername(username)) {
      return {
        success: false,
        error: { code: ErrorCode.INVALID_MESSAGE, message: 'Invalid username' },
      };
    }

    const room = this.getRoom(roomId);
    if (!room) {
      return {
        success: false,
        error: { code: ErrorCode.INVALID_ROOM, message: 'Could not create room' },
      };
    }

    if (room.players.size >= room.maxPlayers) {
      return {
        success: false,
        error: { code: ErrorCode.ROOM_FULL, message: `Room is full (${MAX_PLAYERS_PER_ROOM} players max)` },
      };
    }

    const playerId = generatePlayerId();
    const isHost = room.players.size === 0;

    const player: PlayerConnection = {
      id: playerId,
      username,
      socket,
      isHost,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    };

    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, roomId);

    if (isHost) {
      room.hostId = playerId;
    }

    console.log(`${username} (${playerId.slice(0, 8)}) joined room ${roomId} as ${isHost ? 'HOST' : 'CLIENT'}`);
    console.log(`room ${roomId} now has ${room.players.size} player(s)`);

    this.sendToPlayer(playerId, {
      type: MessageType.JOINED,
      version: PROTOCOL_VERSION,
      playerId,
      roomId,
      isHost,
      players: this.getRoomPlayerList(room),
      stageState: room.lastStateSync, // send current stage
    });

    this.broadcastToRoom(
      roomId,
      {
        type: MessageType.PLAYER_JOINED,
        version: PROTOCOL_VERSION,
        playerId,
        username,
      },
      playerId 
    );

    return { success: true, playerId };
  }

  removePlayer(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    const wasHost = player.isHost;
    const username = player.username;

    room.players.delete(playerId);
    this.playerToRoom.delete(playerId);

    console.log(`${username} (${playerId.slice(0, 8)}) left room ${roomId}`);
    console.log(`room ${roomId} now has ${room.players.size} player(s)`);

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      console.log(`room ${roomId} deleted (empty)`);
      return;
    }

    this.broadcastToRoom(roomId, {
      type: MessageType.PLAYER_LEFT,
      version: PROTOCOL_VERSION,
      playerId,
      username,
    });

    if (wasHost) {
      this.migrateHost(room);
    }
  }

  // migrate host
  private migrateHost(room: Room): void {
    if (room.players.size === 0) return;

    // pick random player as new host
    const playerIds = Array.from(room.players.keys());
    const newHostId = playerIds[Math.floor(Math.random() * playerIds.length)];
    const newHost = room.players.get(newHostId);

    if (!newHost) return;

    newHost.isHost = true;
    room.hostId = newHostId;

    console.log(`host is now ${newHost.username} (${newHostId.slice(0, 8)}) room ${room.id}`);

    this.broadcastToRoom(room.id, {
      type: MessageType.HOST_CHANGED,
      version: PROTOCOL_VERSION,
      newHostId,
      stageState: room.lastStateSync,
    });
  }

  broadcastPosition(playerId: string, positionData: ArrayBuffer): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) {
      player.lastActivity = Date.now();
    }

    let broadcastCount = 0;

    for (const [otherPlayerId, otherPlayer] of room.players) {
      if (otherPlayerId !== playerId && otherPlayer.socket.readyState === 1) {
        const playerIdBuffer = Buffer.from(playerId, 'utf8');
        const combined = Buffer.concat([playerIdBuffer, Buffer.from(positionData)]);
        otherPlayer.socket.send(combined);
        broadcastCount++;
      }
    }

    if (Math.random() < 0.01) { // so we don't absolutely destroy the console with updates
      console.log(`position from ${player?.username || playerId.slice(0, 8)} in room ${roomId} → ${broadcastCount} player(s)`);
    }
  }

  updateRoomState(playerId: string, stateData: StateSyncData): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player || !player.isHost) {
      // this should never happen but just in case
      console.warn(`non-host player ${playerId} tried to send state sync!`);
      return;
    }

    room.lastStateSync = stateData;
    room.currentStageId = stateData.stageId;

    // broadcast state sync to all non-host players
    this.broadcastToRoom(
      roomId,
      {
        type: MessageType.SYNC_STATE,
        version: PROTOCOL_VERSION,
        data: stateData,
      },
      playerId // exclude host
    );
  }

  sendToPlayer(playerId: string, message: ServerMessage): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player && player.socket.readyState === 1) {
      player.socket.send(JSON.stringify(message));
    }
  }

  broadcastToRoom(roomId: string, message: ServerMessage, excludePlayerId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    for (const [playerId, player] of room.players) {
      if (playerId !== excludePlayerId && player.socket.readyState === 1) {
        player.socket.send(messageStr);
      }
    }
  }

  broadcastBananaCollected(playerId: string, animGroupId: number, index: number): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    console.log(`broadcasting banana collected to room ${roomId}: animGroupId=${animGroupId}, index=${index}`);

    this.broadcastToRoom(roomId, {
      type: MessageType.BANANA_COLLECTED,
      version: PROTOCOL_VERSION,
      animGroupId,
      index,
    }, playerId); // exclude sender
  }

  broadcastGoalReached(playerId: string, goalType: string): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    console.log(`broadcasting goal reached to room ${roomId}: goalType=${goalType}`);

    this.broadcastToRoom(roomId, {
      type: MessageType.GOAL_REACHED,
      version: PROTOCOL_VERSION,
      goalType,
    });
  }

  broadcastBonusClear(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    console.log(`broadcasting bonus clear to room ${roomId}`);

    this.broadcastToRoom(roomId, {
      type: MessageType.BONUS_CLEAR,
      version: PROTOCOL_VERSION,
    });
  }

  broadcastStateSync(playerId: string, stateData: StateSyncData): void {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== playerId) {
      console.warn(`non-host player ${playerId} attempted to send state sync`);
      return;
    }

    console.log(`broadcasting state sync to room ${roomId}: stageId=${stateData.stageId}`);

    room.lastStateSync = stateData;
    room.currentStageId = stateData.stageId;

    this.broadcastToRoom(roomId, {
      type: MessageType.SYNC_STATE,
      version: PROTOCOL_VERSION,
      data: stateData,
    });
  }

  private getRoomPlayerList(room: Room): PlayerInfo[] {
    return Array.from(room.players.values()).map((player) => ({
      id: player.id,
      username: player.username,
      isHost: player.isHost,
    }));
  }

  private generateUniqueRoomId(): string {
    let roomId: string;
    do {
      roomId = generateRoomId();
    } while (this.rooms.has(roomId));
    return roomId;
  }

  private cleanupStaleRooms(): void {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [roomId, room] of this.rooms) {
      let hasActivePlayer = false;

      for (const player of room.players.values()) {
        if (now - player.lastActivity < staleThreshold) {
          hasActivePlayer = true;
          break;
        }
      }

      if (!hasActivePlayer && now - room.createdAt > staleThreshold) {
        console.log(`Cleaning up stale room ${roomId}`);
        this.rooms.delete(roomId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.rooms.clear();
    this.playerToRoom.clear();
  }

  getStats(): { roomCount: number; playerCount: number } {
    let playerCount = 0;
    for (const room of this.rooms.values()) {
      playerCount += room.players.size;
    }
    return {
      roomCount: this.rooms.size,
      playerCount,
    };
  }
}
