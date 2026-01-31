import type { WebSocket } from 'ws';

export const PROTOCOL_VERSION = 1;

export const MAX_PLAYERS_PER_ROOM = 16;
export const ROOM_ID_LENGTH = 6;

export enum MessageType {
  JOIN = 'join',
  LEAVE = 'leave',
  POSITION_UPDATE = 'position_update',
  STATE_SYNC = 'state_sync',
  BANANA_COLLECTED = 'banana_collected',
  GOAL_REACHED = 'goal_reached',
  BONUS_CLEAR = 'bonus_clear',

  JOINED = 'joined',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  HOST_CHANGED = 'host_changed',
  PLAYER_POSITION = 'player_position',
  SYNC_STATE = 'sync_state',
  ERROR = 'error',
}

export enum ErrorCode {
  ROOM_FULL = 'ROOM_FULL',
  INVALID_ROOM = 'INVALID_ROOM',
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  ALREADY_IN_ROOM = 'ALREADY_IN_ROOM',
}

export interface PlayerConnection {
  id: string;
  username: string;
  socket: WebSocket;
  isHost: boolean;
  joinedAt: number;
  lastActivity: number;
}

export interface Room {
  id: string;
  hostId: string;
  players: Map<string, PlayerConnection>;
  maxPlayers: number;
  currentStageId: number | null;
  lastStateSync: StateSyncData | null;
  createdAt: number;
}

export interface JoinMessage {
  type: MessageType.JOIN;
  version: number;
  roomId: string;
  username: string;
}

export interface LeaveMessage {
  type: MessageType.LEAVE;
  version: number;
}

export interface PositionUpdateData {
  seq: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  orientX: number;
  orientY: number;
  orientZ: number;
  orientW: number;
  ballState: number;
}

export interface StateSyncData {
  stageId: number;
  stageTimerFrames: number;
  bananas: Array<{
    animGroupId: number;
    index: number;
    collected: boolean;
  }>;
  switches: Array<{
    animGroupId: number;
    pressed: boolean;
  }>;
  courseState?: {
    currentIndex?: number;
    currentFloor?: number;
    currentStageName?: string;
    scriptIndex?: number;
  };
}

export interface StateSyncMessage {
  type: MessageType.STATE_SYNC;
  version: number;
  data: StateSyncData;
}

export interface BananaCollectedMessage {
  type: MessageType.BANANA_COLLECTED;
  version: number;
  animGroupId: number;
  index: number;
}

export interface GoalReachedMessage {
  type: MessageType.GOAL_REACHED;
  version: number;
  goalType: string;
}

export interface BonusClearMessage {
  type: MessageType.BONUS_CLEAR;
  version: number;
}

export interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
}

export interface JoinedMessage {
  type: MessageType.JOINED;
  version: number;
  playerId: string;
  roomId: string;
  isHost: boolean;
  players: PlayerInfo[];
  stageState: StateSyncData | null;
}

export interface PlayerJoinedMessage {
  type: MessageType.PLAYER_JOINED;
  version: number;
  playerId: string;
  username: string;
}

export interface PlayerLeftMessage {
  type: MessageType.PLAYER_LEFT;
  version: number;
  playerId: string;
  username: string;
}

export interface HostChangedMessage {
  type: MessageType.HOST_CHANGED;
  version: number;
  newHostId: string;
  stageState: StateSyncData | null;
}

export interface PlayerPositionData extends PositionUpdateData {
  playerId: string;
}

export interface SyncStateMessage {
  type: MessageType.SYNC_STATE;
  version: number;
  data: StateSyncData;
}

export interface ErrorMessage {
  type: MessageType.ERROR;
  version: number;
  code: ErrorCode;
  message: string;
}

export type ServerMessage =
  | JoinedMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | HostChangedMessage
  | SyncStateMessage
  | BananaCollectedMessage
  | GoalReachedMessage
  | BonusClearMessage
  | ErrorMessage;

export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | StateSyncMessage
  | BananaCollectedMessage
  | GoalReachedMessage
  | BonusClearMessage;

export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePlayerId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

export function isValidRoomId(roomId: string): boolean {
  return typeof roomId === 'string' &&
         roomId.length === ROOM_ID_LENGTH &&
         /^[A-Z0-9]+$/.test(roomId);
}

export function isValidUsername(username: string): boolean {
  return typeof username === 'string' &&
         username.length > 0 &&
         username.length <= 16 &&
         username.trim().length > 0;
}
