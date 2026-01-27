import type { FastifyInstance } from 'fastify';
import { RoomManager } from './room-manager.js';
import {
  type JoinMessage,
  type LeaveMessage,
  type StateSyncMessage,
  MessageType,
  ErrorCode,
  PROTOCOL_VERSION,
} from './types.js';

export class MultiplayerServer {
  private roomManager: RoomManager;

  constructor() {
    this.roomManager = new RoomManager();
  }

  // register websocket
  async register(fastify: FastifyInstance): Promise<void> {
    await fastify.register(require('@fastify/websocket'));

    // multiplayer route
    fastify.register(async (fastify) => {
      fastify.get('/multiplayer', { websocket: true }, (connection: any, request: any) => {
        const socket = connection.socket || connection;
        this.handleConnection(socket);
      });
    });

    // server stats (todo)
    fastify.get('/multiplayer/stats', async () => {
      return this.roomManager.getStats();
    });

    console.log('multiplayer server registered on /multiplayer');
  }

  // handle websocket connection
  private handleConnection(socket: any): void {
    let playerId: string | null = null;

    console.log('new WebSocket connection');

    socket.on('message', (data: Buffer) => {
      try {
        if (data[0] === 0x01) {
          if (playerId) {
            this.roomManager.broadcastPosition(playerId, data);
          }
        } else {
          const message = JSON.parse(data.toString());
          console.log('received:', message.type, message);
          this.handleMessage(socket, message, (id) => {
            playerId = id;
            console.log('player id set:', id.slice(0, 8));
          });
        }
      } catch (error) {
        console.error('error:', error);
        this.sendError(socket, ErrorCode.INVALID_MESSAGE, 'Invalid message format');
      }
    });

    // disconnect
    socket.on('close', () => {
      console.log(`closed: ${playerId || 'unknown'}`);
      if (playerId) {
        this.roomManager.removePlayer(playerId);
      }
    });

    // errors
    socket.on('error', (error: Error) => {
      console.error('error:', error);
      if (playerId) {
        this.roomManager.removePlayer(playerId);
      }
    });
  }

  // messages
  private handleMessage(
    socket: any,
    message: any,
    setPlayerId: (id: string) => void
  ): void {
    if (message.version !== PROTOCOL_VERSION) {
      this.sendError(socket, ErrorCode.VERSION_MISMATCH,
        `Protocol version mismatch. Server: ${PROTOCOL_VERSION}, Client: ${message.version}`);
      return;
    }

    switch (message.type) {
      case MessageType.JOIN:
        this.handleJoin(socket, message as JoinMessage, setPlayerId);
        break;

      case MessageType.LEAVE:
        this.handleLeave(message as LeaveMessage);
        break;

      case MessageType.STATE_SYNC:
        this.handleStateSync(message as StateSyncMessage);
        break;

      default:
        this.sendError(socket, ErrorCode.INVALID_MESSAGE, `Unknown message type: ${message.type}`);
    }
  }

  private handleJoin(
    socket: any,
    message: JoinMessage,
    setPlayerId: (id: string) => void
  ): void {
    console.log(`join request username=${message.username} roomId=${message.roomId}`);

    const result = this.roomManager.addPlayerToRoom(
      message.roomId,
      message.username,
      socket
    );

    if (result.success && result.playerId) {
      console.log(`join successful, player ID: ${result.playerId.slice(0, 8)}`);
      setPlayerId(result.playerId);
    } else if (result.error) {
      console.log(`join failed: ${result.error.code} ${result.error.message}`);
      this.sendError(socket, result.error.code, result.error.message);
    }
  }

  private handleLeave(message: LeaveMessage): void {
    // stub
  }

  private handleStateSync(message: StateSyncMessage): void {
    // stub
  }

  private sendError(socket: any, code: ErrorCode, message: string): void {
    const errorMsg = {
      type: MessageType.ERROR,
      version: PROTOCOL_VERSION,
      code,
      message,
    };
    socket.send(JSON.stringify(errorMsg));
  }

  async shutdown(): Promise<void> {
    this.roomManager.destroy();
    console.log('Multiplayer server shut down!');
  }
}