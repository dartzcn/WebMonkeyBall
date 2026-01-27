import { MultiplayerClient } from './client.js';
import { ConnectionState } from './types.js';

export class MultiplayerUI {
  private client: MultiplayerClient;
  private usernameInput: HTMLInputElement;
  private roomcodeInput: HTMLInputElement;
  private createButton: HTMLButtonElement;
  private joinButton: HTMLButtonElement;
  private leaveButton: HTMLButtonElement;
  private statusDiv: HTMLElement;
  private roomDisplay: HTMLElement;
  private playerCountSpan: HTMLElement;

  constructor(client: MultiplayerClient) {
    this.client = client;

    this.usernameInput = document.getElementById('mp-username') as HTMLInputElement;
    this.roomcodeInput = document.getElementById('mp-roomcode') as HTMLInputElement;
    this.createButton = document.getElementById('mp-create') as HTMLButtonElement;
    this.joinButton = document.getElementById('mp-join') as HTMLButtonElement;
    this.leaveButton = document.getElementById('mp-leave') as HTMLButtonElement;
    this.statusDiv = document.getElementById('mp-status') as HTMLElement;
    this.roomDisplay = document.getElementById('mp-room-display') as HTMLElement;
    this.playerCountSpan = document.getElementById('mp-player-count') as HTMLElement;

    this.setupEventListeners();
    this.setupClientCallbacks();
  }

  private setupEventListeners(): void {
    this.createButton.addEventListener('click', () => {
      this.handleCreateRoom();
    });

    this.joinButton.addEventListener('click', () => {
      this.handleJoinRoom();
    });

    this.leaveButton.addEventListener('click', () => {
      this.handleLeave();
    });
    
    this.roomcodeInput.addEventListener('input', () => {
      this.roomcodeInput.value = this.roomcodeInput.value.toUpperCase();
    });
  }

  private setupClientCallbacks(): void {
    this.client.setOnStateChange((state) => {
      this.updateUIState(state);
    });

    this.client.setOnPlayerJoined((player) => {
      console.log(`player joined: ${player.username}`);
      this.updatePlayerCount();
    });

    this.client.setOnPlayerLeft((playerId) => {
      console.log(`player left: ${playerId}`);
      this.updatePlayerCount();
    });

    this.client.setOnError((code, message) => {
      alert(`error: ${message}`);
    });
  }

  private handleCreateRoom(): void {
    const username = this.usernameInput.value.trim() || 'Player';

    const roomCode = this.generateRoomCode();
    this.roomcodeInput.value = roomCode;

    this.connect(roomCode, username);
  }

  private handleJoinRoom(): void {
    const username = this.usernameInput.value.trim() || 'Player';
    const roomCode = this.roomcodeInput.value.trim().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
      alert('Please enter a 6-character room code');
      return;
    }

    this.connect(roomCode, username);
  }

  private connect(roomCode: string, username: string): void {
    const serverUrl = `ws://${window.location.host}/multiplayer`;
    this.client.connect(serverUrl, roomCode, username);
  }

  private handleLeave(): void {
    this.client.disconnect();
  }

  private updateUIState(state: ConnectionState): void {
    const isInRoom = state === ConnectionState.IN_ROOM;

    this.usernameInput.disabled = isInRoom;
    this.roomcodeInput.disabled = isInRoom;
    this.createButton.disabled = isInRoom;
    this.joinButton.disabled = isInRoom;

    if (isInRoom) {
      this.statusDiv.classList.remove('hidden');
      this.roomDisplay.textContent = this.client.getRoomId() || '------';
      this.updatePlayerCount();
    } else {
      this.statusDiv.classList.add('hidden');
      this.roomDisplay.textContent = '------';
    }
  }

  private updatePlayerCount(): void {
    const players = this.client.getPlayers();
    this.playerCountSpan.textContent = `${players.length}/16`;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
