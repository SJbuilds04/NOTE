import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { AppError, messageFor, toAppError } from '../core/errors';
import { RepeatMode, Track } from '../core/types';
import { flushWrites, readJson, writeJsonDebounced, STORAGE_KEYS } from '../core/storage';
import { playbackEngine, IDLE_STATUS, PlaybackStatus } from '../playback/PlaybackEngine';
import { Queue, QueueSnapshot, EMPTY_QUEUE } from '../playback/queue';
import { preloader } from '../playback/preload';
import { endpointSource } from '../providers/stream/StreamResolver';
import { LibraryService } from '../services/LibraryService';
import { MusicService } from '../services/MusicService';

type PlayerContextType = {
  // --- the original mock API, unchanged so existing screens keep working ---
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track, context?: { tracks?: Track[]; label?: string }) => void;
  togglePlayPause: () => void;

  // --- everything the real player adds ---
  isLoading: boolean;
  isBuffering: boolean;
  error: string | null;
  clearError: () => void;
  retry: () => void;

  duration: number;
  volume: number;
  setVolume: (v: number) => void;
  seekTo: (seconds: number) => void;

  next: () => void;
  previous: () => void;
  hasNext: boolean;
  hasPrevious: boolean;

  queue: Track[];
  upcoming: Track[];
  queueContext: string;
  addToQueue: (tracks: Track | Track[]) => void;
  playNext: (tracks: Track | Track[]) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (trackId: string) => void;

  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: RepeatMode;
  cycleRepeat: () => void;

  isReady: boolean;
  canPlayCurrent: boolean;
};

/** How many unplayable tracks in a row we step over before giving up. */
const MAX_AUTO_SKIPS = 3;

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

/**
 * Progress lives in its own context because it updates ~4x a second. Screens
 * that only need the current track never re-render on a position tick.
 */
const ProgressContext = createContext<{ position: number; duration: number }>({
  position: 0,
  duration: 0,
});

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queueRef = useRef(new Queue());

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [volume, setVolumeState] = useState(1);

  /** Cancels an in-flight load when the user starts another one. */
  const loadAbort = useRef<AbortController | null>(null);
  /** Identifies the newest load so stale async work can bail out. */
  const loadId = useRef(0);
  /** The track we most recently attempted, for retry(). */
  const lastAttempt = useRef<{ track: Track; position: number } | null>(null);
  /**
   * Consecutive tracks auto-skipped because they would not play. Bounded so a
   * queue full of dead videos stops instead of racing to the end.
   */
  const autoSkips = useRef(0);

  const bumpQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  // ---- persistence ------------------------------------------------------

  const persistQueue = useCallback(() => {
    writeJsonDebounced(STORAGE_KEYS.queue, queueRef.current.snapshot(), 600);
  }, []);

  // ---- loading a track --------------------------------------------------

  const loadCurrent = useCallback(
    async (options: { autoPlay?: boolean; startPosition?: number } = {}) => {
      const track = queueRef.current.current;
      if (!track) {
        setCurrentTrack(null);
        setIsLoading(false);
        playbackEngine.stop();
        return;
      }

      const id = ++loadId.current;
      loadAbort.current?.abort();
      const controller = new AbortController();
      loadAbort.current = controller;

      // Whatever we were warming is no longer the next thing to play.
      preloader.cancel();

      setCurrentTrack(track);
      setError(null);
      setIsLoading(true);
      lastAttempt.current = { track, position: options.startPosition ?? 0 };

      try {
        const stream = await MusicService.resolveStream(track, controller.signal);
        if (id !== loadId.current) return; // superseded by a newer load

        await playbackEngine.load(track, stream, options);
        if (id !== loadId.current) return;

        setIsLoading(false);
        autoSkips.current = 0;
        LibraryService.recordPlay(track);

        // Warm exactly one track ahead, so pressing skip is instant.
        preloader.schedule(queueRef.current.peekNext());
      } catch (e) {
        if (id !== loadId.current) return;

        // Always leave the loading state, whatever went wrong.
        setIsLoading(false);
        const err = toAppError(e, 'playback_failed');

        // A dead stream URL should not be reused on retry.
        if (err.kind !== 'network' && err.kind !== 'timeout') {
          MusicService.invalidateStream(track);
        }

        // A track that simply cannot play should not strand the queue: step
        // over it and keep going. Network failures are NOT skipped -- the
        // next track would fail identically, so the error is shown instead.
        const skippable = err.kind === 'track_unavailable' ||
          err.kind === 'region_restricted' ||
          err.kind === 'source_unavailable';

        if (skippable && autoSkips.current < MAX_AUTO_SKIPS && queueRef.current.hasNext) {
          autoSkips.current += 1;
          queueRef.current.next(false);
          bumpQueue();
          persistQueue();
          void loadCurrent({ autoPlay: true });
          return;
        }

        autoSkips.current = 0;
        setError(messageFor(err));
      }
    },
    [bumpQueue, persistQueue]
  );

  // ---- engine wiring ----------------------------------------------------

  useEffect(() => {
    playbackEngine.on('onStatus', (s) => setStatus(s));

    playbackEngine.on('onComplete', () => {
      // `auto` so repeat-one replays rather than advances.
      const nextTrack = queueRef.current.next(true);
      bumpQueue();
      persistQueue();

      if (!nextTrack) {
        // End of queue: optionally keep going with related tracks.
        void extendWithRelated();
        return;
      }
      void loadCurrent({ autoPlay: true });
    });

    playbackEngine.on('onError', (e) => {
      setIsLoading(false);
      setError(messageFor(e instanceof AppError ? e : toAppError(e, 'playback_failed')));
    });

    return () => {
      preloader.cancel();
      void playbackEngine.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extendWithRelated = useCallback(async () => {
    const settings = LibraryService.getSettings();
    const last = queueRef.current.current;

    if (!settings.autoplayRelated || !last) return;

    try {
      const related = await MusicService.getRelated(last);
      const fresh = related.filter(
        (t) => !queueRef.current.items.some((q) => q.id === t.id)
      );
      if (!fresh.length) return;

      queueRef.current.add(fresh.slice(0, 20));
      const nextTrack = queueRef.current.next(false);
      bumpQueue();
      persistQueue();

      if (nextTrack) void loadCurrent({ autoPlay: true });
    } catch {
      // Autoplay is a convenience; silence is the right failure mode.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- startup: restore library, settings, queue and position -----------

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Promise.all([MusicService.init(), LibraryService.load()]);
        if (cancelled) return;

        const settings = LibraryService.getSettings();
        endpointSource.setEndpoints(settings.resolverEndpoints);

        playbackEngine.setVolume(settings.volume);
        setVolumeState(settings.volume);
        void playbackEngine.configure();

        const snapshot = await readJson<QueueSnapshot>(STORAGE_KEYS.queue, EMPTY_QUEUE);
        if (cancelled) return;

        if (snapshot.tracks?.length) {
          queueRef.current.restore(snapshot);
          bumpQueue();

          const restored = queueRef.current.current;
          if (restored) {
            // Restore the track and its position, but never auto-play on
            // launch -- starting audio unprompted is hostile.
            const saved = await LibraryService.getSavedPlayback();
            if (cancelled) return;

            setCurrentTrack(restored);
            lastAttempt.current = {
              track: restored,
              position: saved.trackId === restored.id ? saved.position : 0,
            };
          }
        }
      } catch {
        // A corrupt restore must never prevent the app from starting.
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persist playback position ---------------------------------------

  // Position ticks ~4x a second but is persisted in whole seconds, so only
  // react when the second actually changes.
  const positionSecond = Math.floor(status.position);

  useEffect(() => {
    if (!currentTrack) return;
    LibraryService.savePlayback(currentTrack.id, positionSecond);
  }, [currentTrack, positionSecond]);

  // Flush pending writes when the app goes to the background or the tab closes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void flushWrites();
    });

    let onHide: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onHide = () => void flushWrites();
      window.addEventListener('pagehide', onHide);
    }

    return () => {
      sub.remove();
      if (onHide && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide);
      }
    };
  }, []);

  // ---- actions ----------------------------------------------------------

  const playTrack = useCallback(
    (track: Track, context?: { tracks?: Track[]; label?: string }) => {
      const list = context?.tracks?.length ? context.tracks : [track];
      const startIndex = Math.max(
        0,
        list.findIndex((t) => t.id === track.id)
      );

      queueRef.current.setTracks(list, startIndex, context?.label ?? '');
      bumpQueue();
      persistQueue();

      void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const togglePlayPause = useCallback(() => {
    const track = queueRef.current.current ?? currentTrack;
    if (!track) return;

    // Restored-but-never-loaded track: the first press starts it.
    if (playbackEngine.trackId !== track.id) {
      if (!queueRef.current.current) {
        queueRef.current.setTracks([track], 0, '');
        bumpQueue();
      }
      void loadCurrent({
        autoPlay: true,
        startPosition: lastAttempt.current?.position ?? 0,
      });
      return;
    }

    if (status.isPlaying) playbackEngine.pause();
    else playbackEngine.play();
  }, [bumpQueue, currentTrack, loadCurrent, status.isPlaying]);

  const next = useCallback(() => {
    const nextTrack = queueRef.current.next(false);
    bumpQueue();
    persistQueue();

    if (!nextTrack) {
      void extendWithRelated();
      return;
    }
    void loadCurrent({ autoPlay: true });
  }, [bumpQueue, extendWithRelated, loadCurrent, persistQueue]);

  const previous = useCallback(() => {
    // Standard behaviour: restart the track if we are more than 3s in.
    if (status.position > 3) {
      void playbackEngine.seekTo(0);
      return;
    }

    queueRef.current.previous();
    bumpQueue();
    persistQueue();
    void loadCurrent({ autoPlay: true });
  }, [bumpQueue, loadCurrent, persistQueue, status.position]);

  const seekTo = useCallback((seconds: number) => {
    void playbackEngine.seekTo(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    playbackEngine.setVolume(clamped);
    setVolumeState(clamped);
    LibraryService.updateSettings({ volume: clamped });
  }, []);

  const retry = useCallback(() => {
    const attempt = lastAttempt.current;
    if (!attempt) return;

    setError(null);
    MusicService.invalidateStream(attempt.track);
    void loadCurrent({ autoPlay: true, startPosition: attempt.position });
  }, [loadCurrent]);

  const clearError = useCallback(() => setError(null), []);

  // ---- queue operations -------------------------------------------------

  const addToQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.add(tracks);
      bumpQueue();
      persistQueue();

      if (wasEmpty) void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const playNextInQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.playNext(tracks);
      bumpQueue();
      persistQueue();

      if (wasEmpty) void loadCurrent({ autoPlay: true });
      else preloader.schedule(queueRef.current.peekNext());
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      const removedCurrent = queueRef.current.remove(trackId);
      bumpQueue();
      persistQueue();

      // Removing the playing track slides the next one into its place.
      if (removedCurrent) {
        if (queueRef.current.current) void loadCurrent({ autoPlay: true });
        else {
          playbackEngine.stop();
          setCurrentTrack(null);
        }
      }
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => {
      queueRef.current.reorder(from, to);
      bumpQueue();
      persistQueue();
    },
    [bumpQueue, persistQueue]
  );

  const clearQueue = useCallback(() => {
    queueRef.current.clearUpcoming();
    bumpQueue();
    persistQueue();
  }, [bumpQueue, persistQueue]);

  const jumpTo = useCallback(
    (trackId: string) => {
      const track = queueRef.current.jumpTo(trackId);
      if (!track) return;

      bumpQueue();
      persistQueue();
      void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const toggleShuffle = useCallback(() => {
    queueRef.current.toggleShuffle();
    bumpQueue();
    persistQueue();
    preloader.schedule(queueRef.current.peekNext());
  }, [bumpQueue, persistQueue]);

  const cycleRepeat = useCallback(() => {
    queueRef.current.cycleRepeat();
    bumpQueue();
    persistQueue();
  }, [bumpQueue, persistQueue]);

  // ---- context values ---------------------------------------------------

  const queueSnapshot = useMemo(
    () => ({
      items: queueRef.current.items,
      upcoming: queueRef.current.upcoming,
      context: queueRef.current.context,
      shuffle: queueRef.current.shuffle,
      repeat: queueRef.current.repeat,
      hasNext: queueRef.current.hasNext,
      hasPrevious: queueRef.current.hasPrevious,
    }),
    // queueVersion is the explicit invalidation signal for the mutable Queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueVersion]
  );

  // Prefer the source-reported duration, falling back to provider metadata
  // so the scrubber is usable before the stream reports one.
  const duration = status.duration || currentTrack?.duration || 0;

  const value = useMemo<PlayerContextType>(
    () => ({
      currentTrack,
      isPlaying: status.isPlaying,
      playTrack,
      togglePlayPause,

      isLoading,
      isBuffering: status.isBuffering,
      error,
      clearError,
      retry,

      duration,
      volume,
      setVolume,
      seekTo,

      next,
      previous,
      hasNext: queueSnapshot.hasNext,
      hasPrevious: queueSnapshot.hasPrevious,

      queue: queueSnapshot.items,
      upcoming: queueSnapshot.upcoming,
      queueContext: queueSnapshot.context,
      addToQueue,
      playNext: playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,

      shuffle: queueSnapshot.shuffle,
      toggleShuffle,
      repeat: queueSnapshot.repeat,
      cycleRepeat,

      isReady,
      canPlayCurrent: currentTrack ? MusicService.canPlay(currentTrack) : false,
    }),
    [
      currentTrack,
      status.isPlaying,
      status.isBuffering,
      playTrack,
      togglePlayPause,
      isLoading,
      error,
      clearError,
      retry,
      duration,
      volume,
      setVolume,
      seekTo,
      next,
      previous,
      queueSnapshot,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,
      toggleShuffle,
      cycleRepeat,
      isReady,
    ]
  );

  const progressValue = useMemo(
    () => ({ position: status.position, duration }),
    [status.position, duration]
  );

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progressValue}>{children}</ProgressContext.Provider>
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};

/** Subscribe to playback position without re-rendering on every other change. */
export const useProgress = () => useContext(ProgressContext);
