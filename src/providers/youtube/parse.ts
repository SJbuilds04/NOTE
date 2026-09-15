import {
  Album,
  ArtistResult,
  RemotePlaylist,
  Track,
  trackKey,
} from '../../core/types';

/**
 * InnerTube responses are deeply nested renderer trees whose exact shape shifts
 * over time. Everything here is defensive: a missing branch yields null and the
 * item is skipped, never a crash.
 */

type Any = Record<string, any>;

const runs = (node: Any | undefined): Any[] =>
  (node?.text?.runs ?? node?.runs ?? []) as Any[];

const runsText = (node: Any | undefined): string =>
  runs(node)
    .map((r) => r?.text ?? '')
    .join('');

/** "3:55" / "1:02:03" -> seconds. Returns 0 when unparseable. */
export function parseDuration(text: string | undefined): number {
  if (!text) return 0;
  const parts = text.trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;

  return parts.reduce((total, part) => total * 60 + part, 0);
}

const isDurationText = (t: string) => /^\d+:\d{2}(:\d{2})?$/.test(t.trim());

/**
 * YouTube thumbnails carry their size in the URL. Upscale the request so
 * artwork stays sharp in the large Now Playing view.
 */
export function upscaleThumbnail(url: string | undefined, size = 544): string {
  if (!url) return '';
  if (/=w\d+-h\d+/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  }
  if (/=s\d+/.test(url)) {
    return url.replace(/=s\d+/, `=s${size}`);
  }
  // i.ytimg.com style: /vi/<id>/hqdefault.jpg
  return url.replace(/\/(default|mqdefault|hqdefault)\.jpg/, '/hqdefault.jpg');
}

function pickThumbnail(item: Any, size = 544): string {
  const list =
    item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    item?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    item?.thumbnail?.thumbnails ??
    [];
  if (!list.length) return '';

  const best = list[list.length - 1];
  return upscaleThumbnail(best?.url, size);
}

const flexColumn = (item: Any, i: number): Any | undefined =>
  item?.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer;

const fixedColumnText = (item: Any): string =>
  runsText(item?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer);

/** Playlist browse ids need a "VL" prefix to be browsable. */
export function normalizePlaylistBrowseId(id: string): string {
  if (!id) return '';
  if (id.startsWith('VL')) return id;
  if (/^(PL|OL|RD|UU|LL)/.test(id)) return `VL${id}`;
  return id;
}

function videoIdOf(item: Any): string | undefined {
  return (
    item?.playlistItemData?.videoId ??
    flexColumn(item, 0)?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ??
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    item?.navigationEndpoint?.watchEndpoint?.videoId
  );
}

/**
 * Parse one `musicResponsiveListItemRenderer` into a Track.
 *
 * The subtitle column is a run list like `Artist - Album - 5:38` (search) or
 * just `Artist` (playlist browse, where the duration lives in a fixed column
 * instead). We read it positionally from the end so both layouts work.
 */
export function parseTrackItem(item: Any): Track | null {
  if (!item) return null;

  const sourceId = videoIdOf(item);
  if (!sourceId) return null;

  const title = runsText(flexColumn(item, 0));
  if (!title) return null;

  const subtitleRuns = runs(flexColumn(item, 1)).filter(
    (r) => r?.text && String(r.text).trim() && String(r.text).trim() !== '•'
  );
  const texts = subtitleRuns.map((r) => String(r.text));

  // Duration: either the trailing subtitle run, or the fixed column.
  let duration = 0;
  const tail = texts[texts.length - 1];
  if (tail && isDurationText(tail)) {
    duration = parseDuration(tail);
    texts.pop();
    subtitleRuns.pop();
  } else {
    duration = parseDuration(fixedColumnText(item));
  }

  // Drop a leading type label ("Song", "Video") that search sometimes prepends.
  if (texts.length > 1 && /^(Song|Video)$/i.test(texts[0])) {
    texts.shift();
    subtitleRuns.shift();
  }

  // An album name is the trailing run that links to an album page.
  let album: string | undefined;
  const lastRun = subtitleRuns[subtitleRuns.length - 1];
  const lastPageType =
    lastRun?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType;
  if (lastPageType === 'MUSIC_PAGE_TYPE_ALBUM' && texts.length > 1) {
    album = texts.pop();
    subtitleRuns.pop();
  }

  // Everything that links to an artist page is an artist; otherwise take the
  // first remaining run so we always show something.
  const artistRuns = subtitleRuns.filter(
    (r) =>
      r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST'
  );
  const artistNames = (artistRuns.length ? artistRuns : subtitleRuns.slice(0, 1))
    .map((r) => String(r.text))
    .filter(Boolean);

  const artistName = artistNames.join(', ') || 'Unknown artist';
  const artistId =
    artistRuns[0]?.navigationEndpoint?.browseEndpoint?.browseId ??
    `yt-artist:${artistName}`;

  const videoType =
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs
      ?.watchEndpointMusicConfig?.musicVideoType ??
    flexColumn(item, 0)?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint
      ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;

  const explicit = (item?.badges ?? []).some(
    (b: Any) => b?.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE'
  );

  return {
    id: trackKey('youtube', sourceId),
    title,
    artist: { id: String(artistId), name: artistName },
    albumImageUrl: pickThumbnail(item),
    duration,
    provider: 'youtube',
    sourceId,
    album,
    explicit,
    isVideo: videoType ? videoType !== 'MUSIC_VIDEO_TYPE_ATV' : undefined,
  };
}

export function parseAlbumItem(item: Any): Album | null {
  const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId;
  const title = runsText(flexColumn(item, 0));
  if (!browseId || !title) return null;

  const texts = runs(flexColumn(item, 1))
    .map((r) => String(r?.text ?? '').trim())
    .filter((t) => t && t !== '•');

  // "Album - Daft Punk - 2013"
  const year = texts.find((t) => /^\d{4}$/.test(t));
  const artist =
    texts.filter((t) => !/^\d{4}$/.test(t) && !/^(Album|EP|Single)$/i.test(t))[0] ??
    'Unknown artist';

  return {
    id: `youtube:album:${browseId}`,
    provider: 'youtube',
    browseId,
    title,
    artist,
    coverImageUrl: pickThumbnail(item, 400),
    year,
  };
}

export function parseArtistItem(item: Any): ArtistResult | null {
  const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId;
  const name = runsText(flexColumn(item, 0));
  if (!browseId || !name) return null;

  const subtitle = runs(flexColumn(item, 1))
    .map((r) => String(r?.text ?? '').trim())
    .filter((t) => t && t !== '•')
    .filter((t) => !/^Artist$/i.test(t))
    .join(' • ');

  return {
    id: `youtube:artist:${browseId}`,
    provider: 'youtube',
    browseId,
    name,
    imageUrl: pickThumbnail(item, 400),
    subtitle: subtitle || undefined,
  };
}

export function parsePlaylistItem(item: Any): RemotePlaylist | null {
  const rawId = item?.navigationEndpoint?.browseEndpoint?.browseId;
  const name = runsText(flexColumn(item, 0));
  if (!rawId || !name) return null;

  const texts = runs(flexColumn(item, 1))
    .map((r) => String(r?.text ?? '').trim())
    .filter((t) => t && t !== '•');

  const countText = texts.find((t) => /\d+\s*(songs?|tracks?|views?)/i.test(t));
  const creator =
    texts.filter((t) => !/^Playlist$/i.test(t) && t !== countText)[0] ?? 'YouTube Music';

  return {
    id: `youtube:playlist:${normalizePlaylistBrowseId(rawId)}`,
    provider: 'youtube',
    browseId: normalizePlaylistBrowseId(rawId),
    name,
    description: '',
    creator,
    coverImageUrl: pickThumbnail(item, 400),
    trackCount: countText ? parseInt(countText, 10) || undefined : undefined,
  };
}

/** Walk an arbitrary renderer subtree collecting every shelf and its items. */
export function collectShelfItems(node: Any): { shelfTitle: string; items: Any[] }[] {
  const shelves: { shelfTitle: string; items: Any[] }[] = [];

  const visit = (n: Any) => {
    if (!n || typeof n !== 'object') return;

    const shelf = n.musicShelfRenderer ?? n.musicPlaylistShelfRenderer;
    if (shelf) {
      const items = (shelf.contents ?? [])
        .map((c: Any) => c?.musicResponsiveListItemRenderer)
        .filter(Boolean);
      if (items.length) {
        shelves.push({ shelfTitle: runsText(shelf.title), items });
      }
    }

    const carousel = n.musicCarouselShelfRenderer;
    if (carousel) {
      const items = (carousel.contents ?? [])
        .map((c: Any) => c?.musicResponsiveListItemRenderer ?? c?.musicTwoRowItemRenderer)
        .filter(Boolean);
      if (items.length) {
        shelves.push({
          shelfTitle: runsText(
            carousel?.header?.musicCarouselShelfBasicHeaderRenderer?.title
          ),
          items,
        });
      }
    }

    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value as Any);
    }
  };

  visit(node);
  return shelves;
}

export type ItemKind = 'track' | 'artist' | 'album' | 'playlist';

/**
 * Classify one search item from its own navigation endpoint.
 *
 * Shelf titles are unreliable -- YouTube has already moved unfiltered results
 * from titled `musicShelfRenderer`s into untitled `itemSectionRenderer`s. The
 * endpoint an item links to, however, says exactly what the item is.
 */
export function classifyItem(item: Any): ItemKind | null {
  if (!item) return null;

  const browse = item?.navigationEndpoint?.browseEndpoint;
  const browseId: string | undefined = browse?.browseId;
  const pageType =
    browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
      ?.pageType;

  // Check collection endpoints first: an album row also carries a play button,
  // so testing for a videoId up front would misread it as a track.
  switch (pageType) {
    case 'MUSIC_PAGE_TYPE_ARTIST':
    case 'MUSIC_PAGE_TYPE_USER_CHANNEL':
      return 'artist';
    case 'MUSIC_PAGE_TYPE_ALBUM':
      return 'album';
    case 'MUSIC_PAGE_TYPE_PLAYLIST':
      return 'playlist';
  }

  // Fall back to the shape of the id itself.
  if (browseId?.startsWith('MPRE')) return 'album';
  if (/^(VL)?(PL|OL|RD)/.test(browseId ?? '')) return 'playlist';
  if (browseId?.startsWith('UC')) return 'artist';

  // Anything left that can be watched is a track.
  if (videoIdOf(item)) return 'track';

  return null;
}

/**
 * Every search item in a response, regardless of which container renderer
 * happens to hold it, plus the "Top result" card.
 */
export function collectSearchItems(node: Any): Any[] {
  const items: Any[] = [];
  const seen = new Set<Any>();

  const push = (item: Any) => {
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  };

  const visit = (n: Any) => {
    if (!n || typeof n !== 'object') return;

    if (n.musicResponsiveListItemRenderer) push(n.musicResponsiveListItemRenderer);

    // The "Top result" card carries its target on `onTap`/`title`, so give it
    // the same shape the list-item parser expects.
    const card = n.musicCardShelfRenderer;
    if (card) {
      push({
        thumbnail: card.thumbnail,
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: card.title } },
          { musicResponsiveListItemFlexColumnRenderer: { text: card.subtitle } },
        ],
        navigationEndpoint: card.onTap,
        overlay: card.thumbnailOverlay,
      });
    }

    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value as Any);
    }
  };

  visit(node);
  return items;
}

/** Header of a playlist/album browse page. */
export function parseBrowseHeader(response: Any): {
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
} | null {
  const find = (n: Any): Any | undefined => {
    if (!n || typeof n !== 'object') return undefined;
    if (n.musicResponsiveHeaderRenderer) return n.musicResponsiveHeaderRenderer;
    if (n.musicDetailHeaderRenderer) return n.musicDetailHeaderRenderer;
    for (const v of Object.values(n)) {
      const hit = find(v as Any);
      if (hit) return hit;
    }
    return undefined;
  };

  const header = find(response?.header) ?? find(response?.contents);
  if (!header) return null;

  const strapline = runsText(header.straplineTextOne);
  const subtitleTexts = runs(header.subtitle)
    .map((r) => String(r?.text ?? '').trim())
    .filter((t) => t && t !== '•');

  return {
    name: runsText(header.title) || 'Playlist',
    description:
      runsText(header.description?.musicDescriptionShelfRenderer?.description) || '',
    creator:
      strapline ||
      subtitleTexts.find(
        (t) => !/^(Playlist|Album|EP|Single)$/i.test(t) && !/^\d{4}$/.test(t)
      ) ||
      'YouTube Music',
    coverImageUrl: pickThumbnail(header, 544),
  };
}

/** Find the continuation token used for lazy "load more". */
export function findContinuation(node: Any): string | undefined {
  let token: string | undefined;

  const visit = (n: Any) => {
    if (!n || typeof n !== 'object' || token) return;

    const t =
      n?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ??
      n?.nextContinuationData?.continuation;
    if (t) {
      token = String(t);
      return;
    }

    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v as Any);
    }
  };

  visit(node);
  return token;
}
