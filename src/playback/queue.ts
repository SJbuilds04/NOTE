import { RepeatMode, Track } from '../core/types';

export type QueueSnapshot = {
  /** Tracks in their original (unshuffled) order. */
  tracks: Track[];
  /** Index into `tracks` of the item currently playing, or -1. */
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Where this queue came from, shown as "PLAYING FROM" in Now Playing. */
  context: string;
};

export const EMPTY_QUEUE: QueueSnapshot = {
  tracks: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  context: '',
};

/**
 * The real queue behind the UI.
 *
 * Shuffle is modelled as a separate play order over the same array rather than
 * by mutating it, so toggling shuffle off restores the true order and never
 * loses or duplicates a track.
 */
export class Queue {
  private tracks: Track[] = [];
  private order: number[] = []; // play order, as indices into `tracks`
  private position = -1; // index into `order`
  private shuffleOn = false;
  private repeatMode: RepeatMode = 'off';
  private contextLabel = '';

  // ---- reads ------------------------------------------------------------

  get items(): Track[] {
    return [...this.tracks];
  }

  /** Upcoming tracks in the order they will actually play. */
  get upcoming(): Track[] {
    return this.order.slice(this.position + 1).map((i) => this.tracks[i]);
  }

  get current(): Track | null {
    const i = this.order[this.position];
    return i === undefined ? null : (this.tracks[i] ?? null);
  }

  get currentIndex(): number {
    return this.order[this.position] ?? -1;
  }

  get length(): number {
    return this.tracks.length;
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  get context(): string {
    return this.contextLabel;
  }

  /** True when advancing would run off the end (and repeat is off). */
  get hasNext(): boolean {
    if (!this.tracks.length) return false;
    if (this.repeatMode !== 'off') return true;
    return this.position < this.order.length - 1;
  }

  get hasPrevious(): boolean {
    return this.tracks.length > 0;
  }

  snapshot(): QueueSnapshot {
    return {
      tracks: this.items,
      index: this.currentIndex,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
      context: this.contextLabel,
    };
  }

  restore(snapshot: QueueSnapshot): void {
    this.tracks = [...(snapshot.tracks ?? [])];
    this.shuffleOn = snapshot.shuffle ?? false;
    this.repeatMode = snapshot.repeat ?? 'off';
    this.contextLabel = snapshot.context ?? '';

    this.rebuildOrder();

    const startAt = snapshot.index ?? -1;
    this.position = startAt >= 0 ? this.order.indexOf(startAt) : -1;
  }

  // ---- writes -----------------------------------------------------------

  /** Replace the whole queue and start at `startIndex`. */
  setTracks(tracks: Track[], startIndex = 0, context = ''): void {
    this.tracks = dedupe(tracks);
    this.contextLabel = context;

    // A de-dupe may have shifted the intended start.
    const target = tracks[startIndex];
    const resolvedStart = target
      ? Math.max(0, this.tracks.findIndex((t) => t.id === target.id))
      : 0;

    this.rebuildOrder(resolvedStart);
    this.position = this.order.indexOf(resolvedStart);
    if (this.position < 0) this.position = this.tracks.length ? 0 : -1;
  }

  /** Append to the end of the queue. */
  add(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    const existing = new Set(this.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => !existing.has(t.id));
    if (!fresh.length) return;

    const firstNew = this.tracks.length;
    this.tracks.push(...fresh);
    // Appended tracks go at the end of the play order, shuffled or not.
    for (let i = 0; i < fresh.length; i++) this.order.push(firstNew + i);

    if (this.position < 0 && this.order.length) this.position = 0;
  }

  /** Insert directly after the current track. */
  playNext(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    if (!incoming.length) return;

    // Remove any existing copies so "play next" actually moves them.
    for (const t of incoming) this.remove(t.id, { keepCurrent: true });

    const firstNew = this.tracks.length;
    this.tracks.push(...incoming);

    const insertAt = this.position + 1;
    const newOrder = incoming.map((_, i) => firstNew + i);
    this.order.splice(insertAt, 0, ...newOrder);

    if (this.position < 0 && this.order.length) this.position = 0;
  }

  /** Remove a track by id. Returns true if the current track was removed. */
  remove(trackId: string, opts: { keepCurrent?: boolean } = {}): boolean {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return false;

    const wasCurrent = this.currentIndex === trackIndex;
    if (wasCurrent && opts.keepCurrent) return false;

    const orderPos = this.order.indexOf(trackIndex);

    this.tracks.splice(trackIndex, 1);
    this.order.splice(orderPos, 1);
    // Every index after the removed one shifts down by one.
    this.order = this.order.map((i) => (i > trackIndex ? i - 1 : i));

    if (orderPos < this.position) {
      this.position -= 1;
    } else if (orderPos === this.position) {
      // Stay at the same slot so the next track takes its place.
      this.position = Math.min(this.position, this.order.length - 1);
    }
    if (!this.order.length) this.position = -1;

    return wasCurrent;
  }

  /** Move a track within the visible (play) order. */
  reorder(from: number, to: number): void {
    if (from === to) return;
    if (from < 0 || from >= this.order.length) return;

    const clampedTo = Math.max(0, Math.min(to, this.order.length - 1));
    const currentOrderValue = this.order[this.position];

    const [moved] = this.order.splice(from, 1);
    this.order.splice(clampedTo, 0, moved);

    // Keep pointing at the same track after the move.
    this.position = this.order.indexOf(currentOrderValue);
  }

  clear(): void {
    this.tracks = [];
    this.order = [];
    this.position = -1;
    this.contextLabel = '';
  }

  /** Clear everything except the track currently playing. */
  clearUpcoming(): void {
    const current = this.current;
    if (!current) {
      this.clear();
      return;
    }
    this.tracks = [current];
    this.order = [0];
    this.position = 0;
  }

  setShuffle(on: boolean): void {
    if (this.shuffleOn === on) return;
    this.shuffleOn = on;

    const currentTrackIndex = this.currentIndex;
    this.rebuildOrder(currentTrackIndex >= 0 ? currentTrackIndex : undefined);
    this.position = currentTrackIndex >= 0 ? this.order.indexOf(currentTrackIndex) : -1;
  }

  toggleShuffle(): boolean {
    this.setShuffle(!this.shuffleOn);
    return this.shuffleOn;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  cycleRepeat(): RepeatMode {
    this.repeatMode =
      this.repeatMode === 'off' ? 'all' : this.repeatMode === 'all' ? 'one' : 'off';
    return this.repeatMode;
  }

  // ---- navigation -------------------------------------------------------

  /**
   * Advance to the next track.
   *
   * `auto` distinguishes a track finishing on its own (where repeat-one
   * replays the same track) from the user pressing next (where it does not).
   */
  next(auto = false): Track | null {
    if (!this.tracks.length) return null;

    if (auto && this.repeatMode === 'one') return this.current;

    if (this.position < this.order.length - 1) {
      this.position += 1;
      return this.current;
    }

    if (this.repeatMode === 'all' || (this.repeatMode === 'one' && !auto)) {
      // Reshuffle on wrap so a repeated shuffled queue is not identical.
      if (this.shuffleOn) this.rebuildOrder();
      this.position = 0;
      return this.current;
    }

    return null; // end of queue
  }

  previous(): Track | null {
    if (!this.tracks.length) return null;

    if (this.position > 0) {
      this.position -= 1;
      return this.current;
    }

    if (this.repeatMode === 'all') {
      this.position = this.order.length - 1;
      return this.current;
    }

    return this.current; // already first: restart it
  }

  /** Jump to a specific track by id. */
  jumpTo(trackId: string): Track | null {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return null;

    const orderPos = this.order.indexOf(trackIndex);
    if (orderPos < 0) return null;

    this.position = orderPos;
    return this.current;
  }

  /** Peek at what next() would return, without moving. */
  peekNext(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position < this.order.length - 1) {
      return this.tracks[this.order[this.position + 1]] ?? null;
    }
    if (this.repeatMode === 'all') return this.tracks[this.order[0]] ?? null;
    return null;
  }

  // ---- internals --------------------------------------------------------

  /**
   * Rebuild the play order. When shuffling, `pinFirst` is placed at the head
   * so toggling shuffle never interrupts the track already playing.
   */
  private rebuildOrder(pinFirst?: number): void {
    const indices = this.tracks.map((_, i) => i);

    if (!this.shuffleOn) {
      this.order = indices;
      return;
    }

    const rest = pinFirst === undefined ? indices : indices.filter((i) => i !== pinFirst);

    // Fisher-Yates.
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    this.order = pinFirst === undefined ? rest : [pinFirst, ...rest];
  }
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
