import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingTier } from '../../models/lounge.models';
import { LoungeApiService } from '../../services/lounge-api.service';

@Component({
  selector: 'app-billing-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div class="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <span class="text-xs uppercase tracking-wider font-semibold text-sky-400">SaaS Monetization</span>
            <h2 class="text-lg font-bold text-slate-100">Twominal Lounge Licenses</h2>
            <p class="text-xs text-slate-400">Pure one-time pricing. Strictly zero recurring subscriptions.</p>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Notification Message -->
        @if (message()) {
          <div class="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <span>✓</span>
            <span>{{ message() }}</span>
          </div>
        }

        <!-- Tiers Grid -->
        <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          @for (tier of tiers(); track tier.id) {
            <div
              class="relative rounded-xl p-5 border flex flex-col justify-between transition-all"
              [class.border-sky-500]="selectedTier() === tier.id"
              [class.bg-sky-950/20]="selectedTier() === tier.id"
              [class.border-slate-800]="selectedTier() !== tier.id"
              [class.bg-slate-950/40]="selectedTier() !== tier.id"
            >
              @if (tier.id === 'pay_per_room') {
                <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-sky-500 text-slate-950 text-[10px] font-bold uppercase tracking-wider shadow">
                  Most Popular
                </div>
              }

              <div>
                <h3 class="text-sm font-semibold text-slate-100">{{ tier.name }}</h3>
                <div class="mt-3 flex items-baseline gap-1">
                  <span class="text-2xl font-extrabold text-white">
                    {{ tier.price_cents === 0 ? 'Free' : '$' + (tier.price_cents / 100).toFixed(2) }}
                  </span>
                  @if (tier.price_cents > 0) {
                    <span class="text-[11px] text-slate-400 font-medium">one-time</span>
                  }
                </div>
                <p class="mt-2 text-xs text-slate-400 leading-relaxed">{{ tier.description }}</p>

                <div class="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
                  @for (feat of tier.features; track feat) {
                    <div class="flex items-start gap-2 text-xs text-slate-300">
                      <span class="text-sky-400 font-bold">✓</span>
                      <span>{{ feat }}</span>
                    </div>
                  }
                </div>
              </div>

              <div class="mt-6">
                @if (currentTierId === tier.id) {
                  <button
                    disabled
                    class="w-full py-2 px-3 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold cursor-default"
                  >
                    Active Tier
                  </button>
                } @else {
                  <button
                    (click)="selectedTier.set(tier.id)"
                    class="w-full py-2 px-3 rounded-lg text-xs font-semibold transition shadow"
                    [class.bg-sky-500]="selectedTier() === tier.id"
                    [class.text-slate-950]="selectedTier() === tier.id"
                    [class.hover:bg-sky-400]="selectedTier() === tier.id"
                    [class.bg-slate-800]="selectedTier() !== tier.id"
                    [class.text-slate-200]="selectedTier() !== tier.id"
                    [class.hover:bg-slate-700]="selectedTier() !== tier.id"
                  >
                    {{ selectedTier() === tier.id ? 'Selected' : 'Choose Plan' }}
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Checkout / License Activation Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
          <div class="text-xs text-slate-400">
            Current Room: <strong class="text-slate-200">{{ roomSlug }}</strong>
          </div>

          <div class="flex items-center gap-3">
            <button
              (click)="close.emit()"
              class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              (click)="activateSelectedTier()"
              [disabled]="isProcessing() || selectedTier() === currentTierId"
              class="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition shadow-md flex items-center gap-2"
            >
              @if (isProcessing()) {
                <span class="animate-spin text-sm">↻</span>
              }
              <span>Activate One-Time License</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BillingModalComponent implements OnInit {
  @Input() roomSlug: string = '';
  @Input() currentTierId: string = 'free';
  @Output() close = new EventEmitter<void>();
  @Output() activated = new EventEmitter<string>();

  public tiers = signal<BillingTier[]>([]);
  public selectedTier = signal<string>('pay_per_room');
  public isProcessing = signal<boolean>(false);
  public message = signal<string | null>(null);

  constructor(private api: LoungeApiService) {}

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.api.getBillingTiers();
      this.tiers.set(list);
    } catch (err) {
      console.error('Failed to load billing tiers:', err);
    }
  }

  async activateSelectedTier(): Promise<void> {
    this.isProcessing.set(true);
    this.message.set(null);

    try {
      const res = await this.api.activateRoom(this.roomSlug, this.selectedTier());
      this.message.set(res.message);
      this.activated.emit(this.selectedTier());
      setTimeout(() => {
        this.close.emit();
      }, 1500);
    } catch (err) {
      console.error('Activation failed:', err);
    } finally {
      this.isProcessing.set(false);
    }
  }
}
