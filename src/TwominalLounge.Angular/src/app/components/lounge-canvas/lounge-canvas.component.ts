import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoungeApiService } from '../../services/lounge-api.service';
import { ProceduralAssetsService } from '../../services/procedural-assets.service';
import { WebRtcMeshService } from '../../services/webrtc-mesh.service';
import { InteractiveObject, PeerState, PrivateZone, RoomDetails, WallOrientation } from '../../models/lounge.models';
import { OrmLogService } from '../../services/orm-log.service';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ZoneDragState {
  type: 'move' | 'resize';
  zoneId: string;
  handle?: ResizeHandle;
  startTileX: number;
  startTileY: number;
  initialZone: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PositionTarget {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
}

@Component({
  selector: 'app-lounge-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container relative w-full h-full overflow-hidden bg-slate-950 select-none" id="canvas-container">
      <!-- 2D Game Canvas -->
      <canvas #gameCanvas class="block w-full h-full cursor-crosshair"></canvas>

      <!-- Build Mode Top HUD Toolbar -->
      @if (isBuildMode()) {
        <div class="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-2xl w-[94%] sm:w-auto animate-fade-in pointer-events-auto">
          <div class="bg-slate-900/95 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-amber-500/60 shadow-2xl flex items-center gap-3 flex-wrap justify-between sm:justify-start">
            <div class="flex items-center gap-2 pr-2 border-r border-slate-750">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span class="font-bold text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1">
                <span>🧱</span>
                <span>Build Mode</span>
              </span>
            </div>

            <!-- Hint text -->
            <span class="text-[11px] text-slate-300 hidden md:inline">
              Drag zone to move • Drag handles to resize • Snaps to grid
            </span>

            <div class="flex items-center gap-2">
              <button
                (click)="addPrivateZone()"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition flex items-center gap-1"
                title="Add a new private zone"
              >
                <span>+</span>
                <span>Add Zone</span>
              </button>

              <button
                (click)="saveLayout(true)"
                [disabled]="isSavingLayout()"
                class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition flex items-center gap-1"
                title="Save room layout to database"
              >
                <span>{{ isSavingLayout() ? 'Saving...' : saveSuccess() ? 'Saved ✓' : 'Save' }}</span>
              </button>

              <button
                (click)="exitBuildMode()"
                class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                title="Exit build mode"
              >
                Done
              </button>
            </div>
          </div>

          <!-- Selected Zone Inspector Sub-Bar -->
          @if (selectedZone()) {
            <div class="bg-slate-900/95 backdrop-blur-xl px-4 py-2 rounded-xl border border-sky-500/50 shadow-xl flex items-center gap-3 flex-wrap text-xs animate-fade-in">
              <span class="text-sky-400 font-bold flex items-center gap-1">
                <span>🔒</span>
                <span>Zone:</span>
              </span>

              <!-- Zone Name Input -->
              <input
                type="text"
                [value]="selectedZone()!.name"
                (input)="updateSelectedZoneName($any($event.target).value)"
                (keydown)="$event.stopPropagation()"
                placeholder="Zone Name"
                class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs w-36 focus:border-sky-400 focus:outline-none"
              />

              <!-- Color Palette -->
              <div class="flex items-center gap-1">
                @for (c of zoneColors; track c) {
                  <button
                    (click)="updateSelectedZoneColor(c)"
                    class="w-4 h-4 rounded-full border transition hover:scale-125"
                    [style.backgroundColor]="c"
                    [class.border-white]="selectedZone()!.color === c"
                    [class.border-transparent]="selectedZone()!.color !== c"
                    [title]="'Set zone color ' + c"
                  ></button>
                }
              </div>

              <!-- Dimensions & Position Badge -->
              <span class="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-750">
                Pos: ({{ selectedZone()!.x }}, {{ selectedZone()!.y }}) • {{ selectedZone()!.width }}×{{ selectedZone()!.height }} tiles
              </span>

              <!-- Delete Button -->
              <button
                (click)="deleteSelectedZone()"
                class="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-semibold transition flex items-center gap-1 text-[11px]"
                title="Delete this private zone"
              >
                <span>🗑️</span>
                <span>Delete</span>
              </button>
            </div>
          }
        </div>
      }

      <!-- Spatial Hint & Room HUD Overlay -->
      <div class="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
        <div class="bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 text-xs shadow-lg max-w-xs">
          <div class="font-semibold text-teal-300 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-teal-400"></span>
            <span>{{ currentZoneTitle() }}</span>
          </div>
          <p class="text-slate-400 text-[11px] mt-0.5">{{ currentZoneDesc() }}</p>
        </div>

        <div class="bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 shadow flex items-center gap-2">
          <span class="text-amber-400 font-bold">💡 Tips:</span>
          <span>Press <kbd class="px-1 py-0.5 bg-slate-800 rounded font-mono border border-slate-700">WASD</kbd> or <kbd class="px-1 py-0.5 bg-slate-800 rounded font-mono border border-slate-700">Arrows</kbd> / Click to Move. Press <kbd class="px-1 py-0.5 bg-slate-800 rounded font-mono border border-slate-700">E</kbd> near objects. Press <kbd class="px-1 py-0.5 bg-slate-800 rounded font-mono border border-slate-700">B</kbd> for Build Mode.</span>
        </div>
      </div>

      <!-- Interaction Prompt floating badge (Follows target on screen) -->
      @if (nearbyObject() && promptScreenPos()) {
        <div
          class="absolute z-20 bg-teal-500 text-slate-950 px-3 py-1.5 rounded-full font-bold text-xs shadow-xl flex items-center gap-1.5 animate-bounce pointer-events-none"
          [style.left.px]="promptScreenPos()!.x - 70"
          [style.top.px]="promptScreenPos()!.y - 45"
        >
          <span class="w-5 h-5 rounded-full bg-slate-950 text-teal-300 flex items-center justify-center font-mono text-[10px]">E</span>
          <span>{{ promptLabel() }}</span>
        </div>
      }

      <!-- Speed Boost Indicator -->
      @if (speedBoostTimer() > 0) {
        <div class="absolute bottom-16 left-4 z-20 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md animate-pulse">
          <span>☕</span>
          <span>Espresso Speed Boost: {{ (speedBoostTimer() / 60).toFixed(0) }}s</span>
        </div>
      }

      <!-- On-Screen Virtual Controls for Mobile / Touch Devices -->
      <div class="absolute bottom-6 left-6 z-10 md:hidden flex flex-col items-center gap-1">
        <button
          (touchstart)="onVirtualTouch('KeyW', $event)"
          (touchend)="onVirtualTouchEnd('KeyW', $event)"
          (mousedown)="onVirtualTouch('KeyW', $event)"
          (mouseup)="onVirtualTouchEnd('KeyW', $event)"
          class="w-12 h-12 rounded-xl bg-slate-800/80 text-white text-xl font-bold active:bg-teal-600 border border-slate-700 flex items-center justify-center shadow"
        >
          ▲
        </button>
        <div class="flex gap-2">
          <button
            (touchstart)="onVirtualTouch('KeyA', $event)"
            (touchend)="onVirtualTouchEnd('KeyA', $event)"
            (mousedown)="onVirtualTouch('KeyA', $event)"
            (mouseup)="onVirtualTouchEnd('KeyA', $event)"
            class="w-12 h-12 rounded-xl bg-slate-800/80 text-white text-xl font-bold active:bg-teal-600 border border-slate-700 flex items-center justify-center shadow"
          >
            ◀
          </button>
          <button
            (touchstart)="onVirtualTouch('KeyS', $event)"
            (touchend)="onVirtualTouchEnd('KeyS', $event)"
            (mousedown)="onVirtualTouch('KeyS', $event)"
            (mouseup)="onVirtualTouchEnd('KeyS', $event)"
            class="w-12 h-12 rounded-xl bg-slate-800/80 text-white text-xl font-bold active:bg-teal-600 border border-slate-700 flex items-center justify-center shadow"
          >
            ▼
          </button>
          <button
            (touchstart)="onVirtualTouch('KeyD', $event)"
            (touchend)="onVirtualTouchEnd('KeyD', $event)"
            (mousedown)="onVirtualTouch('KeyD', $event)"
            (mouseup)="onVirtualTouchEnd('KeyD', $event)"
            class="w-12 h-12 rounded-xl bg-slate-800/80 text-white text-xl font-bold active:bg-teal-600 border border-slate-700 flex items-center justify-center shadow"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
})
export class LoungeCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() room: RoomDetails | null = null;
  @Output() openWhiteboard = new EventEmitter<void>();
  @Output() buildModeChange = new EventEmitter<boolean>();
  @Output() layoutSaved = new EventEmitter<RoomDetails>();

  public isBuildMode = signal<boolean>(false);
  @Input('isBuildMode') set isBuildModeInput(val: boolean | undefined | null) {
    const active = !!val;
    this.isBuildMode.set(active);
    if (!active) {
      this.selectedZoneId.set(null);
      this.dragState = null;
      this.setCursor('crosshair');
    }
  }

  public selectedZoneId = signal<string | null>(null);
  public hoveredZoneId = signal<string | null>(null);
  public hoveredHandle = signal<ResizeHandle | null>(null);
  public isSavingLayout = signal<boolean>(false);
  public saveSuccess = signal<boolean>(false);
  public readonly zoneColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4'];

  public selectedZone = computed(() => {
    const id = this.selectedZoneId();
    if (!id || !this.room?.layout?.private_zones) return null;
    return this.room.layout.private_zones.find((z) => z.id === id) || null;
  });

  public dragState: ZoneDragState | null = null;
  public justDragged = false;

  public nearbyObject = signal<InteractiveObject | null>(null);
  public promptLabel = signal<string>('Interact');
  public promptScreenPos = signal<{ x: number; y: number } | null>(null);

  public currentZoneTitle = signal<string>('Main Lobby');
  public currentZoneDesc = signal<string>('Walk closer to colleagues to auto-activate audio/video proximity.');
  public currentPrivateZoneName = signal<string | null>(null);
  public speedBoostTimer = signal<number>(0);

  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  private tick: number = 0;

  // Local player coordinates
  public playerX = 12.0;
  public playerY = 8.0;
  public playerDirection: 'up' | 'down' | 'left' | 'right' = 'down';
  public playerMotionState: 'idle' | 'walking' | 'sitting' = 'idle';
  public playerAnimFrame: number = 0;

  // Camera coordinates
  private cameraX = 0;
  private cameraY = 0;
  private readonly zoom = 1.15;

  // Click-to-move target
  private moveTarget: PositionTarget | null = null;
  private readonly keysPressed = new Set<string>();

  // Particle systems
  private steamParticles: Particle[] = [];
  private lastZoneId = 'lobby';

  constructor(
    public api: LoungeApiService,
    private proceduralAssets: ProceduralAssetsService,
    public webrtc: WebRtcMeshService,
    private ormLog: OrmLogService
  ) {
    // Initialize coffee steam particles
    for (let i = 0; i < 20; i++) {
      this.steamParticles.push({
        x: 6.5 + (Math.random() - 0.5) * 0.4,
        y: 15.2 + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.02,
        vy: -0.04 - Math.random() * 0.03,
        alpha: Math.random(),
      });
    }
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resizeCanvas();
    window.addEventListener('resize', this.onResize);

    if (this.room) {
      this.playerX = this.room.layout.spawn_x;
      this.playerY = this.room.layout.spawn_y;
    }

    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.animationId);
  }

  private onResize = (): void => {
    this.resizeCanvas();
  };

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
  }

  private setCursor(cursor: string): void {
    if (this.canvasRef?.nativeElement) {
      this.canvasRef.nativeElement.style.cursor = cursor;
    }
  }

  public screenToWorldTile(screenX: number, screenY: number): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    const width = canvas?.width || 800;
    const height = canvas?.height || 600;
    const tileSize = 32;
    const wx = (screenX - width / 2) / (tileSize * this.zoom) + this.cameraX / tileSize;
    const wy = (screenY - height / 2) / (tileSize * this.zoom) + this.cameraY / tileSize;
    return { x: wx, y: wy };
  }

  public worldTileToScreen(tileX: number, tileY: number): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    const width = canvas?.width || 800;
    const height = canvas?.height || 600;
    const tileSize = 32;
    const sx = (tileX * tileSize - this.cameraX) * this.zoom + width / 2;
    const sy = (tileY * tileSize - this.cameraY) * this.zoom + height / 2;
    return { x: sx, y: sy };
  }

  public getZoneHandlesScreenCoords(zone: PrivateZone): Record<ResizeHandle, { x: number; y: number }> {
    const tl = this.worldTileToScreen(zone.x, zone.y);
    const br = this.worldTileToScreen(zone.x + zone.width, zone.y + zone.height);
    const midX = (tl.x + br.x) / 2;
    const midY = (tl.y + br.y) / 2;

    return {
      nw: { x: tl.x, y: tl.y },
      n:  { x: midX, y: tl.y },
      ne: { x: br.x, y: tl.y },
      e:  { x: br.x, y: midY },
      se: { x: br.x, y: br.y },
      s:  { x: midX, y: br.y },
      sw: { x: tl.x, y: br.y },
      w:  { x: tl.x, y: midY },
    };
  }

  public getHandleAt(screenX: number, screenY: number, zone: PrivateZone): ResizeHandle | null {
    const handles = this.getZoneHandlesScreenCoords(zone);
    const hitRadius = 14;
    for (const [handle, pos] of Object.entries(handles) as [ResizeHandle, { x: number; y: number }][]) {
      if (Math.hypot(screenX - pos.x, screenY - pos.y) <= hitRadius) {
        return handle;
      }
    }
    return null;
  }

  public getZoneAt(worldTileX: number, worldTileY: number): PrivateZone | null {
    if (!this.room) return null;
    const zones = this.room.layout.private_zones;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (
        worldTileX >= z.x &&
        worldTileX < z.x + z.width &&
        worldTileY >= z.y &&
        worldTileY < z.y + z.height
      ) {
        return z;
      }
    }
    return null;
  }

  public getCursorForHandle(handle: ResizeHandle): string {
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
    }
  }

  public startMove(zone: PrivateZone, startTileX: number, startTileY: number): void {
    this.selectedZoneId.set(zone.id);
    this.dragState = {
      type: 'move',
      zoneId: zone.id,
      startTileX,
      startTileY,
      initialZone: {
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
      },
    };
    this.setCursor('grabbing');
  }

  public startResize(
    zone: PrivateZone,
    handle: ResizeHandle,
    startTileX: number,
    startTileY: number
  ): void {
    this.selectedZoneId.set(zone.id);
    this.dragState = {
      type: 'resize',
      zoneId: zone.id,
      handle,
      startTileX,
      startTileY,
      initialZone: {
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
      },
    };
    this.setCursor(this.getCursorForHandle(handle));
  }

  public applyDrag(worldTileX: number, worldTileY: number): void {
    if (!this.dragState || !this.room) return;
    const target = this.room.layout.private_zones.find((z) => z.id === this.dragState?.zoneId);
    if (!target) return;

    const mapW = this.room.layout.width || 30;
    const mapH = this.room.layout.height || 20;
    const init = this.dragState.initialZone;
    const dTileX = Math.round(worldTileX - this.dragState.startTileX);
    const dTileY = Math.round(worldTileY - this.dragState.startTileY);
    const minSize = 2;

    if (this.dragState.type === 'move') {
      let newX = init.x + dTileX;
      let newY = init.y + dTileY;
      newX = Math.max(0, Math.min(mapW - init.width, newX));
      newY = Math.max(0, Math.min(mapH - init.height, newY));
      target.x = newX;
      target.y = newY;
      this.setCursor('grabbing');
    } else if (this.dragState.type === 'resize' && this.dragState.handle) {
      const h = this.dragState.handle;
      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      // Horizontal
      if (h.includes('e')) {
        newW = Math.max(minSize, init.width + dTileX);
        newW = Math.min(mapW - init.x, newW);
      } else if (h.includes('w')) {
        const maxDx = init.width - minSize;
        const clampedDx = Math.min(maxDx, Math.max(-init.x, dTileX));
        newX = init.x + clampedDx;
        newW = init.width - clampedDx;
      }

      // Vertical
      if (h.includes('s')) {
        newH = Math.max(minSize, init.height + dTileY);
        newH = Math.min(mapH - init.y, newH);
      } else if (h.includes('n')) {
        const maxDy = init.height - minSize;
        const clampedDy = Math.min(maxDy, Math.max(-init.y, dTileY));
        newY = init.y + clampedDy;
        newH = init.height - clampedDy;
      }

      target.x = newX;
      target.y = newY;
      target.width = newW;
      target.height = newH;

      this.setCursor(this.getCursorForHandle(h));
    }
  }

  public finishDrag(): void {
    if (!this.dragState || !this.room) return;
    const target = this.room.layout.private_zones.find((z) => z.id === this.dragState?.zoneId);
    const init = this.dragState.initialZone;
    const actionType = this.dragState.type;
    this.dragState = null;

    if (
      target &&
      (target.x !== init.x ||
        target.y !== init.y ||
        target.width !== init.width ||
        target.height !== init.height)
    ) {
      this.ormLog.log(actionType === 'move' ? 'ZONE_MOVED' : 'ZONE_RESIZED', {
        zone_id: target.id,
        name: target.name,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      });
      this.saveLayout();
      this.checkCurrentZone();
    }

    setTimeout(() => {
      this.justDragged = false;
    }, 150);
  }

  public toggleBuildMode(): void {
    const next = !this.isBuildMode();
    this.isBuildMode.set(next);
    if (!next) {
      this.selectedZoneId.set(null);
      this.dragState = null;
      this.setCursor('crosshair');
    }
    this.buildModeChange.emit(next);
    this.ormLog.log('BUILD_MODE_TOGGLED', { active: next });
  }

  public exitBuildMode(): void {
    this.isBuildMode.set(false);
    this.selectedZoneId.set(null);
    this.dragState = null;
    this.setCursor('crosshair');
    this.buildModeChange.emit(false);
    this.ormLog.log('BUILD_MODE_TOGGLED', { active: false });
  }

  public addPrivateZone(): void {
    if (!this.room) return;
    const mapW = this.room.layout.width || 30;
    const mapH = this.room.layout.height || 20;

    const placeX = Math.max(1, Math.min(mapW - 6, Math.round(this.playerX) - 2));
    const placeY = Math.max(1, Math.min(mapH - 5, Math.round(this.playerY) - 2));

    const zoneCount = this.room.layout.private_zones.length + 1;
    const newZone: PrivateZone = {
      id: `zone-${Date.now()}`,
      name: `Private Pod ${zoneCount}`,
      x: placeX,
      y: placeY,
      width: 6,
      height: 5,
      color: this.zoneColors[(zoneCount - 1) % this.zoneColors.length],
    };

    this.room.layout.private_zones.push(newZone);
    this.selectedZoneId.set(newZone.id);
    this.saveLayout(true);
    this.checkCurrentZone();
    this.ormLog.log('ZONE_CREATED', {
      zone_id: newZone.id,
      name: newZone.name,
      x: newZone.x,
      y: newZone.y,
      width: newZone.width,
      height: newZone.height,
    });
  }

  public deleteSelectedZone(): void {
    const id = this.selectedZoneId();
    if (!id || !this.room) return;
    const idx = this.room.layout.private_zones.findIndex((z) => z.id === id);
    if (idx !== -1) {
      const removed = this.room.layout.private_zones.splice(idx, 1)[0];
      this.selectedZoneId.set(null);
      this.saveLayout(true);
      this.checkCurrentZone();
      this.ormLog.log('ZONE_DELETED', {
        zone_id: removed.id,
        name: removed.name,
      });
    }
  }

  public updateSelectedZoneName(name: string): void {
    const zone = this.selectedZone();
    if (zone && name.trim()) {
      zone.name = name.trim();
      this.saveLayout();
      this.checkCurrentZone();
    }
  }

  public updateSelectedZoneColor(color: string): void {
    const zone = this.selectedZone();
    if (zone) {
      zone.color = color;
      this.saveLayout();
    }
  }

  public async saveLayout(showFeedback = false): Promise<void> {
    if (!this.room) return;
    this.isSavingLayout.set(true);
    try {
      await this.api.updateRoomLayout(this.room.slug, {
        private_zones: this.room.layout.private_zones,
      });
      if (showFeedback) {
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 2000);
      }
      this.layoutSaved.emit(this.room);
    } catch (err) {
      console.error('Failed to save layout:', err);
    } finally {
      this.isSavingLayout.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    this.api.spatialAudio.resumeAudioContext();
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    ) {
      return;
    }

    if (e.code === 'KeyB') {
      e.preventDefault();
      this.toggleBuildMode();
      return;
    }

    if (this.isBuildMode()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.selectedZoneId()) {
          this.selectedZoneId.set(null);
        } else {
          this.exitBuildMode();
        }
        return;
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (this.selectedZoneId()) {
          e.preventDefault();
          this.deleteSelectedZone();
          return;
        }
      }
    }

    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].includes(
        e.code
      )
    ) {
      e.preventDefault();
      this.keysPressed.add(e.code);

      if (e.code === 'KeyE') {
        this.triggerInteraction();
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    this.keysPressed.delete(e.code);
  }

  @HostListener('click', ['$event'])
  onCanvasClick(e: MouseEvent): void {
    if (this.isBuildMode() || this.justDragged) {
      return;
    }
    this.api.spatialAudio.resumeAudioContext();
    if (!this.room) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 32;
    // Unproject to world tile coordinates
    const worldX = (clickX - canvas.width / 2) / (tileSize * this.zoom) + this.cameraX / tileSize;
    const worldY = (clickY - canvas.height / 2) / (tileSize * this.zoom) + this.cameraY / tileSize;

    if (this.canMoveTo(worldX, worldY)) {
      this.moveTarget = { x: worldX, y: worldY };
    }
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent): void {
    if (!this.isBuildMode() || !this.room) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.screenToWorldTile(screenX, screenY);

    const selZone = this.selectedZone();
    if (selZone) {
      const handle = this.getHandleAt(screenX, screenY, selZone);
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        this.startResize(selZone, handle, world.x, world.y);
        return;
      }
    }

    const clickedZone = this.getZoneAt(world.x, world.y);
    if (clickedZone) {
      e.preventDefault();
      e.stopPropagation();
      this.startMove(clickedZone, world.x, world.y);
      return;
    }

    this.selectedZoneId.set(null);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.isBuildMode() || !this.room) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.screenToWorldTile(screenX, screenY);

    if (this.dragState) {
      this.applyDrag(world.x, world.y);
      this.justDragged = true;
      return;
    }

    const selZone = this.selectedZone();
    if (selZone) {
      const handle = this.getHandleAt(screenX, screenY, selZone);
      if (handle) {
        this.hoveredHandle.set(handle);
        this.hoveredZoneId.set(selZone.id);
        this.setCursor(this.getCursorForHandle(handle));
        return;
      }
    }
    this.hoveredHandle.set(null);

    const hovered = this.getZoneAt(world.x, world.y);
    if (hovered) {
      this.hoveredZoneId.set(hovered.id);
      this.setCursor('grab');
    } else {
      this.hoveredZoneId.set(null);
      this.setCursor('default');
    }
  }

  @HostListener('window:mouseup', ['$event'])
  onMouseUp(e: MouseEvent): void {
    if (!this.isBuildMode() || !this.dragState) return;
    this.finishDrag();
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(e: TouchEvent): void {
    if (!this.isBuildMode() || !this.room || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = touch.clientX - rect.left;
    const screenY = touch.clientY - rect.top;
    const world = this.screenToWorldTile(screenX, screenY);

    const selZone = this.selectedZone();
    if (selZone) {
      const handle = this.getHandleAt(screenX, screenY, selZone);
      if (handle) {
        e.preventDefault();
        this.startResize(selZone, handle, world.x, world.y);
        return;
      }
    }

    const clickedZone = this.getZoneAt(world.x, world.y);
    if (clickedZone) {
      e.preventDefault();
      this.startMove(clickedZone, world.x, world.y);
      return;
    }

    this.selectedZoneId.set(null);
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(e: TouchEvent): void {
    if (!this.isBuildMode() || !this.dragState || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = touch.clientX - rect.left;
    const screenY = touch.clientY - rect.top;
    const world = this.screenToWorldTile(screenX, screenY);

    e.preventDefault();
    this.applyDrag(world.x, world.y);
    this.justDragged = true;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(e: TouchEvent): void {
    if (!this.isBuildMode() || !this.dragState) return;
    this.finishDrag();
  }

  onVirtualTouch(code: string, event: Event): void {
    event.preventDefault();
    this.keysPressed.add(code);
  }

  onVirtualTouchEnd(code: string, event: Event): void {
    event.preventDefault();
    this.keysPressed.delete(code);
  }

  public isInteractiveObject(obj: InteractiveObject | null | undefined): boolean {
    if (!obj) return false;
    const interactiveTypes = ['whiteboard', 'chair', 'coffee', 'arcade', 'fountain'];
    if (interactiveTypes.includes(obj.object_type)) {
      return true;
    }
    const id = (obj.id || '').toLowerCase();
    return (
      id === 'whiteboard' ||
      id.includes('whiteboard') ||
      id.includes('coffee') ||
      id.includes('arcade') ||
      id.includes('fountain') ||
      id.includes('chair')
    );
  }

  private triggerInteraction(): void {
    const obj = this.nearbyObject();
    if (!obj || !this.isInteractiveObject(obj)) return;

    if (obj.object_type === 'whiteboard' || obj.id === 'whiteboard' || obj.id.includes('whiteboard')) {
      this.openWhiteboard.emit();
      this.api.spatialAudio.playSfx('join');
    } else if (obj.object_type === 'coffee' || obj.id === 'coffee_machine' || obj.id === 'obj-coffee' || obj.id.includes('coffee')) {
      this.api.spatialAudio.playSfx('coffee');
      this.speedBoostTimer.set(300); // 5 seconds at 60 FPS
      this.api.localEmote.set('☕');
      this.api.localEmoteTimer.set(180);
      this.api.appendSystemMessage('You drank a fresh espresso! Movement speed boosted for 5 seconds.');
      this.ormLog.log('SPEED_BOOST', { duration_sec: 5, multiplier: 1.5, item: 'Espresso' });
      this.api.sendInteract(obj.id, 'drink');
    } else if (obj.object_type === 'arcade' || obj.id === 'arcade_cabinet' || obj.id.includes('arcade')) {
      this.api.spatialAudio.playSfx('arcade');
      this.api.localEmote.set('🕹️');
      this.api.localEmoteTimer.set(180);
      this.api.appendSystemMessage('Twominal Arcade High Score: 42,800 pts by Sarah!');
      this.ormLog.log('ARCADE_PLAYED', { score: 42800, object: obj.properties['name'] || 'Retro Arcade' });
      this.api.sendInteract(obj.id, 'play');
    } else if (obj.object_type === 'fountain' || obj.id === 'water_fountain' || obj.id.includes('fountain')) {
      this.api.spatialAudio.playSfx('fountain');
      this.api.localEmote.set('⛲');
      this.api.localEmoteTimer.set(180);
      this.api.appendSystemMessage('Tranquil garden fountain: taking a refreshing deep breath...');
      this.ormLog.log('FOUNTAIN_INTERACT', { status: 'zen_relaxation' });
      this.api.sendInteract(obj.id, 'relax');
    } else if (obj.object_type === 'chair' || obj.id.includes('chair')) {
      this.playerMotionState = this.playerMotionState === 'sitting' ? 'idle' : 'sitting';
      if (obj.direction) {
        this.playerDirection = obj.direction as any;
      }
      this.api.sendInteract(obj.id, 'sit', { sitting: this.playerMotionState === 'sitting' });
    }
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.tick++;
      this.updatePhysics();
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private updatePhysics(): void {
    if (!this.room) return;

    // Base speed with boost check
    const baseSpeed = 0.12;
    const speedMultiplier = this.speedBoostTimer() > 0 ? 1.55 : 1.0;
    const speed = baseSpeed * speedMultiplier;

    if (this.speedBoostTimer() > 0) {
      this.speedBoostTimer.update((t) => t - 1);
    }

    let dx = 0;
    let dy = 0;

    // Keyboard controls
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
      dy -= speed;
      this.playerDirection = 'up';
      this.moveTarget = null;
    }
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
      dy += speed;
      this.playerDirection = 'down';
      this.moveTarget = null;
    }
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
      dx -= speed;
      this.playerDirection = 'left';
      this.moveTarget = null;
    }
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
      dx += speed;
      this.playerDirection = 'right';
      this.moveTarget = null;
    }

    // Click pathfinding
    if (this.moveTarget && dx === 0 && dy === 0) {
      const distDx = this.moveTarget.x - this.playerX;
      const distDy = this.moveTarget.y - this.playerY;
      const dist = Math.hypot(distDx, distDy);

      if (dist < speed) {
        this.playerX = this.moveTarget.x;
        this.playerY = this.moveTarget.y;
        this.moveTarget = null;
      } else {
        dx = (distDx / dist) * speed;
        dy = (distDy / dist) * speed;
        if (Math.abs(distDx) > Math.abs(distDy)) {
          this.playerDirection = distDx > 0 ? 'right' : 'left';
        } else {
          this.playerDirection = distDy > 0 ? 'down' : 'up';
        }
      }
    }

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      this.playerMotionState = 'walking';
      if (this.tick % 6 === 0) {
        this.playerAnimFrame = (this.playerAnimFrame + 1) % 4;
      }

      if (this.tick % 24 === 0) {
        this.api.spatialAudio.playSfx('step');
      }

      const nextX = this.playerX + dx;
      const nextY = this.playerY + dy;

      if (this.canMoveTo(nextX, this.playerY)) {
        this.playerX = nextX;
      }
      if (this.canMoveTo(this.playerX, nextY)) {
        this.playerY = nextY;
      }

      if (this.tick % 3 === 0) {
        this.api.sendMove(this.playerX, this.playerY, this.playerDirection, this.playerMotionState);
      }
    } else {
      if (this.playerMotionState === 'walking') {
        this.playerMotionState = 'idle';
        this.playerAnimFrame = 0;
        this.api.sendMove(this.playerX, this.playerY, this.playerDirection, this.playerMotionState);
      }
    }

    // Interpolate remote peers
    const peers = this.api.peers();
    for (const peer of peers.values()) {
      if (peer.target_x !== undefined && peer.target_y !== undefined) {
        const pdx = peer.target_x - peer.x;
        const pdy = peer.target_y - peer.y;
        const pdist = Math.hypot(pdx, pdy);

        if (pdist > 0.01) {
          peer.x += pdx * 0.25;
          peer.y += pdy * 0.25;
          if (this.tick % 6 === 0) {
            peer.anim_frame = ((peer.anim_frame || 0) + 1) % 4;
          }
        } else {
          peer.anim_frame = 0;
        }
      }

      if (peer.emoteTimer && peer.emoteTimer > 0) {
        peer.emoteTimer--;
        if (peer.emoteTimer <= 0) peer.currentEmote = null;
      }
    }

    // Local emote countdown
    if (this.api.localEmoteTimer() > 0) {
      this.api.localEmoteTimer.update((t) => t - 1);
      if (this.api.localEmoteTimer() <= 0) {
        this.api.localEmote.set(null);
      }
    }

    // Update nearby interactive objects and zones
    this.checkNearbyObjects();
    this.checkCurrentZone();

    // Update steam particles
    for (const p of this.steamParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.012;
      if (p.alpha <= 0) {
        p.x = 6.5 + (Math.random() - 0.5) * 0.4;
        p.y = 15.2;
        p.alpha = 0.8;
      }
    }
  }

  private canMoveTo(x: number, y: number): boolean {
    if (!this.room) return false;
    const { width, height, collision_mask } = this.room.layout;
    if (x < 0.6 || y < 0.6 || x >= width - 0.6 || y >= height - 0.6) {
      return false;
    }
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (ty >= 0 && ty < collision_mask.length && tx >= 0 && tx < collision_mask[ty].length) {
      return !collision_mask[ty][tx];
    }
    return true;
  }

  private checkNearbyObjects(): void {
    if (!this.room) return;
    let found: InteractiveObject | null = null;

    for (const obj of this.room.layout.interactive_objects) {
      if (!this.isInteractiveObject(obj)) {
        continue;
      }

      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;
      const dist = Math.hypot(centerX - this.playerX, centerY - this.playerY);

      if (dist < 2.0) {
        found = obj;
        break;
      }
    }

    this.nearbyObject.set(found);

    if (found) {
      const tileSize = 32;
      const canvas = this.canvasRef.nativeElement;
      const centerX = (found.x + found.width / 2) * tileSize;
      const centerY = (found.y + found.height / 2) * tileSize;

      const screenX = (centerX - this.cameraX) * this.zoom + canvas.width / 2;
      const screenY = (centerY - this.cameraY) * this.zoom + canvas.height / 2;

      this.promptScreenPos.set({ x: screenX, y: screenY });

      const name = found.properties?.['name'] || found.object_type;
      if (found.object_type === 'chair' || found.id.includes('chair')) {
        this.promptLabel.set(this.playerMotionState === 'sitting' ? 'Press E to Stand' : 'Press E to Sit');
      } else {
        this.promptLabel.set(`Press E for ${name}`);
      }
    } else {
      this.promptScreenPos.set(null);
    }
  }

  private checkCurrentZone(): void {
    if (!this.room) return;
    const rx = Math.round(this.playerX);
    const ry = Math.round(this.playerY);

    let foundZone: PrivateZone | null = null;
    for (const zone of this.room.layout.private_zones) {
      if (rx >= zone.x && rx < zone.x + zone.width && ry >= zone.y && ry < zone.y + zone.height) {
        foundZone = zone;
        break;
      }
    }

    const zoneId = foundZone?.id || 'lobby';
    if (zoneId !== this.lastZoneId) {
      const prev = this.lastZoneId;
      this.lastZoneId = zoneId;

      if (foundZone) {
        this.currentZoneTitle.set(foundZone.name);
        this.currentZoneDesc.set('Private pod zone. Conversations are isolated inside this pod.');
        this.currentPrivateZoneName.set(foundZone.name);
      } else {
        this.currentZoneTitle.set('Main Lobby');
        this.currentZoneDesc.set('Central gathering space. Walk closer to colleagues to chat.');
        this.currentPrivateZoneName.set(null);
      }

      this.ormLog.log('ZONE_TRANSITION', {
        user: this.api.currentUser()?.display_name || 'You',
        from: prev,
        to: zoneId,
        zone_name: this.currentZoneTitle(),
      });
    }
  }

  private render(): void {
    if (!this.room) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    const tileSize = 32;

    // Smooth camera tracking
    const targetCamX = this.playerX * tileSize;
    const targetCamY = this.playerY * tileSize;
    this.cameraX += (targetCamX - this.cameraX) * 0.12;
    this.cameraY += (targetCamY - this.cameraY) * 0.12;

    // Clear backdrop
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    const { width, height, tilemap_data, private_zones, interactive_objects } = this.room.layout;

    // 1. Draw ground tiles
    if (tilemap_data.ground) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = tilemap_data.ground[y]?.[x] || 1;
          this.proceduralAssets.drawGroundTile(ctx, tile, x * tileSize, y * tileSize, tileSize);
        }
      }
    }

    // Draw tile grid overlay if Build Mode is active
    if (this.isBuildMode()) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * tileSize, 0);
        ctx.lineTo(x * tileSize, height * tileSize);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * tileSize);
        ctx.lineTo(width * tileSize, y * tileSize);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 2. Draw private discussion zones
    for (const zone of private_zones) {
      const isPlayerInside = this.currentPrivateZoneName() === zone.name;
      const isSelected = this.isBuildMode() && this.selectedZoneId() === zone.id;
      const isHovered = this.isBuildMode() && this.hoveredZoneId() === zone.id && !isSelected;

      if (this.isBuildMode()) {
        this.drawBuildModeZone(ctx, zone, tileSize, isSelected, isHovered);
      } else {
        this.proceduralAssets.drawPrivateZoneOverlay(ctx, zone, tileSize, isPlayerInside);

        // Zone title header pill on floor
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(zone.x * tileSize + 8, zone.y * tileSize + 8, 140, 22);
        ctx.strokeStyle = 'rgba(20, 184, 166, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(zone.x * tileSize + 8, zone.y * tileSize + 8, 140, 22);

        ctx.fillStyle = '#14b8a6';
        ctx.font = 'bold 10px Inter, system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(zone.name.toUpperCase(), zone.x * tileSize + 14, zone.y * tileSize + 22);
      }
    }

    // 3. Draw Zen Garden pond ripples if nearby
    const pondX = 23 * tileSize;
    const pondY = 16 * tileSize;
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(pondX, pondY, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const time = this.tick * 0.04;
    ctx.beginPath();
    ctx.arc(pondX, pondY, 18 + Math.sin(time) * 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Draw Coffee Steam Particles
    for (const p of this.steamParticles) {
      ctx.fillStyle = `rgba(226, 232, 240, ${p.alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x * tileSize, p.y * tileSize, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Draw Proximity Halo around local player
    const playerPixelX = this.playerX * tileSize;
    const playerPixelY = this.playerY * tileSize;
    const proxRadiusPx = 130;
    ctx.beginPath();
    ctx.arc(playerPixelX, playerPixelY, proxRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 184, 166, 0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.28)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Click destination target pin
    if (this.moveTarget) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.moveTarget.x * tileSize, this.moveTarget.y * tileSize, 6 + Math.sin(this.tick * 0.1) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 7. Dynamic Audio Connection Beams
    const peers = Array.from(this.api.peers().values());
    for (const peer of peers) {
      const pdx = peer.x * tileSize - playerPixelX;
      const pdy = peer.y * tileSize - playerPixelY;
      const dist = Math.hypot(pdx, pdy);

      const inSameZone = peer.private_zone_id && peer.private_zone_id === this.lastZoneId;
      if (dist <= proxRadiusPx || inSameZone) {
        ctx.beginPath();
        ctx.moveTo(playerPixelX, playerPixelY);
        ctx.lineTo(peer.x * tileSize, peer.y * tileSize);
        ctx.strokeStyle = inSameZone ? 'rgba(56, 189, 248, 0.45)' : 'rgba(20, 184, 166, 0.4)';
        ctx.lineWidth = Math.max(1, 3.5 - (dist / proxRadiusPx) * 2.5);
        ctx.stroke();

        const normDist = Math.min(1.0, dist / proxRadiusPx);
        const volume = inSameZone ? 1.0 : (1.0 - normDist) * (1.0 - normDist);
        const pan = Math.max(-1.0, Math.min(1.0, pdx / proxRadiusPx));
        this.api.spatialAudio.updatePeerSpatialAudio(peer.peer_id, volume, pan);
      } else {
        this.api.spatialAudio.updatePeerSpatialAudio(peer.peer_id, 0.0, 0.0);
      }
    }

    // 8. Y-Sorted Entity Rendering
    interface RenderEntity {
      yOrder: number;
      draw: () => void;
    }
    const renderList: RenderEntity[] = [];

    // Furniture / Obstacles
    for (const obj of interactive_objects) {
      renderList.push({
        yOrder: (obj.y + obj.height) * tileSize,
        draw: () => {
          this.proceduralAssets.drawFurniture(ctx, obj, obj.x * tileSize, obj.y * tileSize, tileSize, this.tick);
        },
      });
    }

    // Walls
    if (tilemap_data.walls) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const wall = tilemap_data.walls[y]?.[x] || 0;
          if (wall > 0) {
            const orientation = this.getWallOrientation(x, y, width, height, tilemap_data.walls);
            renderList.push({
              yOrder: (y + 1) * tileSize,
              draw: () => {
                this.proceduralAssets.drawWallTile(ctx, wall, x * tileSize, y * tileSize, tileSize, orientation);
              },
            });
          }
        }
      }
    }

    // Remote Peers
    for (const peer of peers) {
      renderList.push({
        yOrder: peer.y * tileSize,
        draw: () => {
          const px = peer.x * tileSize;
          const py = peer.y * tileSize;

          this.proceduralAssets.drawAvatar(
            ctx,
            px,
            py,
            peer.direction,
            peer.anim_frame || 0,
            peer.avatar_config,
            1.0,
            false
          );

          // Name Tag & Status
          ctx.font = 'bold 10px Inter, system-ui';
          ctx.textAlign = 'center';
          const nameWidth = ctx.measureText(peer.display_name).width;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(px - nameWidth / 2 - 8, py - 36, nameWidth + 16, 15);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px - nameWidth / 2 - 8, py - 36, nameWidth + 16, 15);

          ctx.fillStyle = peer.mic_muted ? '#ef4444' : '#10b981';
          ctx.beginPath();
          ctx.arc(px - nameWidth / 2 - 2, py - 29, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(peer.display_name, px + 4, py - 25);

          // Emote bubble popup
          if (peer.currentEmote) {
            this.drawEmoteBubble(ctx, px, py, peer.currentEmote);
          }
        },
      });
    }

    // Local Player
    const user = this.api.currentUser();
    if (user) {
      renderList.push({
        yOrder: this.playerY * tileSize,
        draw: () => {
          this.proceduralAssets.drawAvatar(
            ctx,
            playerPixelX,
            playerPixelY,
            this.playerDirection,
            this.playerAnimFrame,
            user.avatar_config,
            1.0,
            true
          );

          // Player Gold/Teal Ring
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(playerPixelX, playerPixelY, 17, 0, Math.PI * 2);
          ctx.stroke();

          // Name Tag Pill
          const name = `${user.display_name} (You)`;
          ctx.font = 'bold 10px Inter, system-ui';
          ctx.textAlign = 'center';
          const nameWidth = ctx.measureText(name).width;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(playerPixelX - nameWidth / 2 - 8, playerPixelY - 36, nameWidth + 16, 15);
          ctx.strokeStyle = 'rgba(20, 184, 166, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(playerPixelX - nameWidth / 2 - 8, playerPixelY - 36, nameWidth + 16, 15);

          const isMicOn = this.webrtc.isMicEnabled() && this.webrtc.hasAudioTrack();
          ctx.fillStyle = isMicOn ? (this.webrtc.micLevel() > 10 ? '#34d399' : '#10b981') : '#ef4444';
          ctx.beginPath();
          ctx.arc(playerPixelX - nameWidth / 2 - 2, playerPixelY - 29, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#5eead4';
          ctx.fillText(name, playerPixelX + 4, playerPixelY - 25);

          // Local Player Emote Bubble
          if (this.api.localEmote()) {
            this.drawEmoteBubble(ctx, playerPixelX, playerPixelY, this.api.localEmote()!);
          }
        },
      });
    }

    // Sort by Y and render
    renderList.sort((a, b) => a.yOrder - b.yOrder);
    for (const item of renderList) {
      item.draw();
    }

    ctx.restore();
  }

  private getWallOrientation(
    x: number,
    y: number,
    width: number,
    height: number,
    walls: number[][]
  ): WallOrientation {
    const isW = (tx: number, ty: number) => {
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
      return (walls[ty]?.[tx] || 0) > 0;
    };

    const hasN = isW(x, y - 1);
    const hasS = isW(x, y + 1);
    const hasW = isW(x - 1, y);
    const hasE = isW(x + 1, y);

    // 1. Perimeter corners
    if (x === 0 && y === 0) return 'corner-top-left';
    if (x === width - 1 && y === 0) return 'corner-top-right';
    if (x === 0 && y === height - 1) return 'corner-bottom-left';
    if (x === width - 1 && y === height - 1) return 'corner-bottom-right';

    // 2. Left side wall (perimeter left wall, or vertical wall segment with room to the right)
    if (x === 0 || (!hasW && hasE && (hasN || hasS))) {
      return 'side-left';
    }

    // 3. Right side wall (perimeter right wall, or vertical wall segment with room to the left)
    if (x === width - 1 || (hasW && !hasE && (hasN || hasS))) {
      return 'side-right';
    }

    // 4. Vertical partition wall (running north-south with open space on both sides)
    if ((hasN || hasS) && !hasW && !hasE) {
      return 'vertical';
    }

    // 5. Default horizontal wall (top / bottom walls or horizontal segments)
    return 'horizontal';
  }

  private drawEmoteBubble(ctx: CanvasRenderingContext2D, x: number, y: number, emoji: string): void {
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.arc(x, y - 50, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillText(emoji, x, y - 44);
  }

  private drawBuildModeZone(
    ctx: CanvasRenderingContext2D,
    zone: PrivateZone,
    tileSize: number,
    isSelected: boolean,
    isHovered: boolean
  ): void {
    const x = zone.x * tileSize;
    const y = zone.y * tileSize;
    const w = zone.width * tileSize;
    const h = zone.height * tileSize;
    const color = zone.color || '#3b82f6';

    ctx.save();

    // Fill
    if (isSelected) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.14)';
    } else {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.07)';
    }
    ctx.fillRect(x, y, w, h);

    // Border
    if (isSelected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      const offset = (this.tick * 0.4) % 12;
      try {
        ctx.lineDashOffset = -offset;
      } catch (_) {}
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      try {
        ctx.lineDashOffset = 0;
      } catch (_) {}
    } else if (isHovered) {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Top-left Zone Header Pill
    const pillW = Math.min(w - 8, Math.max(90, zone.name.length * 8 + 26));
    ctx.fillStyle = isSelected ? '#1e3a8a' : 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, pillW, 20, 4);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isSelected ? '#93c5fd' : '#e2e8f0';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`🔒 ${zone.name}`, x + 10, y + 18);

    // Bottom-right dimension tag
    const dimText = `${zone.width}×${zone.height} tiles`;
    ctx.font = '500 10px JetBrains Mono, monospace';
    const dimW = ctx.measureText(dimText).width + 12;
    if (w > dimW + 10 && h > 45) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(x + w - dimW - 4, y + h - 22, dimW, 18, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(dimText, x + w - dimW + 2, y + h - 9);
    }

    // If Selected, draw the 8 resize handles
    if (isSelected) {
      this.drawResizeHandles(ctx, zone, tileSize);
    }

    ctx.restore();
  }

  private drawResizeHandles(ctx: CanvasRenderingContext2D, zone: PrivateZone, tileSize: number): void {
    const x = zone.x * tileSize;
    const y = zone.y * tileSize;
    const w = zone.width * tileSize;
    const h = zone.height * tileSize;
    const halfHandle = 5 / this.zoom;
    const handleSize = halfHandle * 2;

    const handles: { key: ResizeHandle; x: number; y: number }[] = [
      { key: 'nw', x: x, y: y },
      { key: 'n',  x: x + w / 2, y: y },
      { key: 'ne', x: x + w, y: y },
      { key: 'e',  x: x + w, y: y + h / 2 },
      { key: 'se', x: x + w, y: y + h },
      { key: 's',  x: x + w / 2, y: y + h },
      { key: 'sw', x: x, y: y + h },
      { key: 'w',  x: x, y: y + h / 2 },
    ];

    for (const hd of handles) {
      const isHovered = this.hoveredHandle() === hd.key;
      ctx.fillStyle = isHovered ? '#38bdf8' : '#ffffff';
      ctx.strokeStyle = isHovered ? '#ffffff' : '#0284c7';
      ctx.lineWidth = 2 / this.zoom;

      ctx.beginPath();
      ctx.rect(hd.x - halfHandle, hd.y - halfHandle, handleSize, handleSize);
      ctx.fill();
      ctx.stroke();
    }
  }
}

