import { registerWebModule, NativeModule } from 'expo';

import { NativeStreamResult, PlatformInfo } from './NoteNative.types';

class NoteNativeModule extends NativeModule<{}> {
  getPlatformInfo(): PlatformInfo {
    return { platform: 'web', native: false };
  }

  /** There is no extractor on web; callers fall through to the next source. */
  async resolveYouTubeStream(): Promise<NativeStreamResult> {
    return {
      ok: false,
      reason: 'module_unavailable',
      message: 'Native stream resolution is not available on web',
    };
  }
}

export default registerWebModule(NoteNativeModule, 'NoteNativeModule');
