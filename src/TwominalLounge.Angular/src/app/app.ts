import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LoungeCanvasComponent } from './components/lounge-canvas/lounge-canvas.component';
import { WhiteboardModalComponent } from './components/whiteboard-modal/whiteboard-modal.component';
import { BillingModalComponent } from './components/billing-modal/billing-modal.component';
import { RoomEditorModalComponent } from './components/room-editor-modal/room-editor-modal.component';
import { RoomSwitcherModalComponent } from './components/room-switcher-modal/room-switcher-modal.component';
import { DiagnosticsModalComponent } from './components/diagnostics-modal/diagnostics-modal.component';
import { TechStackModalComponent } from './components/tech-stack-modal/tech-stack-modal.component';
import { AvatarSelectorModalComponent } from './components/avatar-selector-modal/avatar-selector-modal.component';
import { LoungeApiService } from './services/lounge-api.service';
import { WebRtcMeshService } from './services/webrtc-mesh.service';
import {
  AnnotationPoint,
  AnnotationStroke,
  AnnotationTool,
  AvatarConfig,
  PeerState,
  RoomDetails,
  SharedCursor,
} from './models/lounge.models';
import { OrmLogService } from './services/orm-log.service';

interface ProximityPeerCard {
  peer: PeerState;
  volumePct: number;
  distance: number;
  inSameZone: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LoungeCanvasComponent,
    WhiteboardModalComponent,
    BillingModalComponent,
    RoomEditorModalComponent,
    RoomSwitcherModalComponent,
    DiagnosticsModalComponent,
    TechStackModalComponent,
    AvatarSelectorModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  @ViewChild(LoungeCanvasComponent) canvasComp?: LoungeCanvasComponent;
  @ViewChild('selfVideo') selfVideoRef?: ElementRef<HTMLVideoElement>;

  public isLoading = signal(true);
  public currentRoom = signal<RoomDetails | null>(null);

  // Lobby & Room Joining signals
  public joinCodeInput = signal('');
  public joinError = signal<string | null>(null);
  public isJoining = signal(false);

  // Lobby & Room Creation signals
  public createError = signal<string | null>(null);
  public isCreatingRoom = signal(false);
  public newRoomName = signal('');
  public newRoomCode = signal('');
  public newRoomDesc = signal('');
  public newRoomWidth = signal(30);
  public newRoomHeight = signal(20);

  // Directory of active rooms for lobby
  public publicRooms = signal<any[]>([]);
  public isLoadingPublicRooms = signal(false);
  public copyFeedback = signal<string | null>(null);

  // Modals signals
  public showWhiteboard = signal(false);
  public showBilling = signal(false);
  public showRoomEditor = signal(false);
  public showRoomSwitcher = signal(false);
  public showDiagnostics = signal(false);
  public showTechStack = signal(false);
  public showAvatarSelector = signal(false);
  public isVideoDockCollapsed = signal(false);
  public isBuildMode = signal(false);

  public toggleBuildMode(): void {
    this.isBuildMode.update((v) => !v);
  }

  public onLayoutSaved(updatedRoom: RoomDetails): void {
    this.currentRoom.set(updatedRoom);
  }

  public toggleVideoDock(): void {
    this.isVideoDockCollapsed.update(v => !v);
  }

  // Screen Presentation Stage
  public isScreenModalOpen = signal(false);
  public isScreenMinimized = signal(false);

  // Screen Share Annotations & Shared Cursors
  private _screenAnnotationCanvasRef?: ElementRef<HTMLCanvasElement>;
  private screenCanvasResizeObserver?: ResizeObserver;

  @ViewChild('screenAnnotationCanvas') set screenAnnotationCanvasRef(el: ElementRef<HTMLCanvasElement> | undefined) {
    this._screenAnnotationCanvasRef = el;
    if (this.screenCanvasResizeObserver) {
      this.screenCanvasResizeObserver.disconnect();
      this.screenCanvasResizeObserver = undefined;
    }
    if (el?.nativeElement) {
      setTimeout(() => this.redrawScreenCanvas(), 0);
      if (typeof ResizeObserver !== 'undefined' && el.nativeElement.parentElement) {
        this.screenCanvasResizeObserver = new ResizeObserver(() => {
          this.redrawScreenCanvas();
        });
        this.screenCanvasResizeObserver.observe(el.nativeElement.parentElement);
      }
    }
  }
  get screenAnnotationCanvasRef(): ElementRef<HTMLCanvasElement> | undefined {
    return this._screenAnnotationCanvasRef;
  }

  public screenVideoAspectRatio = signal<string | null>(null);
  public screenAnnotationTool = signal<AnnotationTool>('pointer');
  public screenAnnotationColor = signal('#14b8a6');
  public screenAnnotationSize = signal(4);
  public screenAnnotationsVisible = signal(true);
  public screenCursorsVisible = signal(true);
  public screenStrokes = signal<AnnotationStroke[]>([]);
  public activeScreenCursors = signal<SharedCursor[]>([]);

  public isDrawingOnScreen = false;
  private currentScreenStrokePoints: AnnotationPoint[] = [];
  private laserTrail: { x: number; y: number; time: number; color: string; size: number }[] = [];
  private laserAnimFrameId: any = null;
  private lastCursorSendTime = 0;
  private screenSubscriptions: Subscription[] = [];
  private cursorCleanInterval: any = null;

  // Sidebar signals
  public isSidebarOpen = signal(true);
  public activeSidebarTab = signal<'chat' | 'users' | 'logs'>('chat');
  public chatChannel = signal<'room' | 'proximity'>('proximity');
  public chatInput = '';

  // User Profile
  public userName = signal('Alex R.');
  public userColor = signal('#14b8a6');
  public userCharacter = signal('hoodie');
  public readonly avatarColors = ['#14b8a6', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981'];
  private colorIndex = 0;

  constructor(
    public api: LoungeApiService,
    public webrtc: WebRtcMeshService,
    public ormLog: OrmLogService
  ) {
    this.loadProfileFromStorage();
    this.setupScreenSubscriptions();
  }

  public loadProfileFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const savedName = localStorage.getItem('twominal_name') || localStorage.getItem('twominal_user_name');
      const savedAvatar = localStorage.getItem('twominal_avatar') || localStorage.getItem('twominal_character');
      const savedColor = localStorage.getItem('twominal_color');

      let userObj: any = null;
      const rawUser = localStorage.getItem('twominal_user') || localStorage.getItem('twominal_user_profile');
      if (rawUser) {
        try {
          userObj = JSON.parse(rawUser);
        } catch (_) {}
      }

      if (savedName && savedName.trim()) {
        this.userName.set(savedName.trim());
      } else if (userObj?.display_name || userObj?.name) {
        this.userName.set((userObj.display_name || userObj.name).trim());
      }

      const validArchetypes = ['hoodie', 'architect', 'director', 'engineer', 'designer', 'logician'];
      const chosenChar = savedAvatar || userObj?.avatar_config?.character;
      if (chosenChar && validArchetypes.includes(chosenChar)) {
        this.userCharacter.set(chosenChar);
      }

      const chosenColor = savedColor || userObj?.avatar_config?.hair_color;
      if (chosenColor) {
        this.userColor.set(chosenColor);
        const idx = this.avatarColors.indexOf(chosenColor);
        if (idx !== -1) {
          this.colorIndex = idx;
        }
      }
    } catch (e) {
      console.warn('Failed to load profile from localStorage:', e);
    }
  }

  public saveProfileToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const name = this.userName();
      const character = this.userCharacter();
      const color = this.userColor();

      localStorage.setItem('twominal_name', name);
      localStorage.setItem('twominal_avatar', character);
      localStorage.setItem('twominal_color', color);

      const currentUser = this.api.currentUser();
      const userPayload = {
        ...(currentUser || {}),
        display_name: name,
        avatar_config: {
          ...(currentUser?.avatar_config || {}),
          character,
          hair_color: color,
          outfit_color: color,
        },
      };
      localStorage.setItem('twominal_user', JSON.stringify(userPayload));
      localStorage.setItem('twominal_user_profile', JSON.stringify(userPayload));
    } catch (e) {
      console.warn('Failed to save profile to localStorage:', e);
    }
  }

  public setupScreenSubscriptions(): void {
    if (this.screenSubscriptions.length > 0) return;

    this.screenSubscriptions.push(
      this.api.peerCursors$.subscribe((cursor) => {
        if (cursor.stage === 'screen') {
          cursor.lastUpdated = Date.now();
          const current = this.activeScreenCursors();
          const existingIdx = current.findIndex((c) => c.peer_id === cursor.peer_id);
          if (existingIdx >= 0) {
            const updated = [...current];
            updated[existingIdx] = { ...cursor };
            this.activeScreenCursors.set(updated);
          } else {
            this.activeScreenCursors.set([...current, cursor]);
          }
        }
      })
    );

    this.screenSubscriptions.push(
      this.api.screenAnnotationStrokes$.subscribe((stroke) => {
        if (stroke.tool === 'laser') {
          const now = Date.now();
          for (const pt of stroke.points) {
            this.laserTrail.push({
              x: pt.x,
              y: pt.y,
              time: now,
              color: stroke.color,
              size: stroke.size || 4,
            });
          }
          this.ensureLaserAnimationRunning();
        } else {
          this.screenStrokes.update((curr) => [...curr, stroke]);
          this.redrawScreenCanvas();
        }
      })
    );

    this.screenSubscriptions.push(
      this.api.screenAnnotationsCleared$.subscribe(() => {
        this.screenStrokes.set([]);
        this.laserTrail = [];
        this.redrawScreenCanvas();
      })
    );

    if (typeof window !== 'undefined') {
      this.cursorCleanInterval = setInterval(() => {
        const now = Date.now();
        const active = this.activeScreenCursors().filter((c) => (c.lastUpdated ? now - c.lastUpdated < 3500 : true));
        if (active.length !== this.activeScreenCursors().length) {
          this.activeScreenCursors.set(active);
        }
      }, 1000);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      // Setup callback when screen sharing is stopped by browser's native banner
      this.webrtc.onScreenShareEnded = () => {
        this.isScreenModalOpen.set(false);
        this.api.sendMediaState(!this.webrtc.isMicEnabled(), !this.webrtc.isCameraEnabled(), false);
        this.api.appendSystemMessage('Screen sharing ended via browser controls.');
        this.ormLog.log('SCREEN_BROADCAST_STOP', { presenter: this.userName() });
      };

      // 1. Authenticate guest user with chosen character
      this.loadProfileFromStorage();
      const user = await this.api.loginGuest(this.userName(), {
        skin: 'tan',
        hair: 'short',
        hair_color: this.userColor(),
        outfit: 'hoodie',
        outfit_color: this.userColor(),
        hat: 'none',
        character: this.userCharacter(),
      });
      if (user.display_name) {
        this.userName.set(user.display_name);
      }
      if (user.avatar_config?.character) {
        this.userCharacter.set(user.avatar_config.character);
      }
      if (user.avatar_config?.hair_color) {
        this.userColor.set(user.avatar_config.hair_color);
      }
      this.saveProfileToStorage();

      // Listen to popstate (browser back/forward navigation)
      if (typeof window !== 'undefined') {
        window.addEventListener('popstate', () => {
          const roomCode = this.getRoomCodeFromUrl();
          if (roomCode) {
            if (this.currentRoom()?.slug !== roomCode) {
              this.switchRoom(roomCode);
            }
          } else if (this.currentRoom()) {
            this.leaveRoom(false);
          }
        });
      }

      // 2. Check if a room code or shared URL is in the current URL
      const roomCodeFromUrl = this.getRoomCodeFromUrl();
      if (roomCodeFromUrl) {
        // Automatically join room specified in shared URL or query param
        await this.joinRoomByCode(roomCodeFromUrl, false);
      } else {
        // STRICTLY NO DEFAULT ROOM: User starts in the Lobby
        this.currentRoom.set(null);
        await this.loadPublicRooms();
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Extracts room code or slug from query parameters, hash, or pathname
   */
  getRoomCodeFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      // 1. Check query param: ?room=code or ?code=code
      const search = window.location.search;
      if (search) {
        const params = new URLSearchParams(search);
        const q = params.get('room') || params.get('code');
        if (q && q.trim()) return q.trim().toLowerCase();
      }

      // 2. Check hash: #/room/code, #/code/code, or #room=code
      if (window.location.hash) {
        const hash = window.location.hash;
        const hashQueryMatch = hash.match(/[?&](?:room|code)=([a-zA-Z0-9_-]+)/i);
        if (hashQueryMatch && hashQueryMatch[1]) return hashQueryMatch[1].trim().toLowerCase();

        const hashPathMatch = hash.match(/#[/]*(?:room\/|code\/)?([a-zA-Z0-9_-]+)/i);
        if (hashPathMatch && hashPathMatch[1] && !['chat', 'users', 'logs'].includes(hashPathMatch[1])) {
          return hashPathMatch[1].trim().toLowerCase();
        }
      }

      // 3. Check pathname: /room/:slug
      const pathMatch = window.location.pathname.match(/\/room\/([a-zA-Z0-9_-]+)/i);
      if (pathMatch && pathMatch[1]) return pathMatch[1].trim().toLowerCase();
    } catch (_) {}
    return null;
  }

  /**
   * Parses room code out of either a raw room code or a full shared URL
   */
  parseRoomCodeFromInput(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
        const u = new URL(trimmed);
        const q = u.searchParams.get('room') || u.searchParams.get('code');
        if (q) return q.trim().toLowerCase();
        const hashMatch = u.hash.match(/[#/?&](?:room\/|code\/|room=|code=)?([a-zA-Z0-9_-]+)/);
        if (hashMatch && hashMatch[1]) return hashMatch[1].trim().toLowerCase();
        const pathMatch = u.pathname.match(/\/room\/([a-zA-Z0-9_-]+)/);
        if (pathMatch && pathMatch[1]) return pathMatch[1].trim().toLowerCase();
      }
    } catch (_) {}

    const queryMatch = trimmed.match(/[?&](?:room|code)=([a-zA-Z0-9_-]+)/i);
    if (queryMatch && queryMatch[1]) return queryMatch[1].trim().toLowerCase();

    const hashMatch = trimmed.match(/#[/]*(?:room\/)?([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) return hashMatch[1].trim().toLowerCase();

    const pathMatch = trimmed.match(/(?:^|\/)room\/([a-zA-Z0-9_-]+)/i);
    if (pathMatch && pathMatch[1]) return pathMatch[1].trim().toLowerCase();

    return trimmed.replace(/^[/#?]+/, '').trim().toLowerCase();
  }

  /**
   * Joins a room by room code or shared URL
   */
  async joinRoomByCode(rawCodeOrUrl: string, updateUrl = true): Promise<boolean> {
    const code = this.parseRoomCodeFromInput(rawCodeOrUrl);
    if (!code) {
      this.joinError.set('Please enter a valid room code or shared link.');
      return false;
    }

    this.isJoining.set(true);
    this.joinError.set(null);

    try {
      this.api.disconnect();
      const room = await this.api.getRoom(code);
      this.currentRoom.set(room);
      this.api.connectRoom(room.slug);

      if (updateUrl && typeof window !== 'undefined') {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('room', room.slug);
        window.history.pushState({ room: room.slug }, '', nextUrl.toString());
      }

      this.joinCodeInput.set('');
      this.api.appendSystemMessage(`Entered room "${room.name}" (Code: ${room.slug})`);
      this.ormLog.log('JOINED_ROOM', { slug: room.slug, name: room.name });
      return true;
    } catch (err: any) {
      console.error('Failed to join room:', err);
      this.joinError.set(`Room "${code}" not found. Please verify your code or create a new room.`);
      return false;
    } finally {
      this.isJoining.set(false);
    }
  }

  /**
   * Creates a new dedicated room and immediately connects to it
   */
  async createAndEnterRoom(): Promise<void> {
    const name = this.newRoomName().trim();
    if (!name) {
      this.createError.set('Please provide a name for your lounge room.');
      return;
    }

    this.isCreatingRoom.set(true);
    this.createError.set(null);

    try {
      const room = await this.api.createRoom(
        name,
        this.newRoomDesc().trim(),
        this.newRoomWidth(),
        this.newRoomHeight(),
        this.newRoomCode().trim() || undefined
      );

      this.currentRoom.set(room);
      this.api.connectRoom(room.slug);

      if (typeof window !== 'undefined') {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('room', room.slug);
        window.history.pushState({ room: room.slug }, '', nextUrl.toString());
      }

      this.newRoomName.set('');
      this.newRoomCode.set('');
      this.newRoomDesc.set('');

      this.api.appendSystemMessage(`Created and entered new lounge "${room.name}" (Code: ${room.slug})`);
      this.ormLog.log('CREATED_ROOM', { slug: room.slug, name: room.name });
    } catch (err) {
      console.error('Failed to create room:', err);
      this.createError.set('Could not create room. Please try again or choose a different room code.');
    } finally {
      this.isCreatingRoom.set(false);
    }
  }

  async switchRoom(slug: string): Promise<void> {
    await this.joinRoomByCode(slug, true);
  }

  /**
   * Leaves the active room, disconnects audio/video, and returns to the Lobby
   */
  leaveRoom(updateUrl = true): void {
    this.api.disconnect();
    this.currentRoom.set(null);

    if (updateUrl && typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('room');
      nextUrl.searchParams.delete('code');
      window.history.pushState({}, '', nextUrl.pathname);
    }

    this.loadPublicRooms();
    this.ormLog.log('LEFT_ROOM', { user: this.userName() });
  }

  async loadPublicRooms(): Promise<void> {
    this.isLoadingPublicRooms.set(true);
    try {
      const list = await this.api.listRooms();
      this.publicRooms.set(list || []);
    } catch (err) {
      console.warn('Failed to load public rooms:', err);
      this.publicRooms.set([]);
    } finally {
      this.isLoadingPublicRooms.set(false);
    }
  }

  sendChatMessage(): void {
    const text = this.chatInput.trim();
    if (!text) return;

    this.api.sendChat(text, this.chatChannel());
    this.chatInput = '';
  }

  async toggleMic(): Promise<void> {
    const micState = await this.webrtc.toggleMic();
    this.api.sendMediaState(!micState, !this.webrtc.isCameraEnabled(), this.webrtc.isScreenSharing());
    this.ormLog.log('AUDIO_STATE_CHANGED', { active: micState });
  }

  async toggleCam(): Promise<void> {
    const camState = await this.webrtc.toggleCam();
    if (!camState && this.selfVideoRef?.nativeElement) {
      try {
        this.selfVideoRef.nativeElement.pause();
        this.selfVideoRef.nativeElement.srcObject = null;
      } catch (_) {}
    }
    this.api.sendMediaState(!this.webrtc.isMicEnabled(), !camState, this.webrtc.isScreenSharing());
    this.ormLog.log(camState ? 'WEBCAM_STREAM_ACQUIRED' : 'WEBCAM_STOPPED', { active: camState });
  }

  async toggleMusic(): Promise<void> {
    await this.api.spatialAudio.toggleLofiMusic();
    this.ormLog.log('LOFI_MUSIC_TOGGLE', { playing: this.api.spatialAudio.isLofiPlaying() });
  }

  async toggleScreen(): Promise<void> {
    if (this.webrtc.isScreenSharing()) {
      this.webrtc.stopScreenShare();
      this.isScreenModalOpen.set(false);
      this.api.sendMediaState(!this.webrtc.isMicEnabled(), !this.webrtc.isCameraEnabled(), false);
      this.api.appendSystemMessage('Screen sharing session ended.');
      this.ormLog.log('SCREEN_BROADCAST_STOP', { presenter: this.userName() });
    } else {
      const stream = await this.webrtc.startScreenShare();
      if (stream) {
        this.isScreenModalOpen.set(true);
        this.isScreenMinimized.set(false);
        this.api.sendMediaState(!this.webrtc.isMicEnabled(), !this.webrtc.isCameraEnabled(), true);
        this.api.appendSystemMessage('Screen sharing session initiated. Presentation broadcast mode enabled.');
        this.ormLog.log('SCREEN_BROADCAST_START', { presenter: this.userName() });

        // Ensure peer connections with all lounge members so they receive the live screen broadcast
        for (const peerId of this.api.peers().keys()) {
          this.webrtc.ensurePeerConnection(peerId);
        }
      } else {
        this.api.appendSystemMessage('Screen sharing could not be started or was cancelled.');
      }
    }
  }

  openPresentationStage(): void {
    this.isScreenMinimized.set(false);
    this.isScreenModalOpen.set(true);
    for (const [peerId, peer] of this.api.peers().entries()) {
      if (peer.screen_sharing) {
        this.webrtc.ensurePeerConnection(peerId);
      }
    }
  }

  retryPresenterStream(): void {
    for (const [peerId, peer] of this.api.peers().entries()) {
      if (peer.screen_sharing) {
        this.webrtc.ensurePeerConnection(peerId);
      }
    }
  }

  toggleFullscreenScreenShare(): void {
    const container = document.getElementById('screen-share-stage-container');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch((err) => {
        console.warn('Could not enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  activeScreenPresenter(): { isLocal: boolean; peerId?: string; name: string; stream: MediaStream | null } | null {
    if (this.webrtc.isScreenSharing() && this.webrtc.localScreenStream()) {
      return {
        isLocal: true,
        name: `${this.userName()} (You)`,
        stream: this.webrtc.localScreenStream(),
      };
    }

    for (const [peerId, peer] of this.api.peers().entries()) {
      if (peer.screen_sharing) {
        const stream = this.webrtc.remoteStreams().get(peerId) || null;
        const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
        return {
          isLocal: false,
          peerId,
          name: peer.display_name,
          stream: hasVideo ? stream : null,
        };
      }
    }

    return null;
  }

  sendEmote(emoji: string): void {
    this.api.sendEmote(emoji);
  }

  async cycleAvatarColor(): Promise<void> {
    this.colorIndex = (this.colorIndex + 1) % this.avatarColors.length;
    const newColor = this.avatarColors[this.colorIndex];
    this.userColor.set(newColor);
    this.saveProfileToStorage();

    const user = this.api.currentUser();
    const currentAvatar: AvatarConfig = (user?.avatar_config as any) || {
      skin: 'tan',
      hair: 'short',
      hair_color: newColor,
      outfit: 'hoodie',
      outfit_color: newColor,
      hat: 'none',
      character: this.userCharacter(),
    };
    currentAvatar.hair_color = newColor;
    currentAvatar.outfit_color = newColor;
    currentAvatar.character = this.userCharacter();

    try {
      await this.api.updateUserProfile(this.userName(), currentAvatar);
    } catch (e) {
      console.warn('Profile update error:', e);
    }
  }

  async onAvatarCustomized(event: { character: string; color: string; displayName: string }): Promise<void> {
    this.userCharacter.set(event.character);
    this.userColor.set(event.color);
    this.userName.set(event.displayName);
    const colorIdx = this.avatarColors.indexOf(event.color);
    if (colorIdx !== -1) {
      this.colorIndex = colorIdx;
    }
    this.saveProfileToStorage();

    const currentAvatar: AvatarConfig = {
      skin: 'tan',
      hair: 'short',
      hair_color: event.color,
      outfit: 'hoodie',
      outfit_color: event.color,
      hat: 'none',
      character: event.character,
    };

    const user = this.api.currentUser();
    if (user) {
      this.api.currentUser.set({
        ...user,
        display_name: event.displayName,
        avatar_config: currentAvatar,
      });
    }

    try {
      if (user) {
        await this.api.updateUserProfile(event.displayName, currentAvatar);
      }
      this.ormLog.log('AVATAR_EQUIPPED', {
        character: event.character,
        color: event.color,
        user: event.displayName,
      });
      this.api.appendSystemMessage(`Equipped avatar archetype: ${event.character.toUpperCase()}`);
    } catch (e) {
      console.warn('Avatar customization update error:', e);
    }
  }

  async onDisplayNameChange(newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) return;
    this.userName.set(trimmed);
    this.saveProfileToStorage();

    const user = this.api.currentUser();
    const currentAvatar: AvatarConfig = (user?.avatar_config as any) || {
      skin: 'tan',
      hair: 'short',
      hair_color: this.userColor(),
      outfit: 'hoodie',
      outfit_color: this.userColor(),
      hat: 'none',
      character: this.userCharacter(),
    };
    currentAvatar.character = this.userCharacter();

    try {
      await this.api.updateUserProfile(trimmed, currentAvatar);
    } catch (e) {
      console.warn('Display name update error:', e);
    }
  }

  copyRoomCode(): void {
    const slug = this.currentRoom()?.slug;
    if (!slug) return;
    this.copyToClipboard(slug, `Room code "${slug}" copied to clipboard!`);
    this.ormLog.log('ROOM_CODE_COPIED', { code: slug });
  }

  copyInviteLink(): void {
    const slug = this.currentRoom()?.slug;
    if (!slug) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const url = `${origin}${path}?room=${slug}`;
    this.copyToClipboard(url, 'Lounge invite link copied to clipboard!');
    this.ormLog.log('INVITE_LINK_COPIED', { url, room: slug });
  }

  private copyToClipboard(text: string, notificationMsg: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else if (typeof document !== 'undefined') {
      try {
        const dummy = document.createElement('input');
        document.body.appendChild(dummy);
        dummy.value = text;
        dummy.select();
        if (typeof (document as any).execCommand === 'function') {
          (document as any).execCommand('copy');
        }
        document.body.removeChild(dummy);
      } catch (_) {}
    }
    this.api.appendSystemMessage(notificationMsg);
    this.copyFeedback.set(notificationMsg);
    setTimeout(() => this.copyFeedback.set(null), 3500);
  }

  /**
   * Returns list of peers that are currently in audio/video proximity
   */
  proximityPeers(): ProximityPeerCard[] {
    const list: ProximityPeerCard[] = [];
    const proxMap = this.api.proximityList();
    const peers = this.api.peers();
    const localZone = this.canvasComp?.currentPrivateZoneName() || null;
    const playerX = this.canvasComp?.playerX ?? 15;
    const playerY = this.canvasComp?.playerY ?? 10;

    for (const [peerId, peer] of peers.entries()) {
      const info = proxMap.get(peerId);
      const inSamePrivateRoom = !!(
        peer.private_zone_id &&
        localZone &&
        (peer.private_zone_id === localZone || peer.private_zone_id.includes(localZone.toLowerCase().slice(0, 4)))
      );

      let inRange = false;
      let vol = 0;
      let dist = 1.5;

      if (info) {
        inRange = info.in_range || inSamePrivateRoom;
        dist = info.distance;
        vol = inSamePrivateRoom ? 100 : Math.round(info.volume * 100);
      } else {
        // Fallback proximity computation if server proximity info is pending
        const dx = peer.x - playerX;
        const dy = peer.y - playerY;
        dist = Math.hypot(dx, dy);
        inRange = inSamePrivateRoom || dist <= 4.0;
        if (inSamePrivateRoom) {
          vol = 100;
        } else {
          const norm = Math.min(1.0, dist / 4.5);
          vol = Math.round((1.0 - norm) * (1.0 - norm) * 100);
        }
      }

      if (inRange) {
        list.push({
          peer,
          volumePct: vol,
          distance: dist,
          inSameZone: inSamePrivateRoom,
        });
      }
    }

    return list;
  }

  remoteStreamFor(peerId: string): MediaStream | undefined {
    return this.webrtc.remoteStreams().get(peerId);
  }

  setAnnotationTool(tool: AnnotationTool): void {
    this.screenAnnotationTool.set(tool);
    if (tool === 'laser') {
      this.ensureLaserAnimationRunning();
    }
  }

  toggleScreenAnnotationsVisibility(): void {
    this.screenAnnotationsVisible.set(!this.screenAnnotationsVisible());
    if (this.screenAnnotationsVisible()) {
      setTimeout(() => this.redrawScreenCanvas(), 50);
    }
  }

  toggleScreenCursorsVisibility(): void {
    this.screenCursorsVisible.set(!this.screenCursorsVisible());
  }

  undoScreenAnnotation(): void {
    const strokes = this.screenStrokes();
    if (strokes.length > 0) {
      this.screenStrokes.set(strokes.slice(0, -1));
      this.redrawScreenCanvas();
    }
  }

  clearScreenAnnotations(): void {
    this.screenStrokes.set([]);
    this.laserTrail = [];
    this.redrawScreenCanvas();
    this.api.clearScreenAnnotations();
  }

  onScreenStagePointerMove(e: PointerEvent): void {
    const target = e.currentTarget as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const now = Date.now();
    if (now - this.lastCursorSendTime > 40) {
      this.lastCursorSendTime = now;
      this.api.sendCursorMove('screen', nx, ny);
    }
  }

  onScreenStagePointerLeave(): void {
    // Optional placeholder when pointer leaves screen area
  }

  onScreenVideoMetadata(e: Event): void {
    const video = e.target as HTMLVideoElement;
    if (video && video.videoWidth && video.videoHeight) {
      this.screenVideoAspectRatio.set(`${video.videoWidth} / ${video.videoHeight}`);
      setTimeout(() => this.redrawScreenCanvas(), 50);
    }
  }

  onScreenAnnotationPointerDown(e: PointerEvent): void {
    const canvas = this.screenAnnotationCanvasRef?.nativeElement;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const tool = this.screenAnnotationTool();
    if (tool === 'pointer') return;

    if (tool === 'eraser') {
      this.eraseStrokesNear(nx, ny);
      return;
    }

    this.isDrawingOnScreen = true;
    this.currentScreenStrokePoints = [{ x: nx, y: ny, timestamp: Date.now() }];

    if (tool === 'laser') {
      this.laserTrail.push({
        x: nx,
        y: ny,
        time: Date.now(),
        color: this.screenAnnotationColor(),
        size: this.screenAnnotationSize(),
      });
      this.ensureLaserAnimationRunning();
    } else {
      this.redrawScreenCanvas();
    }
  }

  onScreenAnnotationPointerMove(e: PointerEvent): void {
    const canvas = this.screenAnnotationCanvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const now = Date.now();
    if (now - this.lastCursorSendTime > 40) {
      this.lastCursorSendTime = now;
      this.api.sendCursorMove('screen', nx, ny);
    }

    const tool = this.screenAnnotationTool();
    if (tool === 'eraser' && e.buttons === 1) {
      this.eraseStrokesNear(nx, ny);
      return;
    }

    if (!this.isDrawingOnScreen) return;

    this.currentScreenStrokePoints.push({ x: nx, y: ny, timestamp: now });

    if (tool === 'laser') {
      this.laserTrail.push({
        x: nx,
        y: ny,
        time: now,
        color: this.screenAnnotationColor(),
        size: this.screenAnnotationSize(),
      });
      this.ensureLaserAnimationRunning();

      if (this.currentScreenStrokePoints.length % 3 === 0) {
        this.api.sendScreenAnnotation({
          id: 'laser-' + now,
          tool: 'laser',
          color: this.screenAnnotationColor(),
          size: this.screenAnnotationSize(),
          points: [{ x: nx, y: ny }],
          createdAt: now,
        });
      }
    } else {
      this.redrawScreenCanvas();
    }
  }

  onScreenAnnotationPointerUp(e: PointerEvent): void {
    const canvas = this.screenAnnotationCanvasRef?.nativeElement;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    if (!this.isDrawingOnScreen) return;
    this.isDrawingOnScreen = false;

    const tool = this.screenAnnotationTool();
    if (tool === 'laser') {
      if (this.currentScreenStrokePoints.length > 0) {
        this.api.sendScreenAnnotation({
          id: 'laser-' + Date.now(),
          tool: 'laser',
          color: this.screenAnnotationColor(),
          size: this.screenAnnotationSize(),
          points: this.currentScreenStrokePoints,
          createdAt: Date.now(),
        });
      }
      this.currentScreenStrokePoints = [];
      return;
    }

    if (tool === 'pointer' || tool === 'eraser') {
      this.currentScreenStrokePoints = [];
      return;
    }

    if (this.currentScreenStrokePoints.length >= 1) {
      const stroke: AnnotationStroke = {
        id: 'stroke-' + Math.random().toString(36).substring(2, 9),
        tool,
        color: this.screenAnnotationColor(),
        size: this.screenAnnotationSize(),
        points: [...this.currentScreenStrokePoints],
        createdAt: Date.now(),
      };
      this.screenStrokes.update((s) => [...s, stroke]);
      this.api.sendScreenAnnotation(stroke);
    }
    this.currentScreenStrokePoints = [];
    this.redrawScreenCanvas();
  }

  eraseStrokesNear(nx: number, ny: number): void {
    const threshold = 0.04;
    const remaining = this.screenStrokes().filter((s) => {
      for (const pt of s.points) {
        const dist = Math.hypot(pt.x - nx, pt.y - ny);
        if (dist < threshold) return false;
      }
      return true;
    });
    if (remaining.length !== this.screenStrokes().length) {
      this.screenStrokes.set(remaining);
      this.redrawScreenCanvas();
    }
  }

  redrawScreenCanvas(): void {
    if (!this.screenAnnotationsVisible()) return;
    const canvas = this.screenAnnotationCanvasRef?.nativeElement;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;

    for (const stroke of this.screenStrokes()) {
      this.renderStroke(ctx, stroke, w, h);
    }

    if (this.isDrawingOnScreen && this.currentScreenStrokePoints.length > 0) {
      const activeTool = this.screenAnnotationTool();
      if (activeTool !== 'laser' && activeTool !== 'pointer') {
        const inProgressStroke: AnnotationStroke = {
          id: 'temp',
          tool: activeTool,
          color: this.screenAnnotationColor(),
          size: this.screenAnnotationSize(),
          points: this.currentScreenStrokePoints,
          createdAt: Date.now(),
        };
        this.renderStroke(ctx, inProgressStroke, w, h);
      }
    }

    this.renderLaserTrail(ctx, w, h);
  }

  private renderStroke(ctx: CanvasRenderingContext2D, stroke: AnnotationStroke, w: number, h: number): void {
    if (stroke.points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * 3;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
    }

    if (stroke.tool === 'arrow') {
      const start = stroke.points[0];
      const end = stroke.points[stroke.points.length - 1];
      const x1 = start.x * w;
      const y1 = start.y * h;
      const x2 = end.x * w;
      const y2 = end.y * h;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(12, stroke.size * 3.5);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (stroke.tool === 'rect') {
      const start = stroke.points[0];
      const end = stroke.points[stroke.points.length - 1];
      const x = Math.min(start.x, end.x) * w;
      const y = Math.min(start.y, end.y) * h;
      const rw = Math.abs(end.x - start.x) * w;
      const rh = Math.abs(end.y - start.y) * h;

      ctx.beginPath();
      ctx.rect(x, y, rw, rh);
      ctx.stroke();
    } else {
      ctx.beginPath();
      const first = stroke.points[0];
      if (stroke.points.length === 1) {
        ctx.arc(first.x * w, first.y * h, Math.max(1, stroke.size / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(first.x * w, first.y * h);
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          ctx.lineTo(pt.x * w, pt.y * h);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private renderLaserTrail(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const now = Date.now();
    const lifetime = 1200;

    for (let i = 0; i < this.laserTrail.length; i++) {
      const p = this.laserTrail[i];
      const age = now - p.time;
      if (age < lifetime) {
        const alpha = Math.max(0, 1 - age / lifetime);
        const radius = Math.max(3, (p.size || 4) * (1 + (1 - alpha)));

        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private ensureLaserAnimationRunning(): void {
    if (this.laserAnimFrameId) return;

    const loop = () => {
      const now = Date.now();
      this.laserTrail = this.laserTrail.filter((p) => now - p.time < 1200);

      if (this.laserTrail.length > 0 || this.isDrawingOnScreen) {
        this.redrawScreenCanvas();
        this.laserAnimFrameId = requestAnimationFrame(loop);
      } else {
        this.laserAnimFrameId = null;
        this.redrawScreenCanvas();
      }
    };
    this.laserAnimFrameId = requestAnimationFrame(loop);
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  ngOnDestroy(): void {
    if (this.selfVideoRef?.nativeElement) {
      try {
        this.selfVideoRef.nativeElement.pause();
        this.selfVideoRef.nativeElement.srcObject = null;
      } catch (_) {}
    }
    this.screenSubscriptions.forEach((s) => s.unsubscribe());
    if (this.screenCanvasResizeObserver) {
      this.screenCanvasResizeObserver.disconnect();
      this.screenCanvasResizeObserver = undefined;
    }
    if (this.cursorCleanInterval) {
      clearInterval(this.cursorCleanInterval);
      this.cursorCleanInterval = null;
    }
    if (this.laserAnimFrameId) {
      cancelAnimationFrame(this.laserAnimFrameId);
      this.laserAnimFrameId = null;
    }
    this.webrtc.disconnectAll();
  }
}
