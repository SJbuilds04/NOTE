const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Enables Android core library desugaring in the generated app module.
 *
 * NewPipe Extractor (used by modules/note-native) calls java.time APIs that
 * only exist natively from API 26. NØTE ships minSdk 24, so without the
 * desugared backport those calls would throw on Android 7.x devices.
 *
 * android/ is generated, so this has to be a config plugin rather than a hand
 * edit -- otherwise `npx expo prebuild --clean` would silently drop it.
 */

const DESUGAR_JDK_LIBS = 'com.android.tools:desugar_jdk_libs:2.1.5';

function withCompileOptions(contents) {
  if (contents.includes('coreLibraryDesugaringEnabled')) return contents;

  return contents.replace(
    /^android\s*\{/m,
    'android {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }\n'
  );
}

function withDesugarDependency(contents) {
  if (contents.includes('desugar_jdk_libs')) return contents;

  return contents.replace(
    /^dependencies\s*\{/m,
    `dependencies {\n    coreLibraryDesugaring "${DESUGAR_JDK_LIBS}"\n`
  );
}

module.exports = function withCoreLibraryDesugaring(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withCoreLibraryDesugaring: expected a groovy build.gradle, got ${cfg.modResults.language}`
      );
    }

    let contents = withCompileOptions(cfg.modResults.contents);
    contents = withDesugarDependency(contents);

    if (!contents.includes('coreLibraryDesugaringEnabled')) {
      throw new Error('withCoreLibraryDesugaring: failed to patch the android {} block');
    }
    if (!contents.includes('desugar_jdk_libs')) {
      throw new Error('withCoreLibraryDesugaring: failed to patch the dependencies {} block');
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};
