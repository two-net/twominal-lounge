import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoungeApiService } from '../../services/lounge-api.service';
import { SpatialAudioService } from '../../services/spatial-audio.service';
import { WebRtcMeshService } from '../../services/webrtc-mesh.service';

@Component({
  selector: 'app-diagnostics-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div class="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-base font-bold">
              📊
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-100">Spatial Telemetry & Diagnostics</h2>
              <p class="text-xs text-slate-400">Real-time observability, WebRTC mesh status, and audio hardware tests</p>
            </div>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-4 text-xs overflow-y-auto custom-scrollbar flex-1">
          <!-- Metrics Grid -->
          <div class="grid grid-cols-3 gap-3">
            <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span class="text-[10px] uppercase font-mono text-slate-500">Gateway</span>
              <div class="text-sm font-bold mt-1 flex items-center gap-1.5" [class.text-emerald-400]="api.isConnected()" [class.text-rose-400]="!api.isConnected()">
                <span class="w-2 h-2 rounded-full" [class.bg-emerald-400]="api.isConnected()" [class.bg-rose-400]="!api.isConnected()"></span>
                <span>{{ api.isConnected() ? 'ONLINE' : 'OFFLINE' }}</span>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span class="text-[10px] uppercase font-mono text-slate-500">RTT Latency</span>
              <div class="text-sm font-bold text-sky-400 mt-1 font-mono">
                {{ api.pingLatency() }}ms
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span class="text-[10px] uppercase font-mono text-slate-500">Peers in Room</span>
              <div class="text-sm font-bold text-indigo-400 mt-1 font-mono">
                {{ api.peers().size }}
              </div>
            </div>
          </div>

          <!-- Microphone & Audio Engine Diagnostics -->
          <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div class="flex items-center justify-between">
              <div class="font-semibold text-slate-200 flex items-center gap-2">
                <span>🎤 Microphone Diagnostics & VU Meter</span>
              </div>
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                [class.bg-emerald-500/20]="webrtc.isMicEnabled() && webrtc.hasAudioTrack()"
                [class.text-emerald-300]="webrtc.isMicEnabled() && webrtc.hasAudioTrack()"
                [class.border]="true"
                [class.border-emerald-500/30]="webrtc.isMicEnabled() && webrtc.hasAudioTrack()"
                [class.bg-rose-500/20]="!webrtc.isMicEnabled() || !webrtc.hasAudioTrack()"
                [class.text-rose-300]="!webrtc.isMicEnabled() || !webrtc.hasAudioTrack()"
                [class.border-rose-500/30]="!webrtc.isMicEnabled() || !webrtc.hasAudioTrack()"
              >
                {{ webrtc.hasAudioTrack() ? (webrtc.isMicEnabled() ? 'MIC ACTIVE' : 'MUTED') : 'NO MIC CAPTURED' }}
              </span>
            </div>

            <!-- Live VU Audio Input Level Meter -->
            <div class="space-y-1">
              <div class="flex justify-between text-[11px] text-slate-400">
                <span>Input Signal Level:</span>
                <span class="font-mono font-bold text-emerald-400">{{ webrtc.micLevel() }}%</span>
              </div>
              <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div
                  class="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-75"
                  [style.width.%]="webrtc.micLevel()"
                ></div>
              </div>
            </div>

            <!-- Mic Actions -->
            <div class="flex items-center gap-2 pt-1">
              <button
                (click)="toggleMicHardware()"
                class="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>{{ webrtc.hasAudioTrack() ? (webrtc.isMicEnabled() ? 'Mute Mic' : 'Unmute Mic') : 'Request & Enable Mic' }}</span>
              </button>

              <button
                (click)="testMicLoopback()"
                class="flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
                [class.bg-amber-600]="spatialAudio.isLoopbackActive()"
                [class.text-white]="spatialAudio.isLoopbackActive()"
                [class.bg-slate-800]="!spatialAudio.isLoopbackActive()"
                [class.hover:bg-slate-700]="!spatialAudio.isLoopbackActive()"
                [class.text-slate-200]="!spatialAudio.isLoopbackActive()"
              >
                <span>{{ spatialAudio.isLoopbackActive() ? 'Testing (Speaking...)' : 'Test Mic (Hear Myself)' }}</span>
              </button>
            </div>
            <p class="text-[10px] text-slate-400">
              "Test Mic" plays your voice directly back through your speakers/headphones for 4 seconds so you can verify input.
            </p>
          </div>

          <!-- Position & Session -->
          <div class="p-3 rounded-xl bg-slate-950/40 border border-slate-800 space-y-1.5 font-mono text-[11px] text-slate-300">
            <div><span class="text-slate-500">Self Peer ID:</span> {{ api.selfPeerId() || 'Connecting...' }}</div>
            <div><span class="text-slate-500">Position (Tile):</span> X: {{ playerX.toFixed(2) }}, Y: {{ playerY.toFixed(2) }}</div>
            <div><span class="text-slate-500">Direction:</span> {{ playerDirection }} • State: {{ playerState }}</div>
            <div><span class="text-slate-500">Current Zone:</span> {{ currentZone || 'Open Lounge Hall' }}</div>
          </div>

          <!-- Spatial Audio Test -->
          <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
              <div class="font-semibold text-slate-200">Spatial Stereo Audio Panner Test</div>
              <span
                class="px-2 py-0.5 rounded text-[10px] font-mono"
                [class.bg-emerald-950]="!spatialAudio.isAudioContextSuspended()"
                [class.text-emerald-300]="!spatialAudio.isAudioContextSuspended()"
                [class.bg-rose-950]="spatialAudio.isAudioContextSuspended()"
                [class.text-rose-300]="spatialAudio.isAudioContextSuspended()"
              >
                AUDIO CTX: {{ spatialAudio.isAudioContextSuspended() ? 'SUSPENDED' : 'RUNNING' }}
              </span>
            </div>
            <p class="text-slate-400 text-[11px]">
              Trigger synthetic audio chimes across stereo panning angles to verify Web Audio API spatial falloff.
            </p>
            <div class="flex items-center gap-2 pt-1">
              <button
                (click)="spatialAudio.playSpatialChime(-0.9, 0.7)"
                class="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
              >
                ◀ Left Ear
              </button>
              <button
                (click)="spatialAudio.playSpatialChime(0.0, 0.7)"
                class="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
              >
                Center
              </button>
              <button
                (click)="spatialAudio.playSpatialChime(0.9, 0.7)"
                class="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
              >
                Right Ear ▶
              </button>
            </div>
            @if (spatialAudio.isAudioContextSuspended()) {
              <button
                (click)="spatialAudio.resumeAudioContext()"
                class="w-full mt-2 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition"
              >
                Click to Resume Audio Engine
              </button>
            }
          </div>

          <!-- Architecture & Constraints Summary -->
          <div class="p-3 rounded-xl bg-slate-950/30 border border-slate-800/80 text-[10px] text-slate-400 space-y-1">
            <div class="text-slate-300 font-semibold">System Architecture Compliance:</div>
            <div>• Database: PostgreSQL with embedded startup auto-migrations (sqlx::migrate!())</div>
            <div>• Configuration: Static version-controlled schema (strictly NO .env, NO secret manager)</div>
            <div>• Observability: Structured tracing logging with lifecycle and WebRTC state tracking</div>
            <div>• SaaS Billing: One-time license & pay-per-room (strictly NO recurring subscriptions)</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DiagnosticsModalComponent {
  @Input() playerX = 0;
  @Input() playerY = 0;
  @Input() playerDirection = 'down';
  @Input() playerState = 'idle';
  @Input() currentZone: string | null = null;
  @Output() close = new EventEmitter<void>();

  constructor(
    public api: LoungeApiService,
    public spatialAudio: SpatialAudioService,
    public webrtc: WebRtcMeshService
  ) {}

  async toggleMicHardware(): Promise<void> {
    await this.webrtc.toggleMic();
  }

  async testMicLoopback(): Promise<void> {
    if (this.spatialAudio.isLoopbackActive()) {
      this.spatialAudio.stopMicLoopback();
      return;
    }

    if (!this.webrtc.hasAudioTrack()) {
      const success = await this.webrtc.toggleMic();
      if (!success) return;
    }

    const stream = this.webrtc.localStream();
    if (stream && stream.getAudioTracks().length > 0) {
      this.spatialAudio.startMicLoopback(stream);
    }
  }
}
