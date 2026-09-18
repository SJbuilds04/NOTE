/** Result of `NoteNative.getPlatformInfo()`. */
export type PlatformInfo = {
  /** Always 'android' when served by the Kotlin module; 'web' from the web shim. */
  platform: string;
  /** True only when the call was answered by real native code. */
  native: boolean;
  /** `Build.VERSION.SDK_INT` on Android; undefined elsewhere. */
  androidSdkInt?: number;
};

/**
 * Why a native resolve failed. A closed set -- the TypeScript layer maps each
 * of these onto one of NØTE's existing AppError kinds.
 */
export type NativeStreamFailureReason =
  | 'invalid_id'
  | 'unavailable'
  | 'private_content'
  | 'geo_restricted'
  | 'age_restricted'
  | 'paid_content'
  | 'sign_in_required'
  | 'live_stream'
  | 'no_audio_stream'
  | 'unsupported'
  | 'extraction_failed'
  | 'rate_limited'
  | 'network'
  | 'module_unavailable'
  | 'unknown';

export type NativeStreamSuccess = {
  ok: true;
  /** Direct progressive audio URL. Never log this outside __DEV__. */
  url: string;
  mimeType?: string;
  bitrate?: number;
  durationSeconds?: number;
  title?: string;
  uploader?: string;
  streamType?: string;
  /** Which extractor produced this, for diagnostics. */
  extractor?: string;
  /** User-Agent the URL was extracted with; the player must reuse it. */
  userAgent?: string;
};

export type NativeStreamFailure = {
  ok: false;
  reason: NativeStreamFailureReason;
  message: string;
  /** Originating native exception class, when there was one. */
  exception?: string | null;
};

/**
 * Native resolution never throws across the bridge -- it always resolves to one
 * of these, so an extraction failure cannot take down the RN runtime.
 */
export type NativeStreamResult = NativeStreamSuccess | NativeStreamFailure;
