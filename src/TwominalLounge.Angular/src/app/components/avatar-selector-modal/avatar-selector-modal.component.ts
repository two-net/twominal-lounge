import { Component, EventEmitter, Input, OnInit, Output, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CharacterArchetype {
  id: string;
  name: string;
  role: string;
  description: string;
  previewDown: string;
  previewLeft: string;
  previewRight: string;
  previewUp: string;
}

@Component({
  selector: 'app-avatar-selector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div class="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center text-lg font-bold border border-teal-500/30">
              👾
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Avatar Selection & Persona</span>
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-500/40">Retro Pixel Art</span>
              </h2>
              <p class="text-xs text-slate-400">Choose your character archetype, walking orientation, and theme color</p>
            </div>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
            title="Close modal"
          >
            ✕
          </button>
        </div>

        <!-- Body Area -->
        <div class="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <!-- Top Section: Interactive Live Preview & Persona Customizer -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-center p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <!-- Left: Character Stage / Live Sprite Preview -->
            <div class="md:col-span-5 flex flex-col items-center justify-center">
              <div
                class="relative w-36 h-36 rounded-2xl flex items-center justify-center border-2 transition-all shadow-inner overflow-hidden"
                [style.borderColor]="selectedColor()"
                [style.boxShadow]="'0 0 25px ' + selectedColor() + '33'"
              >
                <!-- Retro Grid Floor Background -->
                <div class="absolute inset-0 bg-slate-900/90 [background-image:linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:12px_12px] opacity-60"></div>
                
                <!-- Avatar Sprite Image -->
                <img
                  [src]="previewSpriteSrc"
                  [alt]="selectedChar()"
                  class="relative z-10 w-20 h-28 object-contain pixelated transition-transform duration-100"
                  [class.animate-bounce]="isWalkingPreview()"
                />

                <!-- Local Halo Accent -->
                <div
                  class="absolute bottom-2 w-16 h-5 rounded-full border-2 border-dashed opacity-75"
                  [style.borderColor]="selectedColor()"
                ></div>
              </div>

              <!-- Orientation Controls -->
              <div class="flex items-center gap-1.5 mt-3">
                <button
                  type="button"
                  (click)="setDirection('down')"
                  [class.bg-teal-600]="previewDirection() === 'down'"
                  [class.text-slate-950]="previewDirection() === 'down'"
                  [class.bg-slate-800]="previewDirection() !== 'down'"
                  [class.text-slate-300]="previewDirection() !== 'down'"
                  class="px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-slate-700"
                  title="Facing Down (Front)"
                >
                  ▼ Front
                </button>
                <button
                  type="button"
                  (click)="setDirection('left')"
                  [class.bg-teal-600]="previewDirection() === 'left'"
                  [class.text-slate-950]="previewDirection() === 'left'"
                  [class.bg-slate-800]="previewDirection() !== 'left'"
                  [class.text-slate-300]="previewDirection() !== 'left'"
                  class="px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-slate-700"
                  title="Facing Left"
                >
                  ◀ Left
                </button>
                <button
                  type="button"
                  (click)="setDirection('right')"
                  [class.bg-teal-600]="previewDirection() === 'right'"
                  [class.text-slate-950]="previewDirection() === 'right'"
                  [class.bg-slate-800]="previewDirection() !== 'right'"
                  [class.text-slate-300]="previewDirection() !== 'right'"
                  class="px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-slate-700"
                  title="Facing Right"
                >
                  Right ▶
                </button>
                <button
                  type="button"
                  (click)="setDirection('up')"
                  [class.bg-teal-600]="previewDirection() === 'up'"
                  [class.text-slate-950]="previewDirection() === 'up'"
                  [class.bg-slate-800]="previewDirection() !== 'up'"
                  [class.text-slate-300]="previewDirection() !== 'up'"
                  class="px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-slate-700"
                  title="Facing Up (Back)"
                >
                  ▲ Back
                </button>
              </div>

              <!-- Walk Cycle Preview Toggle -->
              <button
                type="button"
                (click)="toggleWalkingPreview()"
                class="mt-2 text-[11px] font-medium text-slate-400 hover:text-teal-300 flex items-center gap-1.5 transition"
              >
                <span>{{ isWalkingPreview() ? '⏸ Pause Walk Cycle' : '▶ Preview Walk Animation' }}</span>
              </button>
            </div>

            <!-- Right: Display Name & Color Theme Palette -->
            <div class="md:col-span-7 space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Display Name / Call Sign</span>
                  <span class="text-[10px] text-slate-500 font-normal">Visible to all peers in lounge</span>
                </label>
                <input
                  type="text"
                  [(ngModel)]="displayNameInput"
                  placeholder="e.g. Alex R."
                  class="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-medium focus:border-teal-500 focus:outline-none transition shadow-inner"
                />
              </div>

              <!-- Color Themes -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Accent Halo & Theme Color</span>
                  <span class="text-[10px] font-mono text-teal-400">{{ selectedColor() }}</span>
                </label>
                <div class="flex flex-wrap gap-2.5">
                  @for (c of palette; track c) {
                    <button
                      type="button"
                      (click)="selectedColor.set(c)"
                      class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center shadow-md cursor-pointer"
                      [style.backgroundColor]="c"
                      [style.borderColor]="selectedColor() === c ? '#ffffff' : 'transparent'"
                      [title]="c"
                    >
                      @if (selectedColor() === c) {
                        <span class="text-xs text-white font-black drop-shadow">✓</span>
                      }
                    </button>
                  }
                </div>
              </div>

              <!-- Current Archetype Badge -->
              <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-teal-300">{{ currentArchetypeInfo?.name }}</div>
                  <div class="text-[11px] text-slate-400">{{ currentArchetypeInfo?.role }}</div>
                </div>
                <span class="text-[11px] text-slate-500 italic max-w-[180px] text-right">
                  {{ currentArchetypeInfo?.description }}
                </span>
              </div>
            </div>
          </div>

          <!-- Bottom Section: 6 Character Archetypes Selection Grid -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Character Archetype (6 Retro Sprites)
              </h3>
              <span class="text-[11px] text-teal-400 font-mono">16-Bit Pixel-Art</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              @for (char of archetypes; track char.id) {
                <div
                  (click)="selectChar(char.id)"
                  class="relative p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center text-center gap-2 group hover:border-teal-500/70"
                  [class.bg-teal-950/30]="selectedChar() === char.id"
                  [class.border-teal-400]="selectedChar() === char.id"
                  [class.bg-slate-950/60]="selectedChar() !== char.id"
                  [class.border-slate-800]="selectedChar() !== char.id"
                >
                  <!-- Active Indicator Badge -->
                  @if (selectedChar() === char.id) {
                    <div class="absolute top-2 right-2 w-4 h-4 rounded-full bg-teal-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                      ✓
                    </div>
                  }

                  <!-- Multi-direction Sprite Preview Pill -->
                  <div class="flex items-center gap-1.5 bg-slate-900/90 rounded-lg p-1.5 border border-slate-800 shadow-inner group-hover:border-slate-700 transition">
                    <img
                      [src]="char.previewDown"
                      [alt]="char.name"
                      class="w-7 h-10 object-contain pixelated"
                      title="Facing Front"
                    />
                    <img
                      [src]="char.previewRight"
                      [alt]="char.name"
                      class="w-7 h-10 object-contain pixelated border-l border-slate-800 pl-1"
                      title="Facing Right"
                    />
                  </div>

                  <!-- Name and Role -->
                  <div>
                    <div class="font-bold text-white text-xs group-hover:text-teal-300 transition">
                      {{ char.name }}
                    </div>
                    <div class="text-[10px] text-teal-400 font-medium line-clamp-1" [title]="char.role">
                      {{ char.role }}
                    </div>
                  </div>

                  <!-- Select Button -->
                  <button
                    type="button"
                    (click)="selectChar(char.id)"
                    class="w-full py-1 rounded-lg text-[11px] font-bold transition shadow"
                    [class.bg-teal-500]="selectedChar() === char.id"
                    [class.text-slate-950]="selectedChar() === char.id"
                    [class.bg-slate-800]="selectedChar() !== char.id"
                    [class.text-slate-300]="selectedChar() !== char.id"
                    [class.hover:bg-slate-700]="selectedChar() !== char.id"
                  >
                    {{ selectedChar() === char.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <button
            type="button"
            (click)="close.emit()"
            class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            (click)="saveAvatar()"
            [disabled]="!displayNameInput.trim()"
            class="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition shadow-lg shadow-teal-500/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>✓</span>
            <span>Equip & Save Avatar</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pixelated {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  `]
})
export class AvatarSelectorModalComponent implements OnInit, OnDestroy {
  @Input() currentCharacter: string = 'hoodie';
  @Input() currentColor: string = '#14b8a6';
  @Input() currentName: string = 'Alex R.';

  @Output() save = new EventEmitter<{ character: string; color: string; displayName: string }>();
  @Output() close = new EventEmitter<void>();

  readonly archetypes: CharacterArchetype[] = [
    {
      id: 'hoodie',
      name: 'Alex',
      role: 'Cyber Hoodie',
      description: 'Tech streetwear with wireless earbuds & sneakers',
      previewDown: '/assets/sprites/characters/hoodie_down.png',
      previewLeft: '/assets/sprites/characters/hoodie_left.png',
      previewRight: '/assets/sprites/characters/hoodie_right.png',
      previewUp: '/assets/sprites/characters/hoodie_up.png',
    },
    {
      id: 'architect',
      name: 'Jordan',
      role: 'Tech Architect',
      description: 'System architect with tech glasses & tailored coat',
      previewDown: '/assets/sprites/characters/architect_down.png',
      previewLeft: '/assets/sprites/characters/architect_left.png',
      previewRight: '/assets/sprites/characters/architect_right.png',
      previewUp: '/assets/sprites/characters/architect_up.png',
    },
    {
      id: 'director',
      name: 'Morgan',
      role: 'Product Director',
      description: 'Product strategist with executive blazer & notebook',
      previewDown: '/assets/sprites/characters/director_down.png',
      previewLeft: '/assets/sprites/characters/director_left.png',
      previewRight: '/assets/sprites/characters/director_right.png',
      previewUp: '/assets/sprites/characters/director_up.png',
    },
    {
      id: 'engineer',
      name: 'Sam',
      role: 'DevOps Engineer',
      description: 'Infrastructure wizard with wireless headset & utility jacket',
      previewDown: '/assets/sprites/characters/engineer_down.png',
      previewLeft: '/assets/sprites/characters/engineer_left.png',
      previewRight: '/assets/sprites/characters/engineer_right.png',
      previewUp: '/assets/sprites/characters/engineer_up.png',
    },
    {
      id: 'designer',
      name: 'Riley',
      role: 'Lead Designer',
      description: 'Creative design lead with vibrant accents & stylus',
      previewDown: '/assets/sprites/characters/designer_down.png',
      previewLeft: '/assets/sprites/characters/designer_left.png',
      previewRight: '/assets/sprites/characters/designer_right.png',
      previewUp: '/assets/sprites/characters/designer_up.png',
    },
    {
      id: 'logician',
      name: 'Logician',
      role: 'Master Detective (L)',
      description: 'Deductive genius with oversized white sweater, black pants & bare feet (L Lawliet)',
      previewDown: '/assets/sprites/characters/logician_down.png',
      previewLeft: '/assets/sprites/characters/logician_left.png',
      previewRight: '/assets/sprites/characters/logician_right.png',
      previewUp: '/assets/sprites/characters/logician_up.png',
    },
  ];

  readonly palette = [
    '#14b8a6', // Neon Teal
    '#06b6d4', // Cyan Sky
    '#f59e0b', // Amber Gold
    '#ec4899', // Hot Pink
    '#8b5cf6', // Cyber Violet
    '#10b981', // Emerald Green
    '#6366f1', // Indigo Wave
    '#f43f5e', // Rose Coral
  ];

  selectedChar = signal<string>('hoodie');
  selectedColor = signal<string>('#14b8a6');
  displayNameInput: string = 'Alex R.';
  previewDirection = signal<'down' | 'left' | 'right' | 'up'>('down');
  isWalkingPreview = signal<boolean>(false);
  walkFrame = signal<number>(0);

  private walkInterval: any = null;

  ngOnInit(): void {
    if (this.currentCharacter) {
      this.selectedChar.set(this.currentCharacter);
    }
    if (this.currentColor) {
      this.selectedColor.set(this.currentColor);
    }
    if (this.currentName) {
      this.displayNameInput = this.currentName;
    }
  }

  ngOnDestroy(): void {
    this.stopWalkTimer();
  }

  get currentArchetypeInfo(): CharacterArchetype | undefined {
    return this.archetypes.find(a => a.id === this.selectedChar());
  }

  get previewSpriteSrc(): string {
    const char = this.selectedChar();
    const dir = this.previewDirection();
    if (this.isWalkingPreview()) {
      return `/assets/sprites/characters/${char}_${dir}_${this.walkFrame()}.png`;
    }
    return `/assets/sprites/characters/${char}_${dir}.png`;
  }

  selectChar(id: string): void {
    this.selectedChar.set(id);
  }

  setDirection(dir: 'down' | 'left' | 'right' | 'up'): void {
    this.previewDirection.set(dir);
  }

  toggleWalkingPreview(): void {
    const nextState = !this.isWalkingPreview();
    this.isWalkingPreview.set(nextState);
    if (nextState) {
      this.startWalkTimer();
    } else {
      this.stopWalkTimer();
    }
  }

  private startWalkTimer(): void {
    this.stopWalkTimer();
    this.walkInterval = setInterval(() => {
      this.walkFrame.set(this.walkFrame() === 0 ? 1 : 0);
    }, 250);
  }

  private stopWalkTimer(): void {
    if (this.walkInterval) {
      clearInterval(this.walkInterval);
      this.walkInterval = null;
    }
    this.walkFrame.set(0);
  }

  saveAvatar(): void {
    const name = this.displayNameInput.trim() || this.currentName;
    this.save.emit({
      character: this.selectedChar(),
      color: this.selectedColor(),
      displayName: name,
    });
    this.close.emit();
  }
}
