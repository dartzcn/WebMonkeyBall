export const PROTOCOL_VERSION = 1;

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  IN_ROOM = 'IN_ROOM',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}

export enum MessageType {
  // client -> server
  JOIN = 'join',
  LEAVE = 'leave',
  STATE_SYNC = 'state_sync',
  BANANA_COLLECTED = 'banana_collected',
  GOAL_REACHED = 'goal_reached',
  BONUS_CLEAR = 'bonus_clear',

  // server -> client
  JOINED = 'joined',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  HOST_CHANGED = 'host_changed',
  SYNC_STATE = 'sync_state',
  ERROR = 'error',
}

export interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
}

export interface PositionSnapshot {
  timestamp: number;
  seq: number;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  ballState: number;
}

export interface RemotePlayer {
  id: string;
  username: string;
  colorIndex: number;
  positionBuffer: PositionSnapshot[];
  lastUpdateTime: number;
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

export interface StateSyncMessage {
  type: MessageType.STATE_SYNC;
  version: number;
  data: StateSyncData;
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

export interface SyncStateMessage {
  type: MessageType.SYNC_STATE;
  version: number;
  data: StateSyncData;
}

export interface ErrorMessage {
  type: MessageType.ERROR;
  version: number;
  code: string;
  message: string;
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