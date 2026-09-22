import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoungeApiService } from '../../services/lounge-api.service';

@Component({
  selector: 'app-room-switcher-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div class="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center text-base font-bold">
              🚪
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-100">Lounge Rooms Directory</h2>
              <p class="text-xs text-slate-400">Join by room code, URL, or create a new space</p>
            </div>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Content Area -->
        <div class="p-6 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
          @if (!isCreating()) {
            <!-- Fast Join by Room Code or Shared URL -->
            <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label class="block text-xs font-semibold text-teal-400 uppercase tracking-wider">
                Join by Room Code or Shared Link
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  [(ngModel)]="codeOrUrlInput"
                  (keyup.enter)="handleJoinByCode()"
                  placeholder="e.g. design-studio or paste https://.../?room=xyz"
                  class="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                />
                <button
                  (click)="handleJoinByCode()"
                  [disabled]="!codeOrUrlInput.trim()"
                  class="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-slate-950 text-xs font-bold transition shadow"
                >
                  Join
                </button>
              </div>
              @if (joinError()) {
                <p class="text-[11px] text-rose-400 font-medium">{{ joinError() }}</p>
              }
            </div>

            <!-- Active Rooms Header -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Spatial Rooms</span>
              <button
                (click)="isCreating.set(true)"
                class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                <span>+</span>
                <span>Create New Room</span>
              </button>
            </div>

            <div class="space-y-2.5">
              @for (room of rooms(); track room.slug) {
                <div
                  (click)="selectRoom.emit(room.slug); close.emit()"
                  class="p-4 rounded-xl bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 hover:border-teal-500/60 transition cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-semibold text-slate-200 group-hover:text-teal-300 transition">
                        {{ room.name }}
                      </h3>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-teal-400 border border-teal-500/30">
                        Code: {{ room.slug }}
                      </span>
                    </div>
                    <p class="text-xs text-slate-400 mt-1 line-clamp-1">{{ room.description || 'Spatial Lounge Space' }}</p>
                  </div>

                  <div class="flex items-center gap-3">
                    <div class="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>{{ room.active_occupancy }} online</span>
                    </div>
                    <span class="text-slate-500 group-hover:text-teal-400 transition text-sm">→</span>
                  </div>
                </div>
              } @empty {
                <div class="text-center py-6 border border-dashed border-slate-800 rounded-xl">
                  <p class="text-xs text-slate-400">No rooms active right now.</p>
                  <p class="text-[11px] text-slate-500 mt-1">Create a room above or enter a private room code!</p>
                </div>
              }
            </div>
          } @else {
            <!-- Create Room Form -->
            <div class="space-y-4">
              <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 class="text-sm font-semibold text-slate-200">Create New Dedicated Lounge</h3>
                <button
                  (click)="isCreating.set(false)"
                  class="text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  ← Back to directory
                </button>
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1">Room Name <span class="text-teal-400">*</span></label>
                <input
                  type="text"
                  [(ngModel)]="newName"
                  placeholder="e.g. Design Studio & All-Hands"
                  class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1">Custom Room Code <span class="text-slate-500">(Optional)</span></label>
                <input
                  type="text"
                  [(ngModel)]="newSlug"
                  placeholder="e.g. design-studio (leave blank to auto-generate)"
                  class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-mono focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1">Description <span class="text-slate-500">(Optional)</span></label>
                <textarea
                  [(ngModel)]="newDescription"
                  rows="2"
                  placeholder="What is this lounge for?"
                  class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-2">
                <button
                  (click)="isCreating.set(false)"
                  class="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  (click)="handleCreate()"
                  [disabled]="!newName.trim() || isSubmitting()"
                  class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition shadow"
                >
                  {{ isSubmitting() ? 'Creating...' : 'Create & Enter' }}
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class RoomSwitcherModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() selectRoom = new EventEmitter<string>();

  public rooms = signal<any[]>([]);
  public isCreating = signal(false);
  public isSubmitting = signal(false);

  public newName = '';
  public newSlug = '';
  public newDescription = '';
  public codeOrUrlInput = '';
  public joinError = signal<string | null>(null);

  constructor(private api: LoungeApiService) {}

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.api.listRooms();
      this.rooms.set(list);
    } catch (err) {
      console.error('Failed to list rooms:', err);
    }
  }

  handleJoinByCode(): void {
    const raw = this.codeOrUrlInput.trim();
    if (!raw) return;

    const code = this.parseRoomCode(raw);
    if (!code) {
      this.joinError.set('Please enter a valid room code or shared URL.');
      return;
    }

    this.joinError.set(null);
    this.selectRoom.emit(code);
    this.close.emit();
  }

  parseRoomCode(input: string): string {
    const trimmed = input.trim();
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

    return trimmed.replace(/^[/#?]+/, '').trim().toLowerCase();
  }

  async handleCreate(): Promise<void> {
    if (!this.newName.trim()) return;
    this.isSubmitting.set(true);

    try {
      const room = await this.api.createRoom(
        this.newName,
        this.newDescription,
        30,
        20,
        this.newSlug.trim() || undefined
      );
      this.selectRoom.emit(room.slug);
      this.close.emit();
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
