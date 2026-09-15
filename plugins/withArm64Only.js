const { withGradleProperties } = require('expo/config-plugins');

/**
 * Restricts the Android build to arm64-v8a.
 *
 * The default is all four ABIs (armeabi-v7a, arm64-v8a, x86, x86_64), which
 * makes every cold build compile the native C++ layer four times -- roughly
 * 25 minutes instead of 5 on this project. Every physical Android device NØTE
 * currently targets is arm64.
 *
 * TRADE-OFF: builds produced with this enabled will NOT run on x86/x86_64
 * emulators. To build for an emulator, either remove this plugin from
 * app.json, or override for a single build:
 *
 *   ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64
 *
 * This lives in a config plugin because android/gradle.properties is
 * generated -- `npx expo prebuild --clean` discards hand edits to it.
 */

const ARCHITECTURES = 'arm64-v8a';

module.exports = function withArm64Only(config) {
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
