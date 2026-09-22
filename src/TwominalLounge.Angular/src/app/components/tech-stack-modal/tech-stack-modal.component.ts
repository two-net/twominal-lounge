import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoungeApiService } from '../../services/lounge-api.service';

@Component({
  selector: 'app-tech-stack-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-mono font-bold text-sm">
              {{ '{ }' }}
            </div>
            <div>
              <h3 class="font-bold text-white text-base">Twominal Architecture & Stack Config</h3>
              <p class="text-xs text-slate-400">Pure static config file • No environment secrets • No Vault • PostgreSQL ORM Auto-Migrate</p>
            </div>
          </div>
          <button (click)="close.emit()" class="text-slate-400 hover:text-white text-xl px-2 transition">✕</button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto space-y-6 text-xs text-slate-300 custom-scrollbar">
          <!-- Stack Specifications Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <div class="text-teal-400 font-bold mb-1 flex items-center gap-1.5">
                <span>🐘</span> Database & Persistence
              </div>
              <p class="text-slate-300 text-[11px] leading-relaxed">
                <strong>PostgreSQL</strong> instance with built-in ORM Auto-Migration on application boot via <code class="text-teal-300">sqlx::migrate!()</code>. Strictly <strong>NO database partitioning</strong>. Single relational schema: users, rooms, room_layouts, user_positions, whiteboard_notes.
              </p>
            </div>

            <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <div class="text-teal-400 font-bold mb-1 flex items-center gap-1.5">
                <span>🔒</span> Zero-Secret Config File
              </div>
              <p class="text-slate-300 text-[11px] leading-relaxed">
                Standardized <code class="text-teal-300 bg-slate-900 px-1 py-0.5 rounded font-mono">config.json</code>. No <code class="text-slate-400">.env</code> files, no dynamic secrets manager, and no Vault integration. Fully declarative and repeatable across all environments.
              </p>
            </div>

            <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <div class="text-teal-400 font-bold mb-1 flex items-center gap-1.5">
                <span>💼</span> SaaS Model
              </div>
              <p class="text-slate-300 text-[11px] leading-relaxed">
                Software as a Service without subscription traps. Perpetual room licensing model (Single-space deployment, unlimited local peers, zero monthly recurring subscription fees).
              </p>
            </div>
          </div>

          <!-- Configuration File Viewer: config.json -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                config.json (Static Config Engine - Live from Server)
              </span>
              <span class="text-[10px] text-slate-400 font-mono">Format: RFC 8259 JSON</span>
            </div>
            <pre class="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-teal-300 overflow-x-auto leading-relaxed shadow-inner">{{ configFormatted() }}</pre>
          </div>

          <!-- ORM Auto-Migration Details -->
          <div class="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-teal-400 font-bold">Auto-Migration Schema Definition (PostgreSQL DDL)</span>
              <span class="text-[10px] px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded border border-emerald-700">Executed on Boot</span>
            </div>
            <pre class="font-mono text-[10px] text-slate-400 overflow-x-auto leading-relaxed">-- Auto-migrated schema: No Partitioning, Direct Foreign Keys
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    max_occupancy INT NOT NULL DEFAULT 25,
    pricing_tier VARCHAR(32) NOT NULL DEFAULT 'free',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whiteboard_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author_name VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    color_class VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_positions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    x FLOAT8 NOT NULL DEFAULT 6.0,
    y FLOAT8 NOT NULL DEFAULT 6.0,
    direction VARCHAR(16) NOT NULL DEFAULT 'down',
    state VARCHAR(16) NOT NULL DEFAULT 'idle',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, room_id)
);</pre>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TechStackModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  public configFormatted = signal<string>('Loading static config.json...');

  constructor(private api: LoungeApiService) {}

  async ngOnInit(): Promise<void> {
    try {
      const cfg = await this.api.getRawConfig();
      this.configFormatted.set(JSON.stringify(cfg, null, 2));
    } catch {
      this.configFormatted.set(JSON.stringify({
        server: { host: '0.0.0.0', port: 3000 },
        database: { url: 'postgres://postgres@localhost:5432/twominal_lounge', auto_migrate: true },
        billing: { model: 'one-time-and-pay-per-room', currency: 'USD' },
        spatial: { tile_size: 32, proximity_radius_tiles: 5.0, proximity_falloff_tiles: 8.0 }
      }, null, 2));
    }
  }
}
