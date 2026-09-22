import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InteractiveObject, PrivateZone, RoomDetails } from '../../models/lounge.models';
import { LoungeApiService } from '../../services/lounge-api.service';

@Component({
  selector: 'app-room-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div class="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-base font-bold">
              🛠️
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-100">Room Layout & Object Architect</h2>
              <p class="text-xs text-slate-400">Configure spatial furniture, private discussion zones, and spawn points</p>
            </div>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Tab Bar -->
        <div class="px-6 pt-3 border-b border-slate-800 bg-slate-950/30 flex gap-4">
          <button
            (click)="activeTab.set('objects')"
            class="pb-2.5 text-xs font-semibold border-b-2 transition"
            [class.border-sky-500]="activeTab() === 'objects'"
            [class.text-sky-400]="activeTab() === 'objects'"
            [class.border-transparent]="activeTab() !== 'objects'"
            [class.text-slate-400]="activeTab() !== 'objects'"
          >
            Interactive Objects ({{ objects().length }})
          </button>
          <button
            (click)="activeTab.set('zones')"
            class="pb-2.5 text-xs font-semibold border-b-2 transition"
            [class.border-sky-500]="activeTab() === 'zones'"
            [class.text-sky-400]="activeTab() === 'zones'"
            [class.border-transparent]="activeTab() !== 'zones'"
            [class.text-slate-400]="activeTab() !== 'zones'"
          >
            Private Audio Zones ({{ zones().length }})
          </button>
          <button
            (click)="activeTab.set('spawn')"
            class="pb-2.5 text-xs font-semibold border-b-2 transition"
            [class.border-sky-500]="activeTab() === 'spawn'"
            [class.text-sky-400]="activeTab() === 'spawn'"
            [class.border-transparent]="activeTab() !== 'spawn'"
            [class.text-slate-400]="activeTab() !== 'spawn'"
          >
            Spawn Configuration
          </button>
        </div>

        <!-- Body Content -->
        <div class="p-6 overflow-y-auto flex-1 space-y-6">
          <!-- Objects Tab -->
          @if (activeTab() === 'objects') {
            <div class="space-y-4">
              <!-- Add Object Quick Row -->
              <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-end gap-3 flex-wrap">
                <div class="flex-1 min-w-[140px]">
                  <label class="block text-xs font-medium text-slate-400 mb-1">Object Type</label>
                  <select
                    [(ngModel)]="newObjType"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  >
                    <option value="chair">Ergonomic Chair</option>
                    <option value="desk">Conference Table</option>
                    <option value="whiteboard">Whiteboard</option>
                    <option value="plant">Monstera Plant</option>
                    <option value="water_cooler">Water Cooler</option>
                    <option value="couch">Plush Sofa</option>
                  </select>
                </div>

                <div class="w-20">
                  <label class="block text-xs font-medium text-slate-400 mb-1">Tile X</label>
                  <input
                    type="number"
                    [(ngModel)]="newObjX"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>

                <div class="w-20">
                  <label class="block text-xs font-medium text-slate-400 mb-1">Tile Y</label>
                  <input
                    type="number"
                    [(ngModel)]="newObjY"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>

                <button
                  (click)="addObject()"
                  class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                >
                  + Add Prop
                </button>
              </div>

              <!-- List of Existing Objects -->
              <div class="space-y-2">
                @for (obj of objects(); track obj.id; let idx = $index) {
                  <div class="p-3 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <span class="text-sm">
                        {{ obj.object_type === 'chair' ? '🪑' : obj.object_type === 'desk' ? '🏢' : obj.object_type === 'whiteboard' ? '🖊️' : obj.object_type === 'plant' ? '🪴' : '🛋️' }}
                      </span>
                      <div>
                        <div class="text-xs font-semibold text-slate-200">
                          {{ obj.properties['name'] || obj.object_type }}
                        </div>
                        <div class="text-[11px] text-slate-500 font-mono">
                          Pos: ({{ obj.x }}, {{ obj.y }}) • Size: {{ obj.width }}x{{ obj.height }}
                        </div>
                      </div>
                    </div>

                    <button
                      (click)="removeObject(idx)"
                      class="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs transition"
                    >
                      Delete
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Private Zones Tab -->
          @if (activeTab() === 'zones') {
            <div class="space-y-4">
              <!-- Enter Build Mode Quick Action -->
              <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
                <div class="text-xs">
                  <div class="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>🧱</span>
                    <span>Interactive In-Canvas Build Mode</span>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-0.5">Drag to move and drag handles to resize private zones directly on the lounge canvas.</div>
                </div>
                <button
                  (click)="openBuildMode.emit()"
                  class="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow flex items-center gap-1.5 shrink-0"
                >
                  <span>🧱</span>
                  <span>Enter Build Mode</span>
                </button>
              </div>

              <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-end gap-3 flex-wrap">
                <div class="flex-1 min-w-[140px]">
                  <label class="block text-xs font-medium text-slate-400 mb-1">Zone Name</label>
                  <input
                    type="text"
                    [(ngModel)]="newZoneName"
                    placeholder="e.g. Brainstorm Nook"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>

                <div class="w-16">
                  <label class="block text-xs font-medium text-slate-400 mb-1">X</label>
                  <input
                    type="number"
                    [(ngModel)]="newZoneX"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>
                <div class="w-16">
                  <label class="block text-xs font-medium text-slate-400 mb-1">Y</label>
                  <input
                    type="number"
                    [(ngModel)]="newZoneY"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>
                <div class="w-16">
                  <label class="block text-xs font-medium text-slate-400 mb-1">W</label>
                  <input
                    type="number"
                    [(ngModel)]="newZoneW"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>
                <div class="w-16">
                  <label class="block text-xs font-medium text-slate-400 mb-1">H</label>
                  <input
                    type="number"
                    [(ngModel)]="newZoneH"
                    class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>

                <button
                  (click)="addZone()"
                  class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow"
                >
                  + Create Zone
                </button>
              </div>

              <div class="space-y-2">
                @for (zone of zones(); track zone.id; let idx = $index) {
                  <div class="p-3 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div class="text-xs font-semibold text-sky-400">🔒 {{ zone.name }}</div>
                      <div class="text-[11px] text-slate-500 font-mono">
                        Bounds: ({{ zone.x }}, {{ zone.y }}) - {{ zone.width }}x{{ zone.height }} tiles
                      </div>
                    </div>
                    <button
                      (click)="removeZone(idx)"
                      class="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs transition"
                    >
                      Delete
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Spawn Tab -->
          @if (activeTab() === 'spawn') {
            <div class="p-6 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4 max-w-md">
              <h3 class="text-sm font-semibold text-slate-200">Default Avatar Arrival Coordinates</h3>
              <p class="text-xs text-slate-400">Where new participants will spawn when joining this lounge.</p>

              <div class="flex items-center gap-4">
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Spawn X Tile</label>
                  <input
                    type="number"
                    [(ngModel)]="spawnX"
                    class="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Spawn Y Tile</label>
                  <input
                    type="number"
                    [(ngModel)]="spawnY"
                    class="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  />
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span class="text-xs text-slate-400">All modifications immediately persist to PostgreSQL backend</span>
          <div class="flex items-center gap-3">
            <button
              (click)="close.emit()"
              class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              (click)="saveLayout()"
              [disabled]="isSaving()"
              class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-md flex items-center gap-2"
            >
              @if (isSaving()) {
                <span class="animate-spin text-sm">↻</span>
              }
              <span>Save Room Architecture</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RoomEditorModalComponent implements OnInit {
  @Input() room!: RoomDetails;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  @Output() openBuildMode = new EventEmitter<void>();

  public activeTab = signal<'objects' | 'zones' | 'spawn'>('objects');
  public objects = signal<InteractiveObject[]>([]);
  public zones = signal<PrivateZone[]>([]);
  public spawnX = 6;
  public spawnY = 6;
  public isSaving = signal(false);

  // New object form
  public newObjType = 'chair';
  public newObjX = 10;
  public newObjY = 10;

  // New zone form
  public newZoneName = '';
  public newZoneX = 5;
  public newZoneY = 5;
  public newZoneW = 6;
  public newZoneH = 5;

  constructor(private api: LoungeApiService) {}

  ngOnInit(): void {
    if (this.room) {
      this.objects.set([...this.room.layout.interactive_objects]);
      this.zones.set([...this.room.layout.private_zones]);
      this.spawnX = this.room.layout.spawn_x;
      this.spawnY = this.room.layout.spawn_y;
    }
  }

  addObject(): void {
    const w = this.newObjType === 'desk' ? 4 : this.newObjType === 'couch' ? 3 : 1;
    const h = this.newObjType === 'desk' ? 2 : 1;

    const newObj: InteractiveObject = {
      id: `obj-${Date.now()}`,
      object_type: this.newObjType,
      x: Number(this.newObjX),
      y: Number(this.newObjY),
      width: w,
      height: h,
      direction: 'down',
      properties: { name: this.newObjType.charAt(0).toUpperCase() + this.newObjType.slice(1) },
    };

    this.objects.set([...this.objects(), newObj]);
  }

  removeObject(idx: number): void {
    const list = [...this.objects()];
    list.splice(idx, 1);
    this.objects.set(list);
  }

  addZone(): void {
    if (!this.newZoneName) return;

    const newZone: PrivateZone = {
      id: `zone-${Date.now()}`,
      name: this.newZoneName,
      x: Number(this.newZoneX),
      y: Number(this.newZoneY),
      width: Number(this.newZoneW),
      height: Number(this.newZoneH),
      color: '#3b82f6',
    };

    this.zones.set([...this.zones(), newZone]);
    this.newZoneName = '';
  }

  removeZone(idx: number): void {
    const list = [...this.zones()];
    list.splice(idx, 1);
    this.zones.set(list);
  }

  async saveLayout(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.api.updateRoomLayout(this.room.slug, {
        spawn_x: Number(this.spawnX),
        spawn_y: Number(this.spawnY),
        interactive_objects: this.objects(),
        private_zones: this.zones(),
      });
      this.saved.emit();
      this.close.emit();
    } catch (err) {
      console.error('Failed to save layout:', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
