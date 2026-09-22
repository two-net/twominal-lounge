import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';
import { ProceduralAssetsService } from './services/procedural-assets.service';
import { SpatialAudioService } from './services/spatial-audio.service';
import { LoungeApiService } from './services/lounge-api.service';
import { OrmLogService } from './services/orm-log.service';
import { LoungeCanvasComponent } from './components/lounge-canvas/lounge-canvas.component';

// Mock Canvas 2D context for jsdom test runner
class MockCanvasRenderingContext2D {
  fillStyle: any = '';
  strokeStyle: any = '';
  lineWidth = 1;
  font = '';
  textAlign = '';
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() {}
  closePath() {}
  fill() {}
  stroke() {}
  fillRect() {}
  strokeRect() {}
  roundRect() {}
  arc() {}
  ellipse() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  setLineDash() {}
  fillText() {}
  createRadialGradient() {
    return { addColorStop() {} };
  }
  drawImage() {}
}

HTMLCanvasElement.prototype.getContext = function (contextType: string): any {
  if (contextType === '2d') {
    return new MockCanvasRenderingContext2D();
  }
  return null;
};

// Mock Web Audio API for jsdom
(window as any).AudioContext = class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {},
    };
  }
  createStereoPanner() {
    return {
      pan: { value: 0, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    };
  }
  resume() {}
  close() {}
};

// Mock MediaStream for jsdom test runner
class MockMediaStream {
  private tracks: any[] = [];
  constructor(tracks: any[] = []) {
    this.tracks = Array.isArray(tracks) ? [...tracks] : [];
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getTracks() {
    return [...this.tracks];
  }
  addTrack(track: any) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
  removeTrack(track: any) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}
(window as any).MediaStream = MockMediaStream;
(globalThis as any).MediaStream = MockMediaStream;

class MockRTCPeerConnection {
  iceConnectionState = 'new';
  connectionState = 'connected';
  signalingState = 'stable';
  localDescription: any = { type: 'offer', sdp: 'v=0...' };
  remoteDescription: any = null;
  onicecandidate: any = null;
  ontrack: any = null;
  onnegotiationneeded: any = null;
  onconnectionstatechange: any = null;
  private senders: any[] = [];

  addTrack(track: any, stream: any) {
    const sender = { track, kind: track.kind, replaceTrack: async (t: any) => { sender.track = t; } };
    this.senders.push(sender);
    return sender;
  }
  getSenders() {
    return this.senders;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'v=0...' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'v=0...' };
  }
  async setLocalDescription(desc: any) {
    this.localDescription = desc;
  }
  async setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
  }
  async addIceCandidate(cand: any) {}
  close() {}
  restartIce() {}
}

if (!(window as any).RTCPeerConnection) {
  (window as any).RTCPeerConnection = MockRTCPeerConnection;
  (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
}
if (!(window as any).RTCSessionDescription) {
  (window as any).RTCSessionDescription = class { constructor(public init: any) {} };
  (globalThis as any).RTCSessionDescription = (window as any).RTCSessionDescription;
}
if (!(window as any).RTCIceCandidate) {
  (window as any).RTCIceCandidate = class { constructor(public init: any) {} };
  (globalThis as any).RTCIceCandidate = (window as any).RTCIceCandidate;
}

describe('Twominal Lounge Frontend Tests', () => {
  let proceduralAssets: ProceduralAssetsService;
  let spatialAudio: SpatialAudioService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient()],
    }).compileComponents();

    proceduralAssets = TestBed.inject(ProceduralAssetsService);
    spatialAudio = TestBed.inject(SpatialAudioService);
  });

  it('should instantiate the root App component', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render procedural avatars without error', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    expect(() => {
      proceduralAssets.drawAvatar(
        ctx,
        32,
        32,
        'down',
        0,
        {
          skin: 'tan',
          hair: 'short',
          hair_color: '#2563eb',
          outfit: 'hoodie',
          outfit_color: '#6366f1',
          hat: 'none',
        },
        1.0,
        true
      );
    }).not.toThrow();
  });

  it('should render procedural ground and wall tiles without error', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    expect(() => {
      proceduralAssets.drawGroundTile(ctx, 1, 0, 0, 32);
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32);
    }).not.toThrow();
  });

  it('should render rotated side wall graphics and all wall orientations', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    expect(() => {
      // Drywall orientations
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'horizontal');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'side-left');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'side-right');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'vertical');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'corner-top-left');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'corner-top-right');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'corner-bottom-left');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 'corner-bottom-right');
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, 90);
      proceduralAssets.drawWallTile(ctx, 1, 0, 0, 32, -90);

      // Glass partition orientations
      proceduralAssets.drawWallTile(ctx, 2, 0, 0, 32, 'horizontal');
      proceduralAssets.drawWallTile(ctx, 2, 0, 0, 32, 'vertical');
      proceduralAssets.drawWallTile(ctx, 2, 0, 0, 32, 'side-left');
      proceduralAssets.drawWallTile(ctx, 2, 0, 0, 32, 'side-right');
    }).not.toThrow();
  });

  it('should play spatial chime without crashing Web Audio API', () => {
    expect(() => {
      spatialAudio.playSpatialChime(0.5, 0.8);
    }).not.toThrow();
  });

  it('should record ORM log entries correctly', () => {
    const ormLog = TestBed.inject(OrmLogService);
    ormLog.log('TEST_EVENT', { sample: 123 });
    const logs = ormLog.logs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('TEST_EVENT');
    expect(logs[0].payload).toContain('123');
  });

  it('should cycle avatar colors and update user state', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const initialColor = app.userColor();
    await app.cycleAvatarColor();
    expect(app.userColor()).not.toBe(initialColor);
  });

  it('should customize avatar archetype, color, and display name via onAvatarCustomized', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    app.api.currentUser.set({
      id: 'test-user-id',
      username: 'alex',
      display_name: 'Alex R.',
      avatar_config: { skin: 'tan', hair: 'short', hair_color: '#14b8a6', outfit: 'hoodie', outfit_color: '#14b8a6', hat: 'none', character: 'hoodie' },
      license_type: 'free',
      created_at: new Date().toISOString(),
    });

    expect(app.showAvatarSelector()).toBe(false);
    app.showAvatarSelector.set(true);
    expect(app.showAvatarSelector()).toBe(true);

    await app.onAvatarCustomized({
      character: 'architect',
      color: '#ec4899',
      displayName: 'Jordan Pro',
    });

    expect(app.userCharacter()).toBe('architect');
    expect(app.userColor()).toBe('#ec4899');
    expect(app.userName()).toBe('Jordan Pro');
    expect(app.api.currentUser()?.display_name).toBe('Jordan Pro');
    expect(app.api.currentUser()?.avatar_config.character).toBe('architect');
  });

  it('should equip and render Logician (L Lawliet) avatar archetype', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    app.api.currentUser.set({
      id: 'test-user-id',
      username: 'lawliet',
      display_name: 'L',
      avatar_config: { skin: 'pale', hair: 'messy', hair_color: '#0f172a', outfit: 'sweater', outfit_color: '#f8fafc', hat: 'none', character: 'hoodie' },
      license_type: 'free',
      created_at: new Date().toISOString(),
    });

    await app.onAvatarCustomized({
      character: 'logician',
      color: '#06b6d4',
      displayName: 'Logician',
    });

    expect(app.userCharacter()).toBe('logician');
    expect(app.userName()).toBe('Logician');
    expect(app.api.currentUser()?.avatar_config.character).toBe('logician');

    // Canvas drawing verification
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    expect(() => {
      proceduralAssets.drawAvatar(
        ctx,
        32,
        32,
        'down',
        0,
        app.api.currentUser()!.avatar_config,
        1.0,
        true
      );
    }).not.toThrow();
  });

  it('should toggle LoFi ambient background synth', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.api.spatialAudio.isLofiPlaying()).toBe(false);
    await app.toggleMusic();
    expect(app.api.spatialAudio.isLofiPlaying()).toBe(true);
    await app.toggleMusic();
    expect(app.api.spatialAudio.isLofiPlaying()).toBe(false);
  });

  it('should have microphone, camera, and screen sharing turned off by default', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.webrtc.isMicEnabled()).toBe(false);
    expect(app.webrtc.isCameraEnabled()).toBe(false);
    expect(app.webrtc.isScreenSharing()).toBe(false);
    expect(app.isScreenModalOpen()).toBe(false);
    expect(app.activeScreenPresenter()).toBeNull();
  });

  it('should toggle screen sharing on and off with presentation stage activation', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.webrtc.isScreenSharing()).toBe(false);
    await app.toggleScreen();
    expect(app.webrtc.isScreenSharing()).toBe(true);
    expect(app.isScreenModalOpen()).toBe(true);

    const presenter = app.activeScreenPresenter();
    expect(presenter).not.toBeNull();
    expect(presenter?.isLocal).toBe(true);
    expect(presenter?.name).toContain('You');
    expect(presenter?.stream).not.toBeNull();

    // Toggle off
    await app.toggleScreen();
    expect(app.webrtc.isScreenSharing()).toBe(false);
    expect(app.isScreenModalOpen()).toBe(false);
    expect(app.activeScreenPresenter()).toBeNull();
  });

  it('should detect remote peer screen sharing state', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Simulate remote peer screen sharing
    const mockPeer = {
      peer_id: 'peer-test-123',
      user_id: 'u-123',
      display_name: 'Jordan K.',
      avatar_config: { skin: 'light', hair: 'long', hair_color: '#38bdf8', outfit: 'tshirt', outfit_color: '#38bdf8', hat: 'none' },
      x: 10,
      y: 10,
      direction: 'down' as const,
      state: 'idle' as const,
      mic_muted: true,
      cam_off: true,
      screen_sharing: true,
    };
    const peersMap = new Map([[mockPeer.peer_id, mockPeer]]);
    app.api.peers.set(peersMap);

    const presenter = app.activeScreenPresenter();
    expect(presenter).not.toBeNull();
    expect(presenter?.isLocal).toBe(false);
    expect(presenter?.name).toBe('Jordan K.');
    expect(presenter?.peerId).toBe('peer-test-123');
  });

  it('should stop video hardware tracks and turn off camera when toggleCam is toggled off', async () => {
    let stopCalled = false;
    const mockTrack: any = {
      kind: 'video',
      readyState: 'live',
      enabled: true,
      stop: () => {
        stopCalled = true;
        mockTrack.readyState = 'ended';
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const mockCamStream: any = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    };

    const originalMediaDevices = (navigator as any).mediaDevices;
    (navigator as any).mediaDevices = {
      ...originalMediaDevices,
      getUserMedia: async (constraints: any) => {
        if (constraints?.video) {
          return mockCamStream;
        }
        return { getAudioTracks: () => [], getTracks: () => [] };
      },
    };

    try {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;

      expect(app.webrtc.isCameraEnabled()).toBe(false);

      // Turn camera ON
      await app.toggleCam();
      expect(app.webrtc.isCameraEnabled()).toBe(true);
      expect(stopCalled).toBe(false);

      // Turn camera OFF
      await app.toggleCam();
      expect(app.webrtc.isCameraEnabled()).toBe(false);
      expect(stopCalled).toBe(true);
    } finally {
      (navigator as any).mediaDevices = originalMediaDevices;
    }
  });

  it('should only recognize interactive objects and ignore static props with no interaction', () => {
    const fixture = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixture.componentInstance;

    // Interactive objects
    expect(
      canvasComp.isInteractiveObject({
        id: 'whiteboard-1',
        object_type: 'whiteboard',
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        properties: {},
      })
    ).toBe(true);
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-chair-1',
        object_type: 'chair',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: {},
      })
    ).toBe(true);
    expect(
      canvasComp.isInteractiveObject({
        id: 'coffee-machine',
        object_type: 'coffee',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: {},
      })
    ).toBe(true);
    expect(
      canvasComp.isInteractiveObject({
        id: 'arcade-1',
        object_type: 'arcade',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: {},
      })
    ).toBe(true);
    expect(
      canvasComp.isInteractiveObject({
        id: 'fountain-1',
        object_type: 'fountain',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: {},
      })
    ).toBe(true);

    // Static objects that do nothing
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-conf-table',
        object_type: 'desk',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        properties: { name: 'Conference Table' },
      })
    ).toBe(false);
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-plant-1',
        object_type: 'plant',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: { name: 'Monstera Deliciosa' },
      })
    ).toBe(false);
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-plant-2',
        object_type: 'plant',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: { name: 'Fiddle Leaf Fig' },
      })
    ).toBe(false);
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-couch-1',
        object_type: 'couch',
        x: 0,
        y: 0,
        width: 3,
        height: 1,
        properties: { name: 'Comfortable Sofa' },
      })
    ).toBe(false);
    expect(
      canvasComp.isInteractiveObject({
        id: 'obj-water-cooler',
        object_type: 'water_cooler',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        properties: { name: 'Sparkling Water Cooler' },
      })
    ).toBe(false);
  });

  it('should not show Press E prompt when player is next to static objects that do nothing', () => {
    const fixture = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixture.componentInstance;

    const mockRoom: any = {
      id: 'room-1',
      name: 'Test Room',
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 10,
        height: 10,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [
          {
            id: 'obj-conf-table',
            object_type: 'desk',
            x: 2,
            y: 2,
            width: 4,
            height: 2,
            properties: { name: 'Conference Table' },
          },
          {
            id: 'obj-plant-1',
            object_type: 'plant',
            x: 2,
            y: 2,
            width: 1,
            height: 1,
            properties: { name: 'Monstera' },
          },
        ],
        private_zones: [],
      },
    };

    canvasComp.room = mockRoom;
    (canvasComp as any).playerX = 2;
    (canvasComp as any).playerY = 2;
    (canvasComp as any).checkNearbyObjects();

    expect(canvasComp.nearbyObject()).toBeNull();
    expect(canvasComp.promptScreenPos()).toBeNull();
  });

  it('should have no default room on initial load when URL does not specify a room', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.currentRoom()).toBeNull();
  });

  it('should extract room code from URL query parameter', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const originalLocation = window.location;
    try {
      delete (window as any).location;
      (window as any).location = { search: '?room=product-design', hash: '', pathname: '/' };

      expect(app.getRoomCodeFromUrl()).toBe('product-design');
    } finally {
      (window as any).location = originalLocation;
    }
  });

  it('should parse room code from input string or full shared URL', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.parseRoomCodeFromInput('team-standup')).toBe('team-standup');
    expect(app.parseRoomCodeFromInput('  COZY-POD  ')).toBe('cozy-pod');
    expect(app.parseRoomCodeFromInput('https://lounge.twominal.com/?room=design-sprint')).toBe('design-sprint');
    expect(app.parseRoomCodeFromInput('http://localhost:4200/#/room/audio-lab')).toBe('audio-lab');
    expect(app.parseRoomCodeFromInput('/room/exec-suite')).toBe('exec-suite');
  });

  it('should handle join room failure gracefully when room code not found', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    vi.spyOn(app.api, 'getRoom').mockRejectedValueOnce(new Error('Room not found'));

    const success = await app.joinRoomByCode('non-existent-room', false);
    expect(success).toBe(false);
    expect(app.currentRoom()).toBeNull();
    expect(app.joinError()).toContain('non-existent-room');
  });

  it('should successfully join room and connect websocket when room code is valid', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const mockRoomDetails: any = {
      id: 'room-123',
      slug: 'awesome-lounge',
      name: 'Awesome Lounge',
      description: 'A test lounge',
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      layout: {
        id: 'layout-123',
        room_id: 'room-123',
        width: 30,
        height: 20,
        spawn_x: 4,
        spawn_y: 4,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [],
      },
    };

    vi.spyOn(app.api, 'getRoom').mockResolvedValueOnce(mockRoomDetails);
    const connectSpy = vi.spyOn(app.api, 'connectRoom').mockImplementation(() => {});

    const success = await app.joinRoomByCode('awesome-lounge', false);
    expect(success).toBe(true);
    expect(app.currentRoom()).toEqual(mockRoomDetails);
    expect(connectSpy).toHaveBeenCalledWith('awesome-lounge');
    expect(app.joinError()).toBeNull();
  });

  it('should create room and immediately connect when createAndEnterRoom is called', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const mockCreatedRoom: any = {
      id: 'room-456',
      slug: 'design-studio',
      name: 'Design Studio',
      description: 'Design review pod',
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 0,
      layout: {
        id: 'layout-456',
        room_id: 'room-456',
        width: 30,
        height: 20,
        spawn_x: 4,
        spawn_y: 4,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [],
      },
    };

    const createSpy = vi.spyOn(app.api, 'createRoom').mockResolvedValueOnce(mockCreatedRoom);
    const connectSpy = vi.spyOn(app.api, 'connectRoom').mockImplementation(() => {});

    app.newRoomName.set('Design Studio');
    app.newRoomCode.set('design-studio');
    app.newRoomDesc.set('Design review pod');

    await app.createAndEnterRoom();

    expect(createSpy).toHaveBeenCalledWith('Design Studio', 'Design review pod', 30, 20, 'design-studio');
    expect(app.currentRoom()).toEqual(mockCreatedRoom);
    expect(connectSpy).toHaveBeenCalledWith('design-studio');
  });

  it('should leave room and clear room state when leaveRoom is called', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.currentRoom.set({ slug: 'my-room' } as any);
    const disconnectSpy = vi.spyOn(app.api, 'disconnect');

    app.leaveRoom(false);

    expect(app.currentRoom()).toBeNull();
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('should copy room code and invite link with feedback', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.currentRoom.set({ slug: 'test-code-123' } as any);

    app.copyRoomCode();
    expect(app.copyFeedback()).toContain('test-code-123');

    app.copyInviteLink();
    expect(app.copyFeedback()).toContain('invite link');
  });

  it('should toggle video dock collapse state independently from title bar', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.isVideoDockCollapsed()).toBe(false);
    app.toggleVideoDock();
    expect(app.isVideoDockCollapsed()).toBe(true);
    app.toggleVideoDock();
    expect(app.isVideoDockCollapsed()).toBe(false);
  });

  it('should manage screen annotation tools, colors, sizes, and visibility', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.screenAnnotationTool()).toBe('pointer');
    app.setAnnotationTool('pen');
    expect(app.screenAnnotationTool()).toBe('pen');
    app.setAnnotationTool('laser');
    expect(app.screenAnnotationTool()).toBe('laser');
    app.setAnnotationTool('highlighter');
    expect(app.screenAnnotationTool()).toBe('highlighter');
    app.setAnnotationTool('arrow');
    expect(app.screenAnnotationTool()).toBe('arrow');
    app.setAnnotationTool('rect');
    expect(app.screenAnnotationTool()).toBe('rect');

    app.screenAnnotationColor.set('#f43f5e');
    expect(app.screenAnnotationColor()).toBe('#f43f5e');

    app.screenAnnotationSize.set(8);
    expect(app.screenAnnotationSize()).toBe(8);

    expect(app.screenAnnotationsVisible()).toBe(true);
    app.toggleScreenAnnotationsVisibility();
    expect(app.screenAnnotationsVisible()).toBe(false);
    app.toggleScreenAnnotationsVisibility();
    expect(app.screenAnnotationsVisible()).toBe(true);

    expect(app.screenCursorsVisible()).toBe(true);
    app.toggleScreenCursorsVisibility();
    expect(app.screenCursorsVisible()).toBe(false);
    app.toggleScreenCursorsVisibility();
    expect(app.screenCursorsVisible()).toBe(true);
  });

  it('should record, undo, clear screen annotation strokes and sync with api', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const clearSpy = vi.spyOn(app.api, 'clearScreenAnnotations');

    app.screenStrokes.set([
      {
        id: 'stroke-1',
        tool: 'pen',
        color: '#14b8a6',
        size: 4,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        createdAt: Date.now(),
      },
      {
        id: 'stroke-2',
        tool: 'arrow',
        color: '#ec4899',
        size: 6,
        points: [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }],
        createdAt: Date.now(),
      },
    ]);

    expect(app.screenStrokes().length).toBe(2);

    app.undoScreenAnnotation();
    expect(app.screenStrokes().length).toBe(1);
    expect(app.screenStrokes()[0].id).toBe('stroke-1');

    app.clearScreenAnnotations();
    expect(app.screenStrokes().length).toBe(0);
    expect(clearSpy).toHaveBeenCalled();
  });

  it('should receive remote screen cursor updates and track active cursors', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.activeScreenCursors().length).toBe(0);

    // Remote peer moves cursor on screen share
    app.api.peerCursors$.next({
      peer_id: 'peer-sarah',
      display_name: 'Sarah C.',
      color: '#ec4899',
      stage: 'screen',
      x: 0.42,
      y: 0.68,
    });

    expect(app.activeScreenCursors().length).toBe(1);
    expect(app.activeScreenCursors()[0].peer_id).toBe('peer-sarah');
    expect(app.activeScreenCursors()[0].display_name).toBe('Sarah C.');
    expect(app.activeScreenCursors()[0].x).toBe(0.42);
    expect(app.activeScreenCursors()[0].y).toBe(0.68);

    // Update position
    app.api.peerCursors$.next({
      peer_id: 'peer-sarah',
      display_name: 'Sarah C.',
      color: '#ec4899',
      stage: 'screen',
      x: 0.55,
      y: 0.75,
    });

    expect(app.activeScreenCursors().length).toBe(1);
    expect(app.activeScreenCursors()[0].x).toBe(0.55);
    expect(app.activeScreenCursors()[0].y).toBe(0.75);

    // Ignore cursors from other stages like whiteboard or world in screen stage
    app.api.peerCursors$.next({
      peer_id: 'peer-bob',
      display_name: 'Bob',
      color: '#38bdf8',
      stage: 'whiteboard',
      x: 0.1,
      y: 0.2,
    });

    expect(app.activeScreenCursors().length).toBe(1);
  });

  it('should broadcast cursor movements on screen stage with normalized coordinates', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const cursorSpy = vi.spyOn(app.api, 'sendCursorMove');

    const fakeEvent: any = {
      clientX: 250,
      clientY: 150,
      currentTarget: {
        getBoundingClientRect: () => ({
          left: 50,
          top: 50,
          width: 400,
          height: 200,
        }),
      },
    };

    app.onScreenStagePointerMove(fakeEvent);

    expect(cursorSpy).toHaveBeenCalledWith('screen', 0.5, 0.5);
  });

  it('should receive remote screen annotation strokes and cleared events', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.screenStrokes().length).toBe(0);

    app.api.screenAnnotationStrokes$.next({
      id: 'remote-1',
      tool: 'highlighter',
      color: '#f59e0b',
      size: 6,
      points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }],
      createdAt: Date.now(),
    });

    expect(app.screenStrokes().length).toBe(1);
    expect(app.screenStrokes()[0].tool).toBe('highlighter');

    // Remote presenter clears annotations
    app.api.screenAnnotationsCleared$.next();
    expect(app.screenStrokes().length).toBe(0);
  });

  it('should connect and retrieve live video track when remote peer shares screen', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Simulate remote peer screen sharing
    const mockPeer = {
      peer_id: 'peer-presenter-456',
      user_id: 'u-456',
      display_name: 'Two',
      avatar_config: { skin: 'tan', hair: 'short', hair_color: '#10b981', outfit: 'hoodie', outfit_color: '#10b981', hat: 'none' },
      x: 15,
      y: 15,
      direction: 'down' as const,
      state: 'idle' as const,
      mic_muted: false,
      cam_off: true,
      screen_sharing: true,
    };
    app.api.peers.set(new Map([[mockPeer.peer_id, mockPeer]]));

    // Initially, no stream arrived yet -> activeScreenPresenter has null stream (showing connecting spinner)
    let presenter = app.activeScreenPresenter();
    expect(presenter).not.toBeNull();
    expect(presenter?.isLocal).toBe(false);
    expect(presenter?.name).toBe('Two');
    expect(presenter?.stream).toBeNull();

    // Now simulated video track arrives via WebRTC
    const liveVideoTrack = {
      kind: 'video',
      id: 'screen-video-1',
      readyState: 'live',
      enabled: true,
      stop: () => {},
    };
    const incomingStream = new (window as any).MediaStream([liveVideoTrack]);
    app.webrtc.remoteStreams.set(new Map([[mockPeer.peer_id, incomingStream]]));

    // Stream is now active and ready with live video track
    presenter = app.activeScreenPresenter();
    expect(presenter?.stream).not.toBeNull();
    expect(presenter?.stream?.getVideoTracks().length).toBe(1);
    expect(presenter?.stream?.getVideoTracks()[0].readyState).toBe('live');
  });

  it('should negotiate WebRTC offer without deadlock regardless of peer ID lexicographical order', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    let sentSignals: Array<{ target: string; data: any }> = [];
    app.webrtc.init('peer-viewer-zzz', (target, data) => {
      sentSignals.push({ target, data });
    });

    // Target peer has a smaller lexicographical ID ('peer-presenter-aaa' < 'peer-viewer-zzz')
    // In the old broken implementation, peer-viewer-zzz would REFUSE to send offer
    app.webrtc.ensurePeerConnection('peer-presenter-aaa');
    await new Promise((resolve) => setTimeout(resolve, 20));

    // With Perfect Negotiation, offer is initiated immediately
    expect(sentSignals.length).toBeGreaterThan(0);
    expect(sentSignals[0].target).toBe('peer-presenter-aaa');
    expect(sentSignals[0].data.type).toBe('offer');
  });

  it('should allow viewer to trigger stream reconnect via retryPresenterStream', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const ensureSpy = vi.spyOn(app.webrtc, 'ensurePeerConnection');
    const mockPeer = {
      peer_id: 'peer-broadcaster',
      user_id: 'u-broadcaster',
      display_name: 'Presenter',
      avatar_config: { skin: 'tan', hair: 'short', hair_color: '#10b981', outfit: 'hoodie', outfit_color: '#10b981', hat: 'none' },
      x: 12,
      y: 12,
      direction: 'down' as const,
      state: 'idle' as const,
      mic_muted: false,
      cam_off: true,
      screen_sharing: true,
    };
    app.api.peers.set(new Map([[mockPeer.peer_id, mockPeer]]));

    app.retryPresenterStream();

    expect(ensureSpy).toHaveBeenCalledWith('peer-broadcaster');
  });

  it('should open presentation stage and ensure peer connection via openPresentationStage', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const ensureSpy = vi.spyOn(app.webrtc, 'ensurePeerConnection');
    const mockPeer = {
      peer_id: 'peer-broadcaster',
      user_id: 'u-broadcaster',
      display_name: 'Presenter',
      avatar_config: { skin: 'tan', hair: 'short', hair_color: '#10b981', outfit: 'hoodie', outfit_color: '#10b981', hat: 'none' },
      x: 12,
      y: 12,
      direction: 'down' as const,
      state: 'idle' as const,
      mic_muted: false,
      cam_off: true,
      screen_sharing: true,
    };
    app.api.peers.set(new Map([[mockPeer.peer_id, mockPeer]]));

    app.openPresentationStage();

    expect(app.isScreenModalOpen()).toBe(true);
    expect(app.isScreenMinimized()).toBe(false);
    expect(ensureSpy).toHaveBeenCalledWith('peer-broadcaster');
  });

  it('should persist name and avatar to localStorage when customized', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    await app.onAvatarCustomized({
      character: 'director',
      color: '#f59e0b',
      displayName: 'Morgan Leader',
    });

    expect(localStorage.getItem('twominal_name')).toBe('Morgan Leader');
    expect(localStorage.getItem('twominal_avatar')).toBe('director');
    expect(localStorage.getItem('twominal_color')).toBe('#f59e0b');

    const userRaw = localStorage.getItem('twominal_user');
    expect(userRaw).toBeTruthy();
    const userObj = JSON.parse(userRaw!);
    expect(userObj.display_name).toBe('Morgan Leader');
    expect(userObj.avatar_config.character).toBe('director');
    expect(userObj.avatar_config.hair_color).toBe('#f59e0b');
  });

  it('should persist display name change to localStorage', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    vi.spyOn(app.api, 'updateUserProfile').mockResolvedValue({
      id: 'a0000000-0000-0000-0000-000000000001',
      username: 'taylor',
      display_name: 'Taylor Tech',
      avatar_config: { skin: 'tan', hair: 'short', hair_color: '#14b8a6', outfit: 'hoodie', outfit_color: '#14b8a6', hat: 'none', character: 'hoodie' },
      license_type: 'community',
      created_at: new Date().toISOString(),
    });

    await app.onDisplayNameChange('Taylor Tech');

    expect(localStorage.getItem('twominal_name')).toBe('Taylor Tech');
    expect(app.userName()).toBe('Taylor Tech');
  });

  it('should toggle build mode on and off in App and LoungeCanvasComponent', () => {
    const fixtureApp = TestBed.createComponent(App);
    const app = fixtureApp.componentInstance;

    expect(app.isBuildMode()).toBe(false);
    app.toggleBuildMode();
    expect(app.isBuildMode()).toBe(true);
    app.toggleBuildMode();
    expect(app.isBuildMode()).toBe(false);

    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    expect(canvasComp.isBuildMode()).toBe(false);
    canvasComp.toggleBuildMode();
    expect(canvasComp.isBuildMode()).toBe(true);
    canvasComp.toggleBuildMode();
    expect(canvasComp.isBuildMode()).toBe(false);
  });

  it('should select private zone on click and identify correct resize handle in screen space', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    const mockZone = {
      id: 'zone-pod-1',
      name: 'Focus Pod',
      x: 5,
      y: 5,
      width: 6,
      height: 4,
      color: '#3b82f6',
    };

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [mockZone],
      },
    };

    canvasComp.isBuildMode.set(true);

    // Hit test zone at tile coordinates
    expect(canvasComp.getZoneAt(7, 6)).toEqual(mockZone);
    expect(canvasComp.getZoneAt(20, 15)).toBeNull();

    // Select zone
    canvasComp.selectedZoneId.set('zone-pod-1');
    expect(canvasComp.selectedZone()).toEqual(mockZone);

    // Handles in screen space
    const handles = canvasComp.getZoneHandlesScreenCoords(mockZone);
    expect(handles.nw).toBeDefined();
    expect(handles.se).toBeDefined();

    expect(canvasComp.getHandleAt(handles.nw.x, handles.nw.y, mockZone)).toBe('nw');
    expect(canvasComp.getHandleAt(handles.se.x, handles.se.y, mockZone)).toBe('se');
    expect(canvasComp.getHandleAt(handles.e.x, handles.e.y, mockZone)).toBe('e');
    expect(canvasComp.getHandleAt(handles.n.x, handles.n.y, mockZone)).toBe('n');
    expect(canvasComp.getHandleAt(0, 0, mockZone)).toBeNull();
  });

  it('should drag to move private zone and clamp within map bounds', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    const mockZone = {
      id: 'zone-pod-1',
      name: 'Focus Pod',
      x: 5,
      y: 5,
      width: 6,
      height: 4,
      color: '#3b82f6',
    };

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [mockZone],
      },
    };

    canvasComp.isBuildMode.set(true);

    // Start drag move at (5, 5)
    canvasComp.startMove(mockZone, 5, 5);
    expect(canvasComp.dragState).not.toBeNull();
    expect(canvasComp.dragState?.type).toBe('move');

    // Drag by +3 in X and +2 in Y
    canvasComp.applyDrag(8, 7);
    expect(mockZone.x).toBe(8);
    expect(mockZone.y).toBe(7);

    // Drag beyond map boundary (clamp test)
    canvasComp.applyDrag(50, 50);
    // map width 30 - width 6 = 24; map height 20 - height 4 = 16
    expect(mockZone.x).toBe(24);
    expect(mockZone.y).toBe(16);

    // Drag to negative coordinates (clamp test)
    canvasComp.applyDrag(-10, -10);
    expect(mockZone.x).toBe(0);
    expect(mockZone.y).toBe(0);

    // Finish drag
    const updateSpy = vi.spyOn(canvasComp.api, 'updateRoomLayout').mockResolvedValue(undefined as any);
    canvasComp.finishDrag();
    expect(canvasComp.dragState).toBeNull();
    expect(updateSpy).toHaveBeenCalledWith('test-room', {
      private_zones: [mockZone],
    });
  });

  it('should drag to resize private zone via handles with minimum dimension enforcement', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    const mockZone = {
      id: 'zone-pod-1',
      name: 'Focus Pod',
      x: 5,
      y: 5,
      width: 6,
      height: 4,
      color: '#3b82f6',
    };

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [mockZone],
      },
    };

    canvasComp.isBuildMode.set(true);

    // Resize East handle (expand right)
    canvasComp.startResize(mockZone, 'e', 11, 7);
    canvasComp.applyDrag(14, 7); // +3 tiles
    expect(mockZone.width).toBe(9);
    expect(mockZone.x).toBe(5);

    // Resize East handle to collapse below minSize (minSize = 2)
    canvasComp.applyDrag(0, 7);
    expect(mockZone.width).toBe(2);

    // Resize West handle (move left edge)
    canvasComp.startResize(mockZone, 'w', 5, 5);
    canvasComp.applyDrag(3, 5); // move left by 2 tiles
    expect(mockZone.x).toBe(3);
    expect(mockZone.width).toBe(4); // width expands from 2 to 4

    // Resize South-East handle (expand both dimensions)
    canvasComp.startResize(mockZone, 'se', 7, 9);
    canvasComp.applyDrag(10, 12); // +3 in width, +3 in height
    expect(mockZone.width).toBe(7);
    expect(mockZone.height).toBe(7);

    // Finish resize
    const updateSpy = vi.spyOn(canvasComp.api, 'updateRoomLayout').mockResolvedValue(undefined as any);
    canvasComp.finishDrag();
    expect(canvasComp.dragState).toBeNull();
    expect(updateSpy).toHaveBeenCalled();
  });

  it('should add a new private zone and select it in build mode', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 6,
        spawn_y: 6,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [],
      },
    };

    vi.spyOn(canvasComp.api, 'updateRoomLayout').mockResolvedValue(undefined as any);
    canvasComp.isBuildMode.set(true);

    canvasComp.addPrivateZone();

    expect(canvasComp.room.layout.private_zones.length).toBe(1);
    const newZone = canvasComp.room.layout.private_zones[0];
    expect(newZone.name).toContain('Private Pod');
    expect(newZone.width).toBe(6);
    expect(newZone.height).toBe(5);
    expect(canvasComp.selectedZoneId()).toBe(newZone.id);
  });

  it('should delete the selected private zone in build mode', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    const zone1 = { id: 'z-1', name: 'Zone 1', x: 2, y: 2, width: 4, height: 4, color: '#3b82f6' };
    const zone2 = { id: 'z-2', name: 'Zone 2', x: 8, y: 8, width: 4, height: 4, color: '#10b981' };

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [zone1, zone2],
      },
    };

    vi.spyOn(canvasComp.api, 'updateRoomLayout').mockResolvedValue(undefined as any);
    canvasComp.isBuildMode.set(true);

    canvasComp.selectedZoneId.set('z-1');
    canvasComp.deleteSelectedZone();

    expect(canvasComp.room.layout.private_zones.length).toBe(1);
    expect(canvasComp.room.layout.private_zones[0].id).toBe('z-2');
    expect(canvasComp.selectedZoneId()).toBeNull();
  });

  it('should update selected zone name and color', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    const zone = { id: 'z-1', name: 'Old Name', x: 2, y: 2, width: 4, height: 4, color: '#3b82f6' };

    canvasComp.room = {
      id: 'room-1',
      slug: 'test-room',
      name: 'Test Room',
      description: 'Test Room',
      max_occupancy: 20,
      pricing_tier: 'free',
      is_active: true,
      active_occupancy: 1,
      created_at: new Date().toISOString(),
      layout: {
        id: 'layout-1',
        room_id: 'room-1',
        width: 30,
        height: 20,
        spawn_x: 2,
        spawn_y: 2,
        tilemap_data: { ground: [], walls: [] },
        collision_mask: [],
        interactive_objects: [],
        private_zones: [zone],
      },
    };

    vi.spyOn(canvasComp.api, 'updateRoomLayout').mockResolvedValue(undefined as any);
    canvasComp.isBuildMode.set(true);
    canvasComp.selectedZoneId.set('z-1');

    canvasComp.updateSelectedZoneName('Quiet Sanctuary');
    expect(zone.name).toBe('Quiet Sanctuary');

    canvasComp.updateSelectedZoneColor('#8b5cf6');
    expect(zone.color).toBe('#8b5cf6');
  });

  it('should exit build mode and clear selection on exit', () => {
    const fixtureCanvas = TestBed.createComponent(LoungeCanvasComponent);
    const canvasComp = fixtureCanvas.componentInstance;

    canvasComp.isBuildMode.set(true);
    canvasComp.selectedZoneId.set('zone-1');

    canvasComp.exitBuildMode();

    expect(canvasComp.isBuildMode()).toBe(false);
    expect(canvasComp.selectedZoneId()).toBeNull();
  });
});


