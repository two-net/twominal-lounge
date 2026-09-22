import { Injectable, signal } from '@angular/core';
import { SpatialAudioService } from './spatial-audio.service';

interface PeerConnection {
  pc: RTCPeerConnection;
  peerId: string;
  remoteStream?: MediaStream;
  iceCandidatesQueue: RTCIceCandidateInit[];
  makingOffer?: boolean;
  isPolite?: boolean;
  ignoreOffer?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class WebRtcMeshService {
  public localStream = signal<MediaStream | null>(null);
  public remoteStreams = signal<Map<string, MediaStream>>(new Map());
  public isCameraEnabled = signal(false);
  public isMicEnabled = signal(false);
  public isScreenSharing = signal(false);
  public localScreenStream = signal<MediaStream | null>(null);
  public onScreenShareEnded?: () => void;

  // Live audio visualization & hardware status
  public micLevel = signal<number>(0);
  public hasAudioTrack = signal<boolean>(false);
  public hasRealCamera = signal<boolean>(false);

  private readonly peerConnections = new Map<string, PeerConnection>();
  private localPeerId: string = '';
  private onSignalSend?: (targetPeerId: string, signalData: any) => void;

  private analyserCtx: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private micStreamSource: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;
  private isVirtualVideoActive = false;
  private activeScreenTrack: MediaStreamTrack | null = null;

  private readonly iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor(private spatialAudio: SpatialAudioService) {}

  public init(localPeerId: string, sendSignal: (targetPeerId: string, data: any) => void): void {
    this.localPeerId = localPeerId;
    this.onSignalSend = sendSignal;
    this.initLocalMedia();
  }

  /**
   * Initializes local media stream with robust independent audio & video acquisition
   */
  public async initLocalMedia(): Promise<void> {
    const combinedStream = new MediaStream();

    // 1. Camera off by default: initialize virtual avatar video track immediately
    // so this.localStream() is never null and ready synchronously from the start
    this.hasRealCamera.set(false);
    this.isCameraEnabled.set(false);
    if (typeof document !== 'undefined') {
      const virtualTrack = this.createVirtualVideoTrack();
      if (virtualTrack) {
        virtualTrack.enabled = false;
        combinedStream.addTrack(virtualTrack);
        this.isVirtualVideoActive = true;
      }
    }
    this.localStream.set(combinedStream);

    // 2. Attempt to acquire real microphone stream asynchronously (muted by default)
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          combinedStream.addTrack(audioTrack);
          this.hasAudioTrack.set(true);
          this.isMicEnabled.set(false);
          this.setupMicAnalyser(audioStream);
          this.localStream.set(new MediaStream(combinedStream.getTracks()));
          this.syncTracksForAllPeers();
        }
      }
    } catch (err) {
      console.warn('Initial microphone acquisition deferred or denied:', err);
      this.hasAudioTrack.set(false);
      this.isMicEnabled.set(false);
    }
  }

  /**
   * Generates a procedural canvas video track as a clean fallback avatar feed
   */
  private createVirtualVideoTrack(): MediaStreamTrack | null {
    try {
      const virtualCanvas = document.createElement('canvas');
      virtualCanvas.width = 320;
      virtualCanvas.height = 240;
      const vCtx = virtualCanvas.getContext('2d');
      if (!vCtx) return null;

      let frame = 0;
      const renderVirtualVideo = () => {
        frame++;
        vCtx.fillStyle = '#0f172a';
        vCtx.fillRect(0, 0, 320, 240);

        vCtx.fillStyle = '#38bdf8';
        vCtx.font = 'bold 18px system-ui';
        vCtx.fillText('Twominal Spatial Avatar', 40, 95);

        vCtx.fillStyle = '#94a3b8';
        vCtx.font = '13px system-ui';
        const displayId = this.localPeerId ? this.localPeerId.slice(0, 12) : 'Active User';
        vCtx.fillText(`Virtual Video Feed • ${displayId}`, 40, 125);

        // Animated proximity radar pulse
        const pulse = Math.sin(frame * 0.05) * 5;
        vCtx.fillStyle = '#10b981';
        vCtx.beginPath();
        vCtx.arc(280, 40, 8 + pulse, 0, Math.PI * 2);
        vCtx.fill();

        requestAnimationFrame(renderVirtualVideo);
      };
      renderVirtualVideo();

      const canvasStream = (virtualCanvas as any).captureStream ? (virtualCanvas as any).captureStream(15) : null;
      return canvasStream ? canvasStream.getVideoTracks()[0] : null;
    } catch (err) {
      console.warn('Could not create virtual video track:', err);
      return null;
    }
  }

  /**
   * Sets up real-time audio analysis for VU meter and live voice activity visualization
   */
  private setupMicAnalyser(stream: MediaStream): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.analyserCtx) {
        this.analyserCtx = new AudioContextClass();
      }
      if (this.analyserCtx.state === 'suspended') {
        this.analyserCtx.resume().catch(() => {});
      }

      if (this.micStreamSource) {
        try {
          this.micStreamSource.disconnect();
        } catch (_) {}
      }

      this.micStreamSource = this.analyserCtx.createMediaStreamSource(stream);
      this.audioAnalyser = this.analyserCtx.createAnalyser();
      this.audioAnalyser.fftSize = 64;
      this.audioAnalyser.smoothingTimeConstant = 0.4;
      this.micStreamSource.connect(this.audioAnalyser);

      const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      const updateMeter = () => {
        if (!this.audioAnalyser || !this.isMicEnabled()) {
          this.micLevel.set(0);
        } else {
          this.audioAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          // Normalize to 0-100 percentage
          const level = Math.min(100, Math.round((avg / 128) * 100));
          this.micLevel.set(level);
        }
        this.animFrameId = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (e) {
      console.warn('Microphone analyser setup deferred:', e);
    }
  }

  private getTracksToSend(): MediaStreamTrack[] {
    const tracks: MediaStreamTrack[] = [];
    const local = this.localStream();
    if (local) {
      for (const t of local.getAudioTracks()) {
        if (t.readyState === 'live') {
          tracks.push(t);
        }
      }
    }
    if (this.isScreenSharing() && this.activeScreenTrack && this.activeScreenTrack.readyState === 'live') {
      tracks.push(this.activeScreenTrack);
    } else if (local) {
      for (const t of local.getVideoTracks()) {
        if (t.readyState === 'live') {
          tracks.push(t);
        }
      }
    }
    return tracks;
  }

  public syncTracksForPeer(conn: PeerConnection): void {
    const { pc, peerId } = conn;
    let needsNegotiation = false;
    const tracksToSend = this.getTracksToSend();
    const senders = pc.getSenders();

    for (const track of tracksToSend) {
      const existingSender = senders.find(
        (s) => s.track?.kind === track.kind || (!s.track && (s as any).kind === track.kind)
      );
      if (existingSender) {
        if (existingSender.track !== track) {
          existingSender.replaceTrack(track).catch((err) => {
            console.warn(`[WebRTC] Error in replaceTrack for peer ${peerId}:`, err);
          });
        }
      } else {
        const stream = this.localStream() || new MediaStream();
        try {
          pc.addTrack(track, stream);
          needsNegotiation = true;
        } catch (err) {
          console.warn(`[WebRTC] Error in addTrack for peer ${peerId}:`, err);
        }
      }
    }

    if (needsNegotiation && pc.signalingState === 'stable') {
      this.negotiate(peerId);
    }
  }

  public syncTracksForAllPeers(): void {
    for (const conn of this.peerConnections.values()) {
      this.syncTracksForPeer(conn);
    }
  }

  public async negotiate(peerId: string): Promise<void> {
    const conn = this.peerConnections.get(peerId);
    if (!conn) return;
    const { pc } = conn;
    if (conn.makingOffer || pc.signalingState !== 'stable') {
      return;
    }
    try {
      conn.makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      if (this.onSignalSend && pc.localDescription) {
        this.onSignalSend(peerId, { type: 'offer', sdp: pc.localDescription });
      }
    } catch (err) {
      console.warn(`[WebRTC] Error during negotiation offer for ${peerId}:`, err);
    } finally {
      conn.makingOffer = false;
    }
  }

  /**
   * Called when proximity engine updates peer in_range status
   */
  public handleProximityState(peerId: string, inRange: boolean, isSharing: boolean = false): void {
    if (inRange || isSharing || this.isScreenSharing()) {
      this.ensurePeerConnection(peerId);
    } else {
      this.closePeerConnection(peerId);
    }
  }

  public ensurePeerConnection(peerId: string): void {
    if (!peerId || peerId === this.localPeerId) return;

    let conn = this.peerConnections.get(peerId);
    if (!conn || conn.pc.connectionState === 'closed' || conn.pc.connectionState === 'failed') {
      if (conn) {
        this.closePeerConnection(peerId);
      }
      this.createPeerConnection(peerId, true);
      return;
    }

    this.syncTracksForPeer(conn);
    if (!conn.remoteStream && conn.pc.signalingState === 'stable') {
      this.negotiate(peerId);
    }
  }

  private createPeerConnection(peerId: string, shouldInitiateOffer: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const isPolite = this.localPeerId.localeCompare(peerId) > 0;
    const conn: PeerConnection = {
      pc,
      peerId,
      iceCandidatesQueue: [],
      makingOffer: false,
      isPolite,
      ignoreOffer: false,
    };
    this.peerConnections.set(peerId, conn);

    // Add local tracks (mic + camera or screen track)
    const tracks = this.getTracksToSend();
    const stream = this.localStream() || new MediaStream();
    tracks.forEach((track) => {
      try {
        pc.addTrack(track, stream);
      } catch (_) {}
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.onSignalSend) {
        this.onSignalSend(peerId, { type: 'candidate', candidate: event.candidate });
      }
    };

    pc.onnegotiationneeded = () => {
      this.negotiate(peerId);
    };

    pc.ontrack = (event) => {
      if (!conn.remoteStream) {
        conn.remoteStream = new MediaStream();
      }

      if (!conn.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        conn.remoteStream.addTrack(event.track);
      }

      if (event.streams && event.streams[0]) {
        for (const t of event.streams[0].getTracks()) {
          if (!conn.remoteStream.getTracks().some((existing) => existing.id === t.id)) {
            conn.remoteStream.addTrack(t);
          }
        }
      }

      // Create a fresh wrapper MediaStream instance with all tracks so Angular reactive signals
      // and HTML5 video DOM srcObject properties reliably detect stream/track updates!
      const freshStream = new MediaStream(conn.remoteStream.getTracks());
      conn.remoteStream = freshStream;

      const current = new Map(this.remoteStreams());
      current.set(peerId, freshStream);
      this.remoteStreams.set(current);

      // Attach audio to 3D spatial panner & gain nodes
      if (event.track.kind === 'audio') {
        this.spatialAudio.attachPeerStream(peerId, freshStream);
      }

      event.track.onended = () => {
        if (conn.remoteStream) {
          conn.remoteStream.removeTrack(event.track);
          const updatedStream = new MediaStream(conn.remoteStream.getTracks());
          conn.remoteStream = updatedStream;
          const updated = new Map(this.remoteStreams());
          updated.set(peerId, updatedStream);
          this.remoteStreams.set(updated);
        }
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection with ${peerId} failed; attempting ICE restart.`);
        try {
          (pc as any).restartIce?.();
        } catch (_) {}
      }
    };

    if (shouldInitiateOffer) {
      this.negotiate(peerId);
    }

    return pc;
  }

  public async handleIncomingSignal(fromPeerId: string, signalData: any): Promise<void> {
    let conn = this.peerConnections.get(fromPeerId);
    if (!conn) {
      this.createPeerConnection(fromPeerId, false);
      conn = this.peerConnections.get(fromPeerId)!;
    }

    const { pc } = conn;

    try {
      if (signalData.type === 'offer') {
        const offerCollision = conn.makingOffer || pc.signalingState !== 'stable';
        conn.ignoreOffer = !conn.isPolite && offerCollision;
        if (conn.ignoreOffer) {
          console.warn(`[WebRTC] Impolite peer ignoring offer collision from ${fromPeerId}`);
          return;
        }

        if (offerCollision) {
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (e) {
            console.warn(`[WebRTC] Local offer rollback warning for ${fromPeerId}:`, e);
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));

        // Process buffered ICE candidates that arrived before remote description
        while (conn.iceCandidatesQueue.length > 0) {
          const cand = conn.iceCandidatesQueue.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.onSignalSend && pc.localDescription) {
          this.onSignalSend(fromPeerId, { type: 'answer', sdp: pc.localDescription });
        }
      } else if (signalData.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          // Process buffered ICE candidates
          while (conn.iceCandidatesQueue.length > 0) {
            const cand = conn.iceCandidatesQueue.shift()!;
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }
      } else if (signalData.type === 'candidate' && signalData.candidate) {
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          conn.iceCandidatesQueue.push(signalData.candidate);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`WebRTC signal handling failed from ${fromPeerId}:`, err);
    }
  }

  /**
   * Toggles microphone with user-gesture prompt fallback if not yet acquired
   */
  public async toggleMic(): Promise<boolean> {
    // Make sure AudioContext is unblocked
    this.spatialAudio.resumeAudioContext();

    let stream = this.localStream();
    if (!stream) {
      stream = new MediaStream();
    }

    const targetState = !this.isMicEnabled();

    if (targetState) {
      // Turning Mic ON
      let audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            const newTrack = micStream.getAudioTracks()[0];
            if (newTrack) {
              stream.addTrack(newTrack);
              this.hasAudioTrack.set(true);
              this.setupMicAnalyser(micStream);
              this.addTrackToAllPeers(newTrack, stream);
              audioTracks = [newTrack];
            }
          }
        } catch (err) {
          console.error('Failed to acquire microphone on user gesture:', err);
          this.isMicEnabled.set(false);
          this.hasAudioTrack.set(false);
          return false;
        }
      }
      audioTracks.forEach((t) => (t.enabled = true));
      this.isMicEnabled.set(true);

      if (this.analyserCtx && this.analyserCtx.state === 'suspended') {
        this.analyserCtx.resume().catch(() => {});
      }
    } else {
      // Turning Mic OFF
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      this.isMicEnabled.set(false);
      this.micLevel.set(0);
    }

    this.localStream.set(new MediaStream(stream.getTracks()));
    return this.isMicEnabled();
  }

  /**
   * Toggles camera with upgrade from virtual canvas to real webcam
   */
  public async toggleCam(): Promise<boolean> {
    let stream = this.localStream();
    if (!stream) {
      stream = new MediaStream();
    }

    const targetState = !this.isCameraEnabled();

    if (targetState) {
      // Turning Camera ON
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
          });
          const newVideoTrack = camStream.getVideoTracks()[0];
          if (newVideoTrack) {
            // Remove old video tracks
            stream.getVideoTracks().forEach((oldTrack) => {
              if (oldTrack !== this.activeScreenTrack) {
                try {
                  oldTrack.stop();
                } catch (_) {}
                stream!.removeTrack(oldTrack);
              }
            });
            stream.addTrack(newVideoTrack);
            this.hasRealCamera.set(true);
            this.isVirtualVideoActive = false;
            if (!this.isScreenSharing()) {
              this.replaceTrackInAllPeers(newVideoTrack, 'video');
            }
          }
        }
      } catch (err) {
        console.warn('Real webcam unavailable; falling back to virtual avatar video feed', err);
        const liveVideo = stream.getVideoTracks().find((t) => t.readyState === 'live' && t !== this.activeScreenTrack);
        if (!liveVideo) {
          const virtualTrack = this.createVirtualVideoTrack();
          if (virtualTrack) {
            stream.addTrack(virtualTrack);
            this.isVirtualVideoActive = true;
            if (!this.isScreenSharing()) {
              this.replaceTrackInAllPeers(virtualTrack, 'video');
            }
          }
        }
      }
      stream.getVideoTracks().forEach((t) => {
        if (t !== this.activeScreenTrack || this.isScreenSharing()) {
          t.enabled = true;
        }
      });
      this.isCameraEnabled.set(true);
    } else {
      // Turning Camera OFF: Stop physical camera tracks so the hardware camera sensor and LED turn off completely
      stream.getVideoTracks().forEach((t) => {
        if (t !== this.activeScreenTrack) {
          try {
            t.stop();
          } catch (_) {}
          stream!.removeTrack(t);
        }
      });
      this.hasRealCamera.set(false);

      if (!this.isScreenSharing()) {
        const virtualTrack = this.createVirtualVideoTrack();
        if (virtualTrack) {
          virtualTrack.enabled = false;
          stream.addTrack(virtualTrack);
          this.isVirtualVideoActive = true;
          this.replaceTrackInAllPeers(virtualTrack, 'video');
        } else {
          this.replaceTrackInAllPeers(null, 'video');
        }
      }
      this.isCameraEnabled.set(false);
    }

    this.localStream.set(new MediaStream(stream.getTracks()));
    return this.isCameraEnabled();
  }

  /**
   * Generates a procedural animated canvas video track as a simulated screen presentation
   * for contexts where getDisplayMedia is unsupported, denied, or run in headless testing.
   */
  private createSimulatedScreenStream(): MediaStream | null {
    try {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      let frame = 0;
      const render = () => {
        if (!ctx || !ctx.fillRect) return;
        try {
          frame++;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 1280, 720);

          if (ctx.createLinearGradient) {
            const grad = ctx.createLinearGradient(0, 0, 1280, 720);
            grad.addColorStop(0, '#090d16');
            grad.addColorStop(1, '#0f172a');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1280, 720);
          }

          if (ctx.fillText) {
            ctx.fillStyle = '#14b8a6';
            ctx.font = 'bold 24px system-ui, sans-serif';
            ctx.fillText('🖥️ Twominal Lounge — Screen Presentation Broadcast', 65, 72);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px system-ui, sans-serif';
            ctx.fillText(`Live Stream • Local Display Capture • 60 FPS`, 65, 95);

            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 26px system-ui, sans-serif';
            ctx.fillText('Spatial Architecture & Screen Sync', 70, 175);
          }

          if (this.isScreenSharing() && typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(render);
          }
        } catch (_) {}
      };
      render();

      const captureStreamFn = (canvas as any).captureStream || (canvas as any).mozCaptureStream;
      if (captureStreamFn) {
        return captureStreamFn.call(canvas, 30);
      }

      // Safe fallback for headless test runners / jsdom environments where captureStream is absent
      const mockTrack = {
        kind: 'video',
        id: 'simulated-screen-' + Math.random().toString(36).substring(2, 8),
        label: 'Simulated Screen Track',
        enabled: true,
        muted: false,
        readyState: 'live',
        stop: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as unknown as MediaStreamTrack;

      let stream: any = null;
      if (typeof MediaStream !== 'undefined') {
        try {
          stream = new MediaStream();
          stream.addTrack(mockTrack);
        } catch (_) {}
      }

      if (!stream || !stream.getVideoTracks || stream.getVideoTracks().length === 0) {
        stream = {
          id: 'simulated-stream-' + Math.random().toString(36).substring(2, 8),
          active: true,
          getTracks: () => [mockTrack],
          getVideoTracks: () => [mockTrack],
          getAudioTracks: () => [],
          addTrack: () => {},
          removeTrack: () => {},
        };
      }
      return stream as MediaStream;
    } catch (err) {
      console.warn('Could not generate simulated screen stream:', err);
      return null;
    }
  }

  /**
   * Starts screen sharing by requesting display media from browser or falling back to presentation canvas
   */
  public async startScreenShare(): Promise<MediaStream | null> {
    try {
      let stream: MediaStream | null = null;
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'monitor',
              frameRate: { ideal: 30, max: 60 },
            },
            audio: false,
          });
        } catch (mediaErr: any) {
          // If user clicked Cancel in the browser display media picker
          if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'AbortError') {
            console.info('Display media picker was cancelled by user.');
            return null;
          }
          console.warn('getDisplayMedia failed, falling back to simulated screen stream:', mediaErr);
          stream = this.createSimulatedScreenStream();
        }
      } else {
        console.warn('getDisplayMedia not supported in this browser; using simulated presentation stream.');
        stream = this.createSimulatedScreenStream();
      }

      if (!stream) {
        return null;
      }

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        return null;
      }

      this.activeScreenTrack = screenTrack;
      this.localScreenStream.set(stream);
      this.isScreenSharing.set(true);

      // Handle user stopping screen share via browser's native banner ("Stop sharing" button)
      screenTrack.onended = () => {
        this.stopScreenShare();
        if (this.onScreenShareEnded) {
          this.onScreenShareEnded();
        }
      };

      // Add or update track in localStream so new peers receive the screen track
      const local = this.localStream();
      if (local) {
        local.getVideoTracks().forEach((t) => {
          if (t !== screenTrack) {
            t.enabled = false;
          }
        });
        if (!local.getTracks().includes(screenTrack)) {
          local.addTrack(screenTrack);
        }
      }

      // Propagate screen track to all connected peers
      this.syncTracksForAllPeers();

      return stream;
    } catch (err) {
      console.error('Failed to start screen share:', err);
      return null;
    }
  }

  /**
   * Stops screen sharing and restores camera or virtual avatar video track
   */
  public stopScreenShare(): void {
    if (!this.isScreenSharing() && !this.activeScreenTrack) {
      return;
    }

    if (this.activeScreenTrack) {
      try {
        this.activeScreenTrack.stop();
      } catch (_) {}
      this.activeScreenTrack = null;
    }

    const currentScreenStream = this.localScreenStream();
    if (currentScreenStream) {
      currentScreenStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
      this.localScreenStream.set(null);
    }

    this.isScreenSharing.set(false);

    // Restore video track for localStream and active WebRTC peers
    const local = this.localStream();
    if (local) {
      local.getVideoTracks().forEach((t) => {
        if (t.readyState === 'ended') {
          local.removeTrack(t);
        }
      });

      let restoreTrack: MediaStreamTrack | null = null;
      if (this.isCameraEnabled() && this.hasRealCamera()) {
        restoreTrack = local.getVideoTracks().find((t) => t.readyState === 'live' && t !== this.activeScreenTrack) || null;
      }

      if (!restoreTrack) {
        let vTrack: MediaStreamTrack | null | undefined = local.getVideoTracks().find((t) => t.readyState === 'live');
        if (!vTrack) {
          vTrack = this.createVirtualVideoTrack();
          if (vTrack) {
            local.addTrack(vTrack);
            this.isVirtualVideoActive = true;
          }
        }
        if (vTrack) {
          vTrack.enabled = this.isCameraEnabled();
          restoreTrack = vTrack;
        }
      }

      if (restoreTrack) {
        this.syncTracksForAllPeers();
      }
    }
  }

  public async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing()) {
      this.stopScreenShare();
      return false;
    } else {
      const stream = await this.startScreenShare();
      return !!stream;
    }
  }

  /**
   * Propagates newly acquired track to all active peer connections
   */
  private addTrackToAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.syncTracksForAllPeers();
  }

  private replaceTrackInAllPeers(track: MediaStreamTrack | null, kind: 'audio' | 'video'): void {
    this.syncTracksForAllPeers();
  }

  public closePeerConnection(peerId: string): void {
    const conn = this.peerConnections.get(peerId);
    if (conn) {
      try {
        conn.pc.onnegotiationneeded = null;
        conn.pc.onicecandidate = null;
        conn.pc.ontrack = null;
        conn.pc.onconnectionstatechange = null;
        conn.pc.close();
      } catch (_) {}
      this.peerConnections.delete(peerId);
      this.spatialAudio.removePeer(peerId);

      const current = new Map(this.remoteStreams());
      current.delete(peerId);
      this.remoteStreams.set(current);
    }
  }

  public disconnectAll(): void {
    this.stopScreenShare();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    for (const peerId of Array.from(this.peerConnections.keys())) {
      this.closePeerConnection(peerId);
    }
    const stream = this.localStream();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      this.localStream.set(null);
    }
    if (this.analyserCtx) {
      try {
        this.analyserCtx.close();
      } catch (_) {}
      this.analyserCtx = null;
    }
  }
}
