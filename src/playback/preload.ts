import { Track } from '../core/types';
import { streamResolver } from '../providers/stream/StreamResolver';

/**
 * Rolling next-track preloader.
 *
 * Only ever one track ahead is in flight. The queue decides *what* should be
 * warm; this decides *when* to stop caring about it. If the user skips A -> C
 * while B was being resolved, B's request is aborted rather than left to
 * finish and occupy bandwidth the current track may need.
 *
 * De-duplication of concurrent resolves for the *same* track is already
 * handled one layer down by StreamResolverChain's in-flight map, so this only
 * has to avoid starting work that has become pointless.
 */
class PreloadManager {
  /** The track we are currently warming, if any. */
  private targetId: string | null = null;
  private controller: AbortController | null = null;

  /**
   * Warm `track` unless it is already warm or already being warmed.
   *
   * Passing null (or a track nothing can resolve) simply cancels whatever was
   * in flight -- reaching the end of a queue should not leave a request open.
   */
  schedule(track: Track | null): void {
    if (!track) {
      this.cancel();
      return;
    }

    // Already the active target: leave the in-flight request alone.
    if (this.targetId === track.id) return;

    // A different track is wanted now, so the previous one is obsolete.
    this.cancel();

    if (!streamResolver.canResolve(track)) return;
    // Already cached and unexpired: nothing to do.
    if (streamResolver.peek(track)) return;

    const controller = new AbortController();
    this.targetId = track.id;
    this.controller = controller;

    void streamResolver
      .resolve(track, controller.signal)
      .catch(() => {
        // A preload failure is not a user-visible event: the track will be
        // resolved again (and the error surfaced) if it ever becomes current.
      })
      .finally(() => {
        // Only clear if this is still the active attempt.
        if (this.controller === controller) {
          this.controller = null;
          this.targetId = null;
        }
      });
  }

  /** Abort any in-flight preload. Safe to call repeatedly. */
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.targetId = null;
  }

  /** The track currently being warmed, for diagnostics. */
  get pending(): string | null {
    return this.targetId;
  }
}

export const preloader = new PreloadManager();
