import {
  ConnectionState,
  MessageType,
  PROTOCOL_VERSION,
  type JoinedMessage,
  type PlayerJoinedMessage,
  type PlayerLeftMessage,
  type HostChangedMessage,
  type SyncStateMessage,
  type ErrorMessage,
  type ServerMessage,
  type PlayerInfo,
  type StateSyncData,
  type RemotePlayer,
  type PositionSnapshot,
  type BananaCollectedMessage,
} from './types.js';

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private playerId: string | null = null;
  private roomId: string | null = null;
  private isHost: boolean = false;
  private players: Map<string, PlayerInfo> = new Map();
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private sequenceNumber: number = 0;
  private pendingStateSync: StateSyncData | null = null;

  // Callbacks
  private onStateChange?: (state: ConnectionState) => void;
  private onPlayerJoined?: (player: PlayerInfo) => void;
  private onPlayerLeft?: (playerId: string) => void;
  private onHostChanged?: (newHostId: string) => void;
  private onError?: (code: string, message: string) => void;
  private onBananaCollected?: (animGroupId: number, index: number) => void;

  constructor() {}

  connect(serverUrl: string, roomId: string, username: string): void {
    if (this.state !== ConnectionState.DISCONNECTED) {
      console.warn('already connected or connecting!');
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.roomId = roomId;

    try {
      this.socket = new WebSocket(serverUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        console.log('websocket connected');
        this.setState(ConnectionState.CONNECTED);
        this.sendJoin(roomId, username);
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = (event) => {
        console.log(`websocket closed (code: ${event.code})`);
        this.handleDisconnect();
      };

      this.socket.onerror = (error) => {
        console.error('websocket error:', error);
        this.handleDisconnect();
      };
    } catch (error) {
      console.error('failed to create websocket:', error);
      this.setState(ConnectionState.ERROR);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setState(ConnectionState.DISCONNECTED);
    this.playerId = null;
    this.roomId = null;
    this.isHost = false;
    this.players.clear();
    this.remotePlayers.clear();
  }

  sendPositionUpdate(ballState: any, frame: number): void {
    if (this.state !== ConnectionState.IN_ROOM || !this.socket) {
      return;
    }

    const buffer = new ArrayBuffer(47);
    const view = new DataView(buffer);

    view.setUint8(0, 0x01);
    view.setUint32(1, this.sequenceNumber, true);
    view.setFloat32(5, ballState.pos.x, true);
    view.setFloat32(9, ballState.pos.y, true);
    view.setFloat32(13, ballState.pos.z, true);
    view.setFloat32(17, ballState.vel.x, true);
    view.setFloat32(21, ballState.vel.y, true);
    view.setFloat32(25, ballState.vel.z, true);
    view.setFloat32(29, ballState.orientation.x, true);
    view.setFloat32(33, ballState.orientation.y, true);
    view.setFloat32(37, ballState.orientation.z, true);
    view.setFloat32(41, ballState.orientation.w, true);
    view.setUint8(45, ballState.state || 0);

    this.socket.send(buffer);
    this.sequenceNumber++;
  }

  sendStateSync(data: StateSyncData): void {
    if (!this.isHost || this.state !== ConnectionState.IN_ROOM || !this.socket) {
      return;
    }

    const message = {
      type: MessageType.STATE_SYNC,
      version: PROTOCOL_VERSION,
      data,
    };

    this.socket.send(JSON.stringify(message));
  }

  getRemotePlayers(): Map<string, RemotePlayer> {
    return this.remotePlayers;
  }

  getRemotePlayerPosition(playerId: string): PositionSnapshot | null {
    const player = this.remotePlayers.get(playerId);
    if (!player || player.positionBuffer.length === 0) {
      return null;
    }
    return player.positionBuffer[player.positionBuffer.length - 1];
  }

  pollStateSync(): StateSyncData | null {
    const data = this.pendingStateSync;
    this.pendingStateSync = null;
    return data;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.IN_ROOM;
  }

  isHostPlayer(): boolean {
    return this.isHost;
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  setOnStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChange = callback;
  }

  setOnPlayerJoined(callback: (player: PlayerInfo) => void): void {
    this.onPlayerJoined = callback;
  }

  setOnPlayerLeft(callback: (playerId: string) => void): void {
    this.onPlayerLeft = callback;
  }

  setOnHostChanged(callback: (newHostId: string) => void): void {
    this.onHostChanged = callback;
  }

  setOnError(callback: (code: string, message: string) => void): void {
    this.onError = callback;
  }

  setOnBananaCollected(callback: (animGroupId: number, index: number) => void): void {
    this.onBananaCollected = callback;
  }

  sendBananaCollected(animGroupId: number, index: number): void {
    if (this.state !== ConnectionState.IN_ROOM || !this.socket) {
      return;
    }

    const message = {
      type: MessageType.BANANA_COLLECTED,
      version: PROTOCOL_VERSION,
      animGroupId,
      index,
    };

    this.socket.send(JSON.stringify(message));
    console.log(`sent banana collected: animGroupId=${animGroupId}, index=${index}`);
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  private sendJoin(roomId: string, username: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('socket not ready');
      return;
    }

    const message = {
      type: MessageType.JOIN,
      version: PROTOCOL_VERSION,
      roomId: roomId.toUpperCase(),
      username,
    };

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (data instanceof ArrayBuffer) {
      this.handlePositionUpdate(data);
    } else {
      try {
        const message = JSON.parse(data) as ServerMessage;
        this.handleServerMessage(message);
      } catch (error) {
        console.error('failed to parse message:', error);
      }
    }
  }

  private handlePositionUpdate(data: ArrayBuffer): void {
    const buffer = new Uint8Array(data);

    let playerIdLength = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x01) {
        playerIdLength = i;
        break;
      }
    }

    if (playerIdLength === 0) return;

    const playerIdBytes = buffer.slice(0, playerIdLength);
    const playerId = new TextDecoder().decode(playerIdBytes);

    const view = new DataView(data, playerIdLength);
    if (view.byteLength < 46) return;

    const snapshot: PositionSnapshot = {
      timestamp: Date.now(),
      seq: view.getUint32(1, true),
      pos: {
        x: view.getFloat32(5, true),
        y: view.getFloat32(9, true),
        z: view.getFloat32(13, true),
      },
      vel: {
        x: view.getFloat32(17, true),
        y: view.getFloat32(21, true),
        z: view.getFloat32(25, true),
      },
      orientation: {
        x: view.getFloat32(29, true),
        y: view.getFloat32(33, true),
        z: view.getFloat32(37, true),
        w: view.getFloat32(41, true),
      },
      ballState: view.getUint8(45),
    };

    let player = this.remotePlayers.get(playerId);
    if (!player) {
      const playerInfo = this.players.get(playerId);
      if (!playerInfo) return;

      player = {
        id: playerId,
        username: playerInfo.username,
        colorIndex: this.remotePlayers.size % 16,
        positionBuffer: [],
        lastUpdateTime: Date.now(),
      };
      this.remotePlayers.set(playerId, player);
    }

    player.positionBuffer.push(snapshot);
    if (player.positionBuffer.length > 3) {
      player.positionBuffer.shift();
    }
    player.lastUpdateTime = Date.now();
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case MessageType.JOINED:
        this.handleJoined(message as JoinedMessage);
        break;
      case MessageType.PLAYER_JOINED:
        this.handlePlayerJoined(message as PlayerJoinedMessage);
        break;
      case MessageType.PLAYER_LEFT:
        this.handlePlayerLeft(message as PlayerLeftMessage);
        break;
      case MessageType.HOST_CHANGED:
        this.handleHostChanged(message as HostChangedMessage);
        break;
      case MessageType.SYNC_STATE:
        this.handleSyncState(message as SyncStateMessage);
        break;
      case MessageType.BANANA_COLLECTED:
        this.handleBananaCollected(message as BananaCollectedMessage);
        break;
      case MessageType.ERROR:
        this.handleError(message as ErrorMessage);
        break;
    }
  }

  private handleJoined(message: JoinedMessage): void {
    this.playerId = message.playerId;
    this.roomId = message.roomId;
    this.isHost = message.isHost;
    this.setState(ConnectionState.IN_ROOM);

    this.players.clear();
    for (const player of message.players) {
      this.players.set(player.id, player);
    }

    console.log(`joined room ${this.roomId} as ${this.isHost ? 'HOST' : 'CLIENT'}`);
    console.log(`players: ${message.players.map(p => p.username).join(', ')}`);
  }

  private handlePlayerJoined(message: PlayerJoinedMessage): void {
    const player: PlayerInfo = {
      id: message.playerId,
      username: message.username,
      isHost: false,
    };
    this.players.set(message.playerId, player);
    console.log(`${message.username} joined (total: ${this.players.size})`);

    if (this.onPlayerJoined) {
      this.onPlayerJoined(player);
    }
  }

  private handlePlayerLeft(message: PlayerLeftMessage): void {
    this.players.delete(message.playerId);
    this.remotePlayers.delete(message.playerId);
    console.log(`${message.username} left`);

    if (this.onPlayerLeft) {
      this.onPlayerLeft(message.playerId);
    }
  }

  private handleHostChanged(message: HostChangedMessage): void {
    for (const player of this.players.values()) {
      player.isHost = player.id === message.newHostId;
    }

    this.isHost = this.playerId === message.newHostId;
    if (this.isHost) {
      console.log('You are now the host');
    }

    if (this.onHostChanged) {
      this.onHostChanged(message.newHostId);
    }
  }

  private handleSyncState(message: SyncStateMessage): void {
    this.pendingStateSync = message.data;
    console.log(`state sync: stage ${message.data.stageId}`);
  }

  private handleBananaCollected(message: BananaCollectedMessage): void {
    console.log(`banana collected: animGroupId=${message.animGroupId}, index=${message.index}`);
    if (this.onBananaCollected) {
      this.onBananaCollected(message.animGroupId, message.index);
    }
  }

  private handleError(message: ErrorMessage): void {
    console.error(`server error: ${message.code} ${message.message}`);
    this.setState(ConnectionState.ERROR);

    if (this.onError) {
      this.onError(message.code, message.message);
    }
  }

  private handleDisconnect(): void {
    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }

    console.log('disconnected');
    this.setState(ConnectionState.DISCONNECTED);
    this.socket = null;
  }
}