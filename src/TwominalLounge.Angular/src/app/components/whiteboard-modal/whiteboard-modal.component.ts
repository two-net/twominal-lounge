import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LoungeApiService } from '../../services/lounge-api.service';
import { SharedCursor, WhiteboardNote } from '../../models/lounge.models';

interface StrokePoint {
  x: number;
  y: number;
}

interface StrokeData {
  points: StrokePoint[];
  color: string;
  size: number;
  isEraser: boolean;
}

@Component({
  selector: 'app-whiteboard-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div class="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div class="flex items-center gap-3">
            <span class="text-2xl">📋</span>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-white text-base">Lounge Interactive Whiteboard</h3>
                <span class="text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30">Live Sync</span>
              </div>
              <p class="text-xs text-slate-400">PostgreSQL Relational Persistence • Real-time WebSocket Broadcast</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Mode switcher tabs -->
            <div class="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                (click)="activeTab.set('notes')"
                class="px-3 py-1.5 rounded-lg font-semibold transition"
                [class.bg-teal-600]="activeTab() === 'notes'"
                [class.text-slate-950]="activeTab() === 'notes'"
                [class.text-slate-300]="activeTab() !== 'notes'"
              >
                📝 Sticky Notes
              </button>
              <button
                (click)="activeTab.set('draw')"
                class="px-3 py-1.5 rounded-lg font-semibold transition"
                [class.bg-teal-600]="activeTab() === 'draw'"
                [class.text-slate-950]="activeTab() === 'draw'"
                [class.text-slate-300]="activeTab() !== 'draw'"
              >
                🖊️ Freehand Sketch
              </button>
            </div>

            <button
              (click)="close.emit()"
              class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- TAB 1: STICKY NOTES BOARD -->
        @if (activeTab() === 'notes') {
          <div class="p-5 flex-1 flex flex-col bg-slate-950 overflow-y-auto custom-scrollbar">
            <!-- Note creation bar -->
            <div class="flex gap-2 mb-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
              <input
                type="text"
                [(ngModel)]="newNoteContent"
                (keydown.enter)="postStickyNote()"
                placeholder="Post a sticky note to the lounge whiteboard..."
                class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <select
                [(ngModel)]="selectedNoteColor"
                class="bg-slate-800 border border-slate-700 text-xs rounded-lg px-3 text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="bg-amber-100 text-amber-950 border-amber-300">Yellow Note</option>
                <option value="bg-teal-100 text-teal-950 border-teal-300">Teal Note</option>
                <option value="bg-rose-100 text-rose-950 border-rose-300">Pink Note</option>
                <option value="bg-indigo-100 text-indigo-950 border-indigo-300">Indigo Note</option>
              </select>
              <button
                (click)="postStickyNote()"
                class="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-lg text-xs transition"
              >
                Post Note
              </button>
            </div>

            <!-- Sticky Notes Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              @for (note of api.notes(); track note.id) {
                <div
                  class="group relative p-3.5 rounded-xl shadow-md border {{ note.color_class }} text-xs flex flex-col justify-between h-32 transition hover:shadow-lg hover:-translate-y-0.5"
                >
                  <p class="font-medium leading-snug break-words">{{ note.content }}</p>
                  <div class="flex items-center justify-between text-[10px] opacity-75 font-mono pt-2 border-t border-black/10">
                    <span>Pinned by {{ note.author_name }}</span>
                    <button
                      (click)="deleteNote(note.id)"
                      class="opacity-0 group-hover:opacity-100 text-rose-700 hover:text-rose-900 transition font-bold"
                      title="Delete Note"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              } @empty {
                <div class="col-span-3 text-center py-12 text-slate-500 text-xs">
                  <span>📌 No sticky notes yet. Be the first to pin an idea!</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- TAB 2: FREEHAND SKETCH CANVAS -->
        @if (activeTab() === 'draw') {
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Toolbar -->
            <div class="px-6 py-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4 flex-wrap">
              <div class="flex items-center gap-2">
                @for (color of colors; track color) {
                  <button
                    (click)="selectedColor.set(color); isEraser.set(false)"
                    class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    [style.backgroundColor]="color"
                    [class.border-white]="selectedColor() === color && !isEraser()"
                    [class.border-transparent]="selectedColor() !== color || isEraser()"
                  ></button>
                }
              </div>

              <div class="flex items-center gap-2">
                <span class="text-xs text-slate-400">Size:</span>
                @for (size of [2, 5, 12]; track size) {
                  <button
                    (click)="brushSize.set(size)"
                    class="px-2 py-1 text-xs rounded-md font-mono transition"
                    [class.bg-teal-600]="brushSize() === size"
                    [class.text-slate-950]="brushSize() === size"
                    [class.font-bold]="brushSize() === size"
                    [class.bg-slate-800]="brushSize() !== size"
                    [class.text-slate-300]="brushSize() !== size"
                  >
                    {{ size }}px
                  </button>
                }
              </div>

              <div class="flex items-center gap-2">
                <button
                  (click)="isEraser.set(!isEraser())"
                  class="px-3 py-1 text-xs font-medium rounded-lg border transition"
                  [class.bg-rose-500/20]="isEraser()"
                  [class.text-rose-400]="isEraser()"
                  [class.border-rose-500/40]="isEraser()"
                  [class.bg-slate-800]="!isEraser()"
                  [class.text-slate-300]="!isEraser()"
                  [class.border-slate-700]="!isEraser()"
                >
                  🧹 Eraser
                </button>
                <button
                  (click)="clearBoard()"
                  class="px-3 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  🗑️ Clear
                </button>
              </div>
            </div>

            <!-- Canvas Container -->
            <div class="p-4 bg-slate-950 flex-1 flex items-center justify-center">
              <div class="relative w-full h-[450px]">
                <canvas
                  #whiteboardCanvas
                  (mousedown)="startDrawing($event)"
                  (mousemove)="draw($event)"
                  (mouseup)="stopDrawing()"
                  (mouseleave)="stopDrawing()"
                  class="w-full h-full bg-slate-900 border border-slate-800 rounded-xl shadow-inner cursor-crosshair"
                ></canvas>

                <!-- Shared Cursors Overlay on Whiteboard -->
                <div class="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
                  @for (cursor of activeWhiteboardCursors(); track cursor.peer_id) {
                    <div
                      class="absolute -translate-x-1 -translate-y-1 transition-all duration-75 ease-out flex flex-col items-start select-none"
                      [style.left.%]="cursor.x * 100"
                      [style.top.%]="cursor.y * 100"
                    >
                      <svg class="w-5 h-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 3l7 18 3-7 7-3L3 3z"
                          [attr.fill]="cursor.color"
                          stroke="#0f172a"
                          stroke-width="1.5"
                          stroke-linejoin="round"
                        />
                      </svg>
                      <div
                        class="mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1 border border-white/20 whitespace-nowrap backdrop-blur-sm"
                        [style.backgroundColor]="cursor.color"
                        style="color: #0f172a;"
                      >
                        <span>{{ cursor.display_name }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class WhiteboardModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('whiteboardCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @Output() close = new EventEmitter<void>();

  public activeTab = signal<'notes' | 'draw'>('notes');
  public newNoteContent = '';
  public selectedNoteColor = 'bg-amber-100 text-amber-950 border-amber-300';

  public colors = ['#f8fafc', '#38bdf8', '#34d399', '#f87171', '#fbbf24', '#c084fc'];
  public selectedColor = signal('#38bdf8');
  public brushSize = signal(3);
  public isEraser = signal(false);
  public activeWhiteboardCursors = signal<SharedCursor[]>([]);

  private ctx?: CanvasRenderingContext2D;
  private isDrawing = false;
  private currentStroke: StrokePoint[] = [];
  private sub = new Subscription();
  private lastCursorSendTime = 0;
  private cursorCleanInterval: any = null;

  constructor(public api: LoungeApiService) {}

  ngOnInit(): void {
    const slug = this.api.currentRoom()?.slug;
    if (slug) {
      this.api.fetchNotes(slug).catch((err) => console.warn('Fetch notes error:', err));
    }
  }

  ngAfterViewInit(): void {
    this.initCanvasIfReady();
    this.sub.add(
      this.api.whiteboardStrokes$.subscribe((stroke: StrokeData | { type: string }) => {
        if ('type' in stroke && stroke.type === 'clear') {
          this.renderClear();
        } else if ('points' in stroke) {
          this.renderRemoteStroke(stroke as StrokeData);
        }
      })
    );

    this.sub.add(
      this.api.peerCursors$.subscribe((cursor) => {
        if (cursor.stage === 'whiteboard') {
          cursor.lastUpdated = Date.now();
          const current = this.activeWhiteboardCursors();
          const existingIdx = current.findIndex((c) => c.peer_id === cursor.peer_id);
          if (existingIdx >= 0) {
            const updated = [...current];
            updated[existingIdx] = { ...cursor };
            this.activeWhiteboardCursors.set(updated);
          } else {
            this.activeWhiteboardCursors.set([...current, cursor]);
          }
        }
      })
    );

    if (typeof window !== 'undefined') {
      this.cursorCleanInterval = setInterval(() => {
        const now = Date.now();
        const active = this.activeWhiteboardCursors().filter((c) => (c.lastUpdated ? now - c.lastUpdated < 3500 : true));
        if (active.length !== this.activeWhiteboardCursors().length) {
          this.activeWhiteboardCursors.set(active);
        }
      }, 1000);
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.cursorCleanInterval) {
      clearInterval(this.cursorCleanInterval);
      this.cursorCleanInterval = null;
    }
  }

  private initCanvasIfReady(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = 450;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async postStickyNote(): Promise<void> {
    const text = this.newNoteContent.trim();
    if (!text) return;

    const slug = this.api.currentRoom()?.slug;
    if (!slug) return;
    try {
      await this.api.createNote(slug, text, this.selectedNoteColor);
      this.newNoteContent = '';
    } catch (err) {
      console.error('Failed to post sticky note:', err);
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    const slug = this.api.currentRoom()?.slug;
    if (!slug) return;
    try {
      await this.api.deleteNote(slug, noteId);
    } catch (err) {
      console.error('Failed to delete sticky note:', err);
    }
  }

  startDrawing(e: MouseEvent): void {
    this.initCanvasIfReady();
    this.isDrawing = true;
    this.currentStroke = [{ x: e.offsetX, y: e.offsetY }];
  }

  draw(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const nx = Math.max(0, Math.min(1, e.offsetX / canvas.width));
      const ny = Math.max(0, Math.min(1, e.offsetY / canvas.height));
      const now = Date.now();
      if (now - this.lastCursorSendTime > 40) {
        this.lastCursorSendTime = now;
        this.api.sendCursorMove('whiteboard', nx, ny);
      }
    }

    if (!this.isDrawing || !this.ctx) return;

    const point = { x: e.offsetX, y: e.offsetY };
    const prev = this.currentStroke[this.currentStroke.length - 1];
    this.currentStroke.push(point);

    this.ctx.beginPath();
    this.ctx.moveTo(prev.x, prev.y);
    this.ctx.lineTo(point.x, point.y);
    this.ctx.strokeStyle = this.isEraser() ? '#0f172a' : this.selectedColor();
    this.ctx.lineWidth = this.isEraser() ? this.brushSize() * 3 : this.brushSize();
    this.ctx.stroke();
  }

  stopDrawing(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentStroke.length > 1) {
      const strokeData: StrokeData = {
        points: this.currentStroke,
        color: this.selectedColor(),
        size: this.brushSize(),
        isEraser: this.isEraser(),
      };
      this.api.sendWhiteboardStroke(strokeData);
    }
    this.currentStroke = [];
  }

  clearBoard(): void {
    this.renderClear();
    this.api.sendWhiteboardStroke({ type: 'clear' });
  }

  private renderClear(): void {
    if (!this.ctx || !this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private renderRemoteStroke(stroke: StrokeData): void {
    if (!this.ctx) return;
    if (stroke.points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    this.ctx.strokeStyle = stroke.isEraser ? '#0f172a' : stroke.color;
    this.ctx.lineWidth = stroke.isEraser ? stroke.size * 3 : stroke.size;
    this.ctx.stroke();
  }
}
