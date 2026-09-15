import { NativeModule, requireOptionalNativeModule } from 'expo';

import { NativeStreamResult, PlatformInfo } from './NoteNative.types';

declare class NoteNativeModule extends NativeModule<{}> {
  getPlatformInfo(): PlatformInfo;
  resolveYouTubeStream(videoId: string): Promise<NativeStreamResult>;
}

/**
 * Null when the native module is not in the running binary -- Expo Go, or a
 * development build made before this module existed. Callers must handle that,
 * which is why `index.ts` exposes the guarded helpers instead.
 */
export default requireOptionalNativeModule<NoteNativeModule>('NoteNative');
