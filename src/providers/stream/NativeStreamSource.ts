import { Platform } from 'react-native';
import {
  NativeStreamFailureReason,
  resolveYouTubeStream,
} from '../../../modules/note-native';
import { AppError, appError, appErrorWithMessage } from '../../core/errors';
import { ResolvedStream, Track } from '../../core/types';
import { StreamSource } from './StreamResolver';

/**
 * Resolves playable audio on-device using the native NewPipe Extractor.
 *
 * This is the Android-native half of the provider chain. It implements the same
 * StreamSource contract as every other source, so nothing above it -- not
 * MusicService, not the YouTube resolver, not the PlaybackEngine -- changes.
 * When it cannot resolve, the chain simply falls through to the configured
 * endpoints as before.
 */

/**
 * Mirrors NoteNativeDownloader.USER_AGENT.
 *
 * The native module reports the User-Agent it extracted with, and that is
 * the authoritative value. This fallback covers binaries built before that
 * field existed, so playback does not 403 on an older APK.
 */
const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** How long a resolved URL is trusted before we re-resolve it. */
const STREAM_TTL = 4 * 60 * 60 * 1000; // 4h

/**
 * Google's stream URLs carry their own expiry in an `expire` query parameter.
 * Honouring it avoids handing the player a URL that 403s mid-track.
 */
function expiryFor(url: string): number {
  const fallback = Date.now() + STREAM_TTL;

  const match = /[?&]expire=(\d+)/.exec(url);
  if (!match) return fallback;

  const epochSeconds = Number(match[1]);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return fallback;

  // Re-resolve a minute early rather than racing the expiry.
  const expiresAt = epochSeconds * 1000 - 60_000;
  return expiresAt > Date.now() ? Math.min(expiresAt, fallback) : fallback;
}

/** Map the native failure taxonomy onto NØTE's existing AppError kinds. */
function toAppErrorFor(reason: NativeStreamFailureReason, message: string): AppError {
  switch (reason) {
    case 'geo_restricted':
      return appError('region_restricted', message);

    case 'private_content':
    case 'unavailable':
    case 'age_restricted':
    case 'paid_content':
    case 'sign_in_required':
      return appError('track_unavailable', message);

    case 'live_stream':
      return appErrorWithMessage(
        'source_unavailable',
        "Live streams can't be played yet.",
        message
      );

    case 'rate_limited':
      return appError('rate_limited', message);

    case 'network':
      return appError('network', message);

    case 'no_audio_stream':
    case 'unsupported':
    case 'extraction_failed':
    case 'invalid_id':
    case 'module_unavailable':
    case 'unknown':
    default:
      return appError('source_unavailable', message);
  }
}

export class NativeStreamSource implements StreamSource {
  readonly id = 'native-newpipe';

  canHandle(track: Track): boolean {
    // Android-only: the extractor lives in the Kotlin module.
    return Platform.OS === 'android' && track.provider === 'youtube' && !!track.sourceId;
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (signal?.aborted) throw appError('timeout');

    const result = await resolveYouTubeStream(track.sourceId);

    // The caller may have moved on while extraction was running.
    if (signal?.aborted) throw appError('timeout');

    if (!result.ok) {
      if (__DEV__) {
        console.log(
          `[NativeStreamSource] ${track.sourceId} failed:`,
          result.reason,
          result.message,
          result.exception ?? ''
        );
      }
      throw toAppErrorFor(result.reason, result.message);
    }

    if (__DEV__) {
      // Deliberately omits the URL -- stream URLs are credentials.
      console.log('[NativeStreamSource] resolved', {
        sourceId: track.sourceId,
        title: result.title,
        mimeType: result.mimeType,
        bitrate: result.bitrate,
        durationSeconds: result.durationSeconds,
        extractor: result.extractor,
      });
    }

    return {
      url: result.url,
      mimeType: result.mimeType,
      bitrate: result.bitrate,
      expiresAt: expiryFor(result.url),
      resolvedBy: this.id,
      // Replay the extractor’s User-Agent when fetching, or googlevideo 403s.
      headers: { 'User-Agent': result.userAgent ?? FALLBACK_USER_AGENT },
    };
  }
}
