const { withGradleProperties } = require('expo/config-plugins');

/**
 * Pins the Android ABIs the app is built for.
 *
 * All four are listed so a release APK installs on any Android phone, plus
 * x86/x86_64 emulators. This makes a cold build considerably slower, because
 * the native C++ layer is compiled once per ABI.
 *
 * For a faster development loop, narrow this to the device you actually test
 * on ('arm64-v8a' covers every modern physical phone), or override per build:
 *
 *   ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
 *
 * This lives in a config plugin because android/gradle.properties is
 * generated --  discards hand edits to it.
 */

const ARCHITECTURES = 'armeabi-v7a,arm64-v8a,x86,x86_64';

module.exports = function withAndroidAbis(config) {
  return withGradleProperties(config, (cfg) => {
    const properties = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures')
    );

    properties.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: ARCHITECTURES,
    });

    cfg.modResults = properties;
    return cfg;
  });
};
