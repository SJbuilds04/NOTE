import { Platform } from 'react-native';
import {
  AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import { appError, toAppError } from '../core/errors';
import { ResolvedStream, Track } from '../core/types';

export type PlaybackStatus = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; 0 until the source reports one. */
  duration: number;
  volume: number;
};

export const IDLE_STATUS: PlaybackStatus = {
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  position: 0,
  duration: 0,
  volume: 1,
};

type EngineEvents = {
  onStatus: (status: PlaybackStatus) => void;
  /** The current track played through to its end. */
  onComplete: () => void;
  /** Playback failed for the loaded track. */
  onError: (error: unknown) => void;
};

/**
 * Wraps expo-audio behind a small imperative interface.
 *
 * The engine is intentionally ignorant of queues, providers and the UI: it
 * plays one resolved stream at a time and reports what happened. Everything
 * about *which* track plays next lives in the controller above it.
 */
export class PlaybackEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove: () => void } | null = null;
  private listeners: Partial<EngineEvents> = {};

  private status: PlaybackStatus = { ...IDLE_STATUS };
  private currentTrackId: string | null = null;
  private desiredVolume = 1;

  /** Guards against a stalled load leaving the UI spinning forever. */
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set while we are swapping sources, so stale status events are ignored. */
  private loadToken = 0;
  private completionFired = false;

  private configured = false;

  on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void {
    this.listeners[event] = handler;
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  /**
   * Configure the global audio session: keep playing when the device is
   * silenced or the app is backgrounded.
   */
  async configure(): Promise<void> {
    if (this.configured) return;
    this.configured = true;

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch {
      // Audio mode is a best-effort optimisation, never a reason to fail.
    }
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;

    // 250ms keeps the progress bar smooth without flooding React with updates.
    const player = createAudioPlayer(null, { updateInterval: 250 });
    player.volume = this.desiredVolume;

    this.subscription = player.addListener('playbackStatusUpdate', (s) => {
      this.handleStatus(s);
    });

    this.player = player;
    return player;
  }

  private handleStatus(s: any): void {
    const duration = Number.isFinite(s?.duration) && s.duration > 0 ? s.duration : 0;
    const position = Number.isFinite(s?.currentTime) ? Math.max(0, s.currentTime) : 0;

    // A source that has started reporting time is no longer "loading".
    if (s?.isLoaded && this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }

    if (s?.error) {
      this.clearLoadTimer();
      this.listeners.onError?.(appError('playback_failed', String(s.error)));
      return;
    }

    this.status = {
      isPlaying: Boolean(s?.playing),
      isBuffering: Boolean(s?.isBuffering),
      isLoaded: Boolean(s?.isLoaded),
      position,
      duration,
      volume: Number.isFinite(s?.volume) ? s.volume : this.desiredVolume,
    };

    this.listeners.onStatus?.(this.status);

    // `didJustFinish` can repeat across updates; fire completion only once.
    if (s?.didJustFinish && !this.completionFired) {
      this.completionFired = true;
      this.listeners.onComplete?.();
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  /** Load a resolved stream and begin playing it. */
  async load(
    track: Track,
    stream: ResolvedStream,
    options: { autoPlay?: boolean; startPosition?: number } = {}
  ): Promise<void> {
    const { autoPlay = true, startPosition = 0 } = options;
    const token = ++this.loadToken;

    try {
      const player = this.ensurePlayer();
      await this.configure();

      this.currentTrackId = track.id;
      this.completionFired = false;

      this.status = { ...IDLE_STATUS, isBuffering: true, volume: this.desiredVolume };
      this.listeners.onStatus?.(this.status);

      player.replace({ uri: stream.url });
      player.volume = this.desiredVolume;

      // If the source never loads, surface a real error instead of hanging.
      this.clearLoadTimer();
      this.loadTimer = setTimeout(() => {
        if (token !== this.loadToken) return;
        if (this.status.isLoaded) return;
        this.listeners.onError?.(appError('playback_failed', 'Stream did not start'));
      }, 20_000);

      if (startPosition > 0) {
        try {
          await player.seekTo(startPosition);
        } catch {
          // Seeking before the source is ready is not fatal.
        }
      }

      if (autoPlay) player.play();

      this.setLockScreenMetadata(track);
    } catch (e) {
      this.clearLoadTimer();
      throw toAppError(e, 'playback_failed');
    }
  }

  play(): void {
    try {
      this.player?.play();
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  pause(): void {
    try {
      this.player?.pause();
    } catch {
      /* pausing a released player is harmless */
    }
  }

  async seekTo(seconds: number): Promise<void> {
    if (!this.player) return;

    // A non-finite target would poison the media element's currentTime and
    // put the player into a permanent error state.
    if (!Number.isFinite(seconds)) return;

    const duration = this.status.duration;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);

    try {
      // Seeking backwards after a finish should allow completion to fire again.
      this.completionFired = false;
      await this.player.seekTo(target);

      // Reflect the new position immediately so the UI does not lag a tick.
      this.status = { ...this.status, position: target };
      this.listeners.onStatus?.(this.status);
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  setVolume(volume: number): void {
    this.desiredVolume = Math.max(0, Math.min(1, volume));
    if (this.player) this.player.volume = this.desiredVolume;

    this.status = { ...this.status, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  getVolume(): number {
    return this.desiredVolume;
  }

  /** Stop and unload, returning the engine to idle. */
  stop(): void {
    this.clearLoadTimer();
    this.loadToken++;
    this.currentTrackId = null;
    this.completionFired = false;

    try {
      this.player?.pause();
      this.player?.replace(null);
    } catch {
      /* already torn down */
    }

    this.status = { ...IDLE_STATUS, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  /** Native lock-screen / notification controls. */
  private setLockScreenMetadata(track: Track): void {
    if (Platform.OS === 'web') return;

    try {
      this.player?.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist.name,
        albumTitle: track.album,
        artworkUrl: track.albumImageUrl || undefined,
      });
    } catch {
      // Lock screen controls are optional; never block playback on them.
    }
  }

  get trackId(): string | null {
    return this.currentTrackId;
  }

  async release(): Promise<void> {
    this.clearLoadTimer();
    this.subscription?.remove();
    this.subscription = null;

    try {
      this.player?.remove();
    } catch {
      /* best effort */
    }
    this.player = null;

    try {
      await setIsAudioActiveAsync(false);
    } catch {
      /* best effort */
    }
  }
}

export const playbackEngine = new PlaybackEngine();
