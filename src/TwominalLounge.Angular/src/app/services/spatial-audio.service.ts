import { Injectable, signal } from '@angular/core';
import * as Tone from 'tone';

interface PeerAudioGraph {
  source?: MediaStreamAudioSourceNode | OscillatorNode;
  panner: StereoPannerNode;
  gain: GainNode;
  stream?: MediaStream;
  audioElement?: HTMLAudioElement;
}

@Injectable({
  providedIn: 'root',
})
export class SpatialAudioService {
  private audioCtx: AudioContext | null = null;
  private readonly peerNodes = new Map<string, PeerAudioGraph>();
  private masterGain: GainNode | null = null;

  // Tone.js LoFi Synthesizer state
  private lofiSynth: Tone.PolySynth | null = null;
  private lofiLoop: Tone.Loop | null = null;
  public isLofiPlaying = signal(false);

  // Audio Context State Observable
  public isAudioContextSuspended = signal(false);

  // Loopback test state
  public isLoopbackActive = signal(false);
  private loopbackGain: GainNode | null = null;
  private loopbackSource: MediaStreamAudioSourceNode | null = null;
  private loopbackTimer: any = null;

  // Cached synths for performance and clean audio playback
  private stepSynth: Tone.MembraneSynth | null = null;
  private chimeSynth: Tone.Synth | null = null;
  private noiseSynth: Tone.NoiseSynth | null = null;
  private arcadeSynth: Tone.Synth | null = null;

  constructor() {
    // Auto-listen for first user interaction to unlock browser autoplay policy
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.resumeAudioContext();
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('touchstart', unlock);
    }
  }

  public initAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.audioCtx.destination);

        this.audioCtx.onstatechange = () => {
          setTimeout(() => {
            this.isAudioContextSuspended.set(this.audioCtx?.state === 'suspended');
          }, 0);
        };
      }
    }

    return this.audioCtx!;
  }

  /**
   * Resumes both Web Audio context and Tone.js context upon any user gesture
   */
  public resumeAudioContext(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        this.isAudioContextSuspended.set(false);
      }).catch(() => {});
    }
    try {
      if (Tone.getContext() && Tone.getContext().state === 'suspended') {
        Tone.start().catch(() => {});
      }
    } catch (_) {}
  }

  /**
   * Initializes Tone.js LoFi ambient chord progression generator
   */
  private initToneEngine(): void {
    if (this.lofiSynth) return;

    try {
      this.lofiSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.2, decay: 1.5, sustain: 0.4, release: 2 },
      }).toDestination();
      this.lofiSynth.volume.value = -6; // Pleasant background volume

      const chordProgression = [
        ['C3', 'G3', 'B3', 'E4'],
        ['A2', 'E3', 'G3', 'C4'],
        ['F2', 'C3', 'E3', 'A3'],
        ['G2', 'D3', 'F3', 'B3'],
      ];

      let chordIndex = 0;
      this.lofiLoop = new Tone.Loop((time) => {
        if (!this.lofiSynth) return;
        const chord = chordProgression[chordIndex % chordProgression.length];
        this.lofiSynth.triggerAttackRelease(chord, '2n', time, 0.4);
        chordIndex++;
      }, '2n');

      Tone.getTransport().bpm.value = 65;
    } catch (err) {
      console.warn('Tone.js init deferred until user interaction:', err);
    }
  }

  /**
   * Toggles procedural LoFi background music
   */
  async toggleLofiMusic(): Promise<boolean> {
    this.resumeAudioContext();
    this.initToneEngine();

    if (!this.isLofiPlaying()) {
      try {
        await Tone.start();
        const transport = Tone.getTransport();
        if (transport && typeof transport.start === 'function') {
          transport.start();
        }
        this.lofiLoop?.start(0);
      } catch (err) {
        console.warn('LoFi music start warning:', err);
      }
      this.isLofiPlaying.set(true);
      return true;
    } else {
      try {
        const transport = Tone.getTransport();
        if (transport && typeof transport.stop === 'function') {
          transport.stop();
        }
        this.lofiLoop?.stop();
      } catch (err) {
        console.warn('LoFi music stop warning:', err);
      }
      this.isLofiPlaying.set(false);
      return false;
    }
  }

  /**
   * Plays procedural sound effects using cached Tone.js synthesizers
   * Note: Footstep is tuned to audible range (G2/C3, 98-130Hz) instead of inaudible sub-bass C1.
   */
  playSfx(type: 'step' | 'join' | 'coffee' | 'arcade' | 'fountain'): void {
    try {
      this.resumeAudioContext();

      if (type === 'step') {
        if (!this.stepSynth) {
          this.stepSynth = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 3,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.15, sustain: 0.01, release: 0.1 },
          }).toDestination();
          this.stepSynth.volume.value = -10;
        }
        // G2 (98 Hz) - crisp, audible on laptop speakers and headphones
        this.stepSynth.triggerAttackRelease('G2', '32n', undefined, 0.25);
      } else if (type === 'join') {
        if (!this.chimeSynth) {
          this.chimeSynth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
          }).toDestination();
          this.chimeSynth.volume.value = -6;
        }
        this.chimeSynth.triggerAttackRelease('C5', '8n', undefined, 0.3);
      } else if (type === 'coffee') {
        if (!this.noiseSynth) {
          this.noiseSynth = new Tone.NoiseSynth({
            noise: { type: 'pink' },
            envelope: { attack: 0.02, decay: 0.15, sustain: 0 },
          }).toDestination();
          this.noiseSynth.volume.value = -8;
        }
        this.noiseSynth.triggerAttackRelease('16n', undefined, 0.2);
      } else if (type === 'arcade') {
        if (!this.arcadeSynth) {
          this.arcadeSynth = new Tone.Synth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.2 },
          }).toDestination();
          this.arcadeSynth.volume.value = -8;
        }
        this.arcadeSynth.triggerAttackRelease('E5', '16n', undefined, 0.25);
      } else if (type === 'fountain') {
        if (!this.chimeSynth) {
          this.chimeSynth = new Tone.Synth().toDestination();
        }
        this.chimeSynth.triggerAttackRelease('G5', '8n', undefined, 0.2);
      }
    } catch (_) {}
  }

  /**
   * Attaches an incoming remote MediaStream (from WebRTC) to a 3D spatial panner and gain node.
   * Also configures a hidden audio sink element to ensure Chromium WebRTC audio sink engine decodes packets.
   */
  attachPeerStream(peerId: string, stream: MediaStream): void {
    const ctx = this.initAudioContext();
    this.removePeer(peerId);

    try {
      const panner = ctx.createStereoPanner();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      panner.pan.value = 0.0;

      let source: MediaStreamAudioSourceNode | undefined;
      let audioElement: HTMLAudioElement | undefined;

      if (stream.getAudioTracks().length > 0) {
        source = ctx.createMediaStreamSource(stream);
        source.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain || ctx.destination);

        // Workaround for Chrome WebRTC audio decoder bug:
        // Remote media stream must be set on an Audio element for WebRTC audio packets to pump
        if (typeof document !== 'undefined') {
          audioElement = document.createElement('audio');
          audioElement.srcObject = stream;
          audioElement.autoplay = true;
          audioElement.volume = 0.0001; // Output plays spatially via Web Audio API graph
          audioElement.play().catch(() => {});
        }
      }

      this.peerNodes.set(peerId, { source, panner, gain, stream, audioElement });
    } catch (err) {
      console.warn(`Failed to attach spatial audio stream for peer ${peerId}:`, err);
    }
  }

  /**
   * Updates real-time spatial gain and stereo panning for a peer based on avatar grid distance
   */
  updatePeerSpatialAudio(peerId: string, volume: number, pan: number): void {
    const node = this.peerNodes.get(peerId);
    if (!node || !this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const clampedVol = Math.max(0.0, Math.min(1.0, volume));
    const clampedPan = Math.max(-1.0, Math.min(1.0, pan));

    // Smooth ramp to prevent audio clicks/pops
    try {
      node.gain.gain.linearRampToValueAtTime(clampedVol, now + 0.08);
      node.panner.pan.linearRampToValueAtTime(clampedPan, now + 0.08);
    } catch (_) {}
  }

  /**
   * Plays a stereo spatial test chime with accurate stereo panning (-1.0 to 1.0) and volume
   */
  playSpatialChime(pan: number = 0.0, volume: number = 0.5): void {
    const ctx = this.initAudioContext();
    this.resumeAudioContext();

    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const pannerNode = ctx.createStereoPanner();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      pannerNode.pan.setValueAtTime(Math.max(-1.0, Math.min(1.0, pan)), ctx.currentTime);

      const targetVol = Math.max(0.05, Math.min(1.0, volume)) * 0.45;
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

      osc.connect(pannerNode);
      pannerNode.connect(gainNode);
      gainNode.connect(this.masterGain || ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);
    } catch (_) {
      this.playSfx('join');
    }
  }

  /**
   * Starts a 4-second mic loopback test so user can immediately hear their own microphone
   */
  startMicLoopback(stream: MediaStream): void {
    if (this.isLoopbackActive()) return;
    const ctx = this.initAudioContext();
    this.resumeAudioContext();

    try {
      this.loopbackSource = ctx.createMediaStreamSource(stream);
      this.loopbackGain = ctx.createGain();
      this.loopbackGain.gain.value = 0.8;

      this.loopbackSource.connect(this.loopbackGain);
      this.loopbackGain.connect(ctx.destination);
      this.isLoopbackActive.set(true);

      // Automatically turn off loopback after 4 seconds to prevent accidental feedback
      if (this.loopbackTimer) clearTimeout(this.loopbackTimer);
      this.loopbackTimer = setTimeout(() => {
        this.stopMicLoopback();
      }, 4000);
    } catch (e) {
      console.warn('Mic loopback test failed to start:', e);
      this.isLoopbackActive.set(false);
    }
  }

  stopMicLoopback(): void {
    if (this.loopbackTimer) {
      clearTimeout(this.loopbackTimer);
      this.loopbackTimer = null;
    }
    if (this.loopbackGain) {
      try {
        this.loopbackGain.disconnect();
      } catch (_) {}
      this.loopbackGain = null;
    }
    if (this.loopbackSource) {
      try {
        this.loopbackSource.disconnect();
      } catch (_) {}
      this.loopbackSource = null;
    }
    this.isLoopbackActive.set(false);
  }

  removePeer(peerId: string): void {
    const node = this.peerNodes.get(peerId);
    if (node) {
      try {
        node.gain.disconnect();
        node.panner.disconnect();
        if (node.source) {
          node.source.disconnect();
        }
        if (node.audioElement) {
          node.audioElement.srcObject = null;
          node.audioElement.remove();
        }
      } catch (_) {}
      this.peerNodes.delete(peerId);
    }
  }

  destroy(): void {
    this.stopMicLoopback();
    if (this.isLofiPlaying()) {
      Tone.getTransport().stop();
      this.lofiLoop?.stop();
      this.isLofiPlaying.set(false);
    }
    for (const peerId of this.peerNodes.keys()) {
      this.removePeer(peerId);
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
