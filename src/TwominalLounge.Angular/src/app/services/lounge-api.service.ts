import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import {
  AuthResponse,
  AvatarConfig,
  BillingTier,
  ChatMessage,
  PeerState,
  ProximityInfo,
  RoomDetails,
  User,
  WhiteboardNote,
  SharedCursor,
  AnnotationStroke,
} from '../models/lounge.models';
import { SpatialAudioService } from './spatial-audio.service';
import { WebRtcMeshService } from './webrtc-mesh.service';
import { OrmLogService } from './orm-log.service';

@Injectable({
  providedIn: 'root',
})
export class LoungeApiService {
  private get baseUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.port === '4200') {
        return 'http://localhost:3000';
      }
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }

  private get wsBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.port === '4200') {
        return 'ws://localhost:3000';
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
    return 'ws://localhost:3000';
  }

  public currentUser = signal<User | null>(null);
  public currentRoom = signal<RoomDetails | null>(null);
  public peers = signal<Map<string, PeerState>>(new Map());
  public proximityList = signal<Map<string, ProximityInfo>>(new Map());
  public chatMessages = signal<ChatMessage[]>([]);
  public notes = signal<WhiteboardNote[]>([]);
  public isConnected = signal(false);
  public pingLatency = signal(0);
  public selfPeerId = signal<string>('');
  public localEmote = signal<string | null>(null);
  public localEmoteTimer = signal(0);

  public whiteboardStrokes$ = new Subject<any>();
  public peerCursors$ = new Subject<SharedCursor>();
  public screenAnnotationStrokes$ = new Subject<AnnotationStroke>();
  public screenAnnotationsCleared$ = new Subject<void>();
  public objectInteractions$ = new Subject<{ objectId: string; action: string; state: any }>();
  public peerEmoted$ = new Subject<{ peerId: string; emoji: string }>();

  private socket: WebSocket | null = null;
  private pingInterval?: any;
  private proximityCache = new Map<string, boolean>();

  constructor(
    private http: HttpClient,
    public spatialAudio: SpatialAudioService,
    public webrtcMesh: WebRtcMeshService,
    public ormLog: OrmLogService
  ) {}

  /**
   * Logs in or creates a guest session
   */
  async loginGuest(displayName?: string, avatarConfig?: any): Promise<User> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.baseUrl}/api/auth/guest`, {
        display_name: displayName,
        avatar_config: avatarConfig,
      })
    );
    this.currentUser.set(res.user);
    this.persistUserToStorage(res.user);
    this.ormLog.log('SESSION_INIT', {
      user_id: res.user.id,
      display_name: res.user.display_name,
      license: res.user.license_type,
    });
    return res.user;
  }

  public persistUserToStorage(user: User): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem('twominal_user', JSON.stringify(user));
      localStorage.setItem('twominal_user_profile', JSON.stringify(user));
      if (user.display_name) {
        localStorage.setItem('twominal_name', user.display_name);
      }
      if (user.avatar_config?.character) {
        localStorage.setItem('twominal_avatar', user.avatar_config.character);
      }
      if (user.avatar_config?.hair_color) {
        localStorage.setItem('twominal_color', user.avatar_config.hair_color);
      }
    } catch (e) {
      console.warn('Failed to save user to localStorage:', e);
    }
  }

  async listRooms(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/api/rooms`));
  }

  async getRoom(slug: string): Promise<RoomDetails> {
    const room = await firstValueFrom(this.http.get<RoomDetails>(`${this.baseUrl}/api/rooms/${slug}`));
    this.currentRoom.set(room);
    return room;
  }

  async createRoom(
    name: string,
    description: string,
    width: number = 30,
    height: number = 20,
    slug?: string
  ): Promise<RoomDetails> {
    const payload: any = {
      name,
      description,
      width,
      height,
    };
    if (slug && slug.trim()) {
      payload.slug = slug.trim().toLowerCase();
    }
    return firstValueFrom(
      this.http.post<RoomDetails>(`${this.baseUrl}/api/rooms`, payload)
    );
  }

  async updateRoomLayout(slug: string, req: Partial<RoomDetails['layout']>): Promise<void> {
    await firstValueFrom(this.http.put(`${this.baseUrl}/api/rooms/${slug}/layout`, req));
    await this.getRoom(slug);
  }

  async getBillingTiers(): Promise<BillingTier[]> {
    return firstValueFrom(this.http.get<BillingTier[]>(`${this.baseUrl}/api/billing/tiers`));
  }

  async activateRoom(slug: string, tierId: string, licenseKey?: string): Promise<any> {
    return firstValueFrom(
      this.http.post<any>(`${this.baseUrl}/api/billing/activate-room`, {
        room_slug: slug,
        tier_id: tierId,
        license_key: licenseKey,
      })
    );
  }

  async getRawConfig(): Promise<any> {
    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/api/config/raw`));
  }

  async updateUserProfile(displayName: string, avatarConfig: AvatarConfig): Promise<User> {
    const user = this.currentUser();
    if (!user) throw new Error('No current user');

    const updated = await firstValueFrom(
      this.http.put<User>(`${this.baseUrl}/api/auth/profile/${user.id}`, {
        display_name: displayName,
        avatar_config: avatarConfig,
      })
    );
    this.currentUser.set(updated);
    this.persistUserToStorage(updated);
    this.sendProfileUpdate(displayName, avatarConfig);
    this.ormLog.log('USER_PROFILE_UPDATE', { display_name: displayName, hair_color: avatarConfig.hair_color });
    return updated;
  }

  async fetchNotes(slug: string): Promise<WhiteboardNote[]> {
    const notes = await firstValueFrom(this.http.get<WhiteboardNote[]>(`${this.baseUrl}/api/rooms/${slug}/notes`));
    this.notes.set(notes);
    return notes;
  }

  async createNote(slug: string, content: string, colorClass: string): Promise<WhiteboardNote> {
    const user = this.currentUser();
    const authorName = user?.display_name || 'Alex';
    const note = await firstValueFrom(
      this.http.post<WhiteboardNote>(`${this.baseUrl}/api/rooms/${slug}/notes`, {
        author_name: authorName,
        content,
        color_class: colorClass,
      })
    );
    this.notes.update((curr) => [note, ...curr]);
    this.ormLog.log('POSTGRES_INSERT', {
      table: 'whiteboard_notes',
      author: authorName,
      content_preview: content.slice(0, 20),
    });
    return note;
  }

  async deleteNote(slug: string, noteId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/api/rooms/${slug}/notes/${noteId}`));
    this.notes.update((curr) => curr.filter((n) => n.id !== noteId));
    this.ormLog.log('POSTGRES_DELETE', { table: 'whiteboard_notes', note_id: noteId });
  }

  /**
   * Connects to the real-time spatial WebSocket gateway
   */
  connectRoom(slug: string): void {
    if (this.socket) {
      this.disconnect();
    }

    const user = this.currentUser();
    if (!user) {
      console.warn('Cannot connect to room WebSocket without active user session');
      return;
    }

    // Load initial notes from PostgreSQL
    this.fetchNotes(slug).catch((e) => console.warn('Could not prefetch notes:', e));

    const wsUrl = `${this.wsBaseUrl}/ws/room/${slug}`;
    console.log(`Connecting to spatial gateway at ${wsUrl}`);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.isConnected.set(true);
      this.ormLog.log('WS_CONNECTED', { endpoint: wsUrl, room: slug });

      // Send Join payload
      this.sendWsMessage({
        type: 'Join',
        payload: {
          user_id: user.id,
          display_name: user.display_name,
          avatar_config: user.avatar_config,
          initial_x: this.currentRoom()?.layout.spawn_x,
          initial_y: this.currentRoom()?.layout.spawn_y,
        },
      });

      // Start ping loop
      this.pingInterval = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.sendWsMessage({ type: 'Ping', payload: { timestamp: Date.now() } });
        }
      }, 5000);

      this.appendSystemMessage('Welcome to Twominal Lounge. Use WASD to navigate.');
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    this.socket.onclose = () => {
      this.isConnected.set(false);
      clearInterval(this.pingInterval);
      this.ormLog.log('WS_DISCONNECTED', { room: slug });
    };

    this.socket.onerror = (err) => {
      console.error('Spatial WebSocket gateway error:', err);
    };
  }

  private handleServerMessage(msg: { type: string; payload: any }): void {
    switch (msg.type) {
      case 'Welcome': {
        const { session_id, peers, layout } = msg.payload;
        this.selfPeerId.set(session_id);

        this.webrtcMesh.init(session_id, (targetPeerId, data) => {
          this.sendWsMessage({
            type: 'Signal',
            payload: { target_peer_id: targetPeerId, data },
          });
        });

        const map = new Map(this.peers());
        for (const p of peers) {
          map.set(p.peer_id, { ...p, target_x: p.x, target_y: p.y, anim_frame: 0 });
          if (p.screen_sharing) {
            this.webrtcMesh.ensurePeerConnection(p.peer_id);
          }
        }
        this.peers.set(map);
        break;
      }

      case 'PeerJoined': {
        const p = msg.payload.peer;
        const current = new Map(this.peers());
        current.set(p.peer_id, { ...p, target_x: p.x, target_y: p.y, anim_frame: 0 });
        this.peers.set(current);
        this.spatialAudio.playSfx('join');
        this.ormLog.log('PEER_JOINED', { peer_id: p.peer_id, name: p.display_name });
        if (this.webrtcMesh.isScreenSharing() || p.screen_sharing) {
          this.webrtcMesh.ensurePeerConnection(p.peer_id);
        }
        break;
      }

      case 'PeerMoved': {
        const { peer_id, x, y, direction, state, private_zone_id } = msg.payload;
        const current = new Map(this.peers());
        const peer = current.get(peer_id);
        if (peer) {
          peer.target_x = x;
          peer.target_y = y;
          peer.direction = direction;
          peer.state = state;
          peer.private_zone_id = private_zone_id;
          current.set(peer_id, peer);
          this.peers.set(current);
        }
        break;
      }

      case 'PeerEmoted': {
        const { peer_id, emoji } = msg.payload;
        const current = new Map(this.peers());
        const peer = current.get(peer_id);
        if (peer) {
          peer.currentEmote = emoji;
          peer.emoteTimer = 180;
          this.peers.set(current);
        }
        this.spatialAudio.playSfx('join');
        this.ormLog.log('EMOTE_BROADCAST', { peer_id, emoji });
        this.peerEmoted$.next({ peerId: peer_id, emoji });
        break;
      }

      case 'PeerProfileUpdated': {
        const { peer_id, display_name, avatar_config } = msg.payload;
        const current = new Map(this.peers());
        const peer = current.get(peer_id);
        if (peer) {
          peer.display_name = display_name;
          peer.avatar_config = avatar_config;
          this.peers.set(current);
        }
        this.ormLog.log('PEER_PROFILE_UPDATED', { peer_id, display_name });
        break;
      }

      case 'PeerLeft': {
        const { peer_id } = msg.payload;
        const current = new Map(this.peers());
        current.delete(peer_id);
        this.peers.set(current);

        const prox = new Map(this.proximityList());
        prox.delete(peer_id);
        this.proximityList.set(prox);

        this.webrtcMesh.closePeerConnection(peer_id);
        this.ormLog.log('PEER_LEFT', { peer_id });
        break;
      }

      case 'ProximityUpdate': {
        const proxMap = new Map<string, ProximityInfo>();
        for (const info of msg.payload.peers) {
          proxMap.set(info.peer_id, info);
          this.spatialAudio.updatePeerSpatialAudio(info.peer_id, info.volume, info.pan);
          const peer = this.peers().get(info.peer_id);
          const isSharing = !!(peer?.screen_sharing || this.webrtcMesh.isScreenSharing());
          this.webrtcMesh.handleProximityState(info.peer_id, info.in_range, isSharing);

          const wasInRange = this.proximityCache.get(info.peer_id) || false;
          if (info.in_range !== wasInRange) {
            this.proximityCache.set(info.peer_id, info.in_range);
            this.ormLog.log(info.in_range ? 'PROXIMITY_ENTER' : 'PROXIMITY_EXIT', {
              peer_id: info.peer_id,
              peer_name: peer?.display_name || info.peer_id,
              distance: info.distance.toFixed(1),
              volume_pct: Math.round(info.volume * 100),
            });
          }
        }
        this.proximityList.set(proxMap);
        break;
      }

      case 'SignalRelay': {
        const { from_peer_id, data } = msg.payload;
        this.webrtcMesh.handleIncomingSignal(from_peer_id, data);
        break;
      }

      case 'ChatMessage': {
        const msgs = [...this.chatMessages(), msg.payload];
        this.chatMessages.set(msgs);
        this.ormLog.log('POSTGRES_CHAT_LOG', {
          author: msg.payload.display_name,
          channel: msg.payload.channel,
          message: msg.payload.text,
        });
        break;
      }

      case 'WhiteboardSync': {
        this.whiteboardStrokes$.next(msg.payload.stroke);
        break;
      }

      case 'PeerCursorMoved': {
        this.peerCursors$.next(msg.payload);
        break;
      }

      case 'ScreenAnnotationSync': {
        this.screenAnnotationStrokes$.next(msg.payload.stroke);
        break;
      }

      case 'ScreenAnnotationsCleared': {
        this.screenAnnotationsCleared$.next();
        break;
      }

      case 'WhiteboardNoteAdded': {
        const note = msg.payload.note;
        this.notes.update((curr) => [note, ...curr.filter((n) => n.id !== note.id)]);
        this.ormLog.log('POSTGRES_INSERT', {
          table: 'whiteboard_notes',
          author: note.author_name,
          content: note.content.slice(0, 20),
        });
        break;
      }

      case 'WhiteboardNoteRemoved': {
        const { note_id } = msg.payload;
        this.notes.update((curr) => curr.filter((n) => n.id !== note_id));
        this.ormLog.log('POSTGRES_DELETE', { table: 'whiteboard_notes', note_id });
        break;
      }

      case 'ObjectInteracted': {
        this.objectInteractions$.next({
          objectId: msg.payload.object_id,
          action: msg.payload.action,
          state: msg.payload.state,
        });
        break;
      }

      case 'MediaStateChanged': {
        const { peer_id, mic_muted, cam_off, screen_sharing } = msg.payload;
        const current = new Map(this.peers());
        const peer = current.get(peer_id);
        const wasSharing = peer?.screen_sharing ?? false;
        if (peer) {
          peer.mic_muted = mic_muted;
          peer.cam_off = cam_off;
          peer.screen_sharing = screen_sharing;
          current.set(peer_id, peer);
          this.peers.set(current);
        }
        if (screen_sharing) {
          this.webrtcMesh.ensurePeerConnection(peer_id);
          if (!wasSharing) {
            this.appendSystemMessage(`📺 ${peer?.display_name || 'A lounge member'} started screen sharing.`);
            this.ormLog.log('SCREEN_BROADCAST_PEER_START', { peer_id, presenter: peer?.display_name });
          }
        } else if (!screen_sharing && wasSharing) {
          this.appendSystemMessage(`📺 ${peer?.display_name || 'A lounge member'} stopped screen sharing.`);
          this.ormLog.log('SCREEN_BROADCAST_PEER_STOP', { peer_id, presenter: peer?.display_name });
        }
        this.ormLog.log('AUDIO_STATE_CHANGED', { peer_id, mic_muted, cam_off });
        break;
      }

      case 'Pong': {
        const rtt = Date.now() - msg.payload.timestamp;
        this.pingLatency.set(rtt);
        break;
      }
    }
  }

  sendMove(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', state: string): void {
    this.sendWsMessage({
      type: 'Move',
      payload: { x, y, direction, state },
    });
  }

  sendChat(text: string, channel: 'room' | 'proximity'): void {
    this.sendWsMessage({
      type: 'ChatMessage',
      payload: { text, channel },
    });
  }

  sendEmote(emoji: string): void {
    this.localEmote.set(emoji);
    this.localEmoteTimer.set(180);
    this.spatialAudio.playSfx('join');
    this.sendWsMessage({
      type: 'Emote',
      payload: { emoji },
    });
    this.ormLog.log('EMOTE_BROADCAST', { emoji, author: this.currentUser()?.display_name || 'You' });
  }

  sendProfileUpdate(displayName: string, avatarConfig: AvatarConfig): void {
    this.sendWsMessage({
      type: 'UpdateProfile',
      payload: { display_name: displayName, avatar_config: avatarConfig },
    });
  }

  sendWhiteboardStroke(stroke: any): void {
    this.sendWsMessage({
      type: 'WhiteboardStroke',
      payload: { stroke },
    });
  }

  sendCursorMove(stage: string, x: number, y: number): void {
    this.sendWsMessage({
      type: 'CursorMove',
      payload: { stage, x, y },
    });
  }

  sendScreenAnnotation(stroke: any): void {
    this.sendWsMessage({
      type: 'ScreenAnnotation',
      payload: { stroke },
    });
  }

  clearScreenAnnotations(): void {
    this.sendWsMessage({
      type: 'ClearScreenAnnotations',
      payload: {},
    });
  }

  sendInteract(objectId: string, action: string, data?: any): void {
    this.sendWsMessage({
      type: 'Interact',
      payload: { object_id: objectId, action, data },
    });
  }

  sendMediaState(micMuted: boolean, camOff: boolean, screenSharing: boolean): void {
    this.sendWsMessage({
      type: 'MediaState',
      payload: {
        mic_muted: micMuted,
        cam_off: camOff,
        screen_sharing: screenSharing,
      },
    });
  }

  appendSystemMessage(text: string): void {
    const sysMsg: ChatMessage = {
      id: 'sys-' + Math.random().toString(36).substring(2, 9),
      from_peer_id: 'system',
      display_name: 'System',
      text,
      channel: 'system',
      timestamp: Date.now(),
    };
    this.chatMessages.update((msgs) => [...msgs, sysMsg]);
  }

  private sendWsMessage(msg: { type: string; payload: any }): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    clearInterval(this.pingInterval);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.webrtcMesh.disconnectAll();
    this.spatialAudio.destroy();
    this.isConnected.set(false);
    this.currentRoom.set(null);
    this.peers.set(new Map());
    this.proximityList.set(new Map());
  }
}
