const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');

/**
 * Signs release builds with NØTE's own keystore instead of the debug key.
 *
 * The Expo template points the release buildType at signingConfigs.debug and
 * says so in a comment. A debug-signed APK installs fine, but the debug key is
 * a well-known shared secret, so anyone could publish an "update" over it.
 *
 * Credentials are read from credentials/keystore.json, which is gitignored
 * along with the keystore itself -- nothing secret is committed. If that file
 * is absent the plugin leaves the project untouched, so a fresh clone still
 * builds (debug-signed) without any setup.
 *
 * This is a config plugin because android/ is generated and
 * `npx expo prebuild --clean` would discard a hand edit.
 */

const CREDENTIALS = 'credentials/keystore.json';

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, CREDENTIALS);
  if (!fs.existsSync(file)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed.keystorePath || !parsed.keyAlias) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Copy the keystore next to build.gradle, where Gradle's file() resolves it. */
function withKeystoreCopied(config, credentials) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const from = path.join(cfg.modRequest.projectRoot, credentials.keystorePath);
      const to = path.join(cfg.modRequest.platformProjectRoot, 'app', 'release.keystore');

      if (fs.existsSync(from)) {
        fs.copyFileSync(from, to);
      } else {
        throw new Error(
          `withReleaseSigning: keystore not found at ${credentials.keystorePath}`
        );
      }
      return cfg;
    },
  ]);
}

function withSigningConfig(config, credentials) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes('release.keystore')) return cfg; // already applied

    // Add a release signing config beside the template's debug one.
    const debugBlock = [
      '        debug {',
      "            storeFile file('debug.keystore')",
      "            storePassword 'android'",
      "            keyAlias 'androiddebugkey'",
      "            keyPassword 'android'",
      '        }',
    ].join('\n');

    if (!contents.includes(debugBlock)) {
      throw new Error('withReleaseSigning: could not find the debug signingConfig');
    }

    contents = contents.replace(
      debugBlock,
      [
        debugBlock,
        '        release {',
        "            storeFile file('release.keystore')",
        `            storePassword '${credentials.storePassword}'`,
        `            keyAlias '${credentials.keyAlias}'`,
        `            keyPassword '${credentials.keyPassword}'`,
        '        }',
      ].join('\n')
    );

    // Point the release buildType at it.
    //
    // Anchored on the template's own caution comment rather than on
    // `release {`, because that phrase also opens the signingConfigs block
    // added just above -- matching it there silently re-signs the DEBUG build
    // with the release key and leaves release on the debug key.
    const releaseAnchor = [
      '            // Caution! In production, you need to generate your own keystore file.',
      '            // see https://reactnative.dev/docs/signed-apk-android.',
      '            signingConfig signingConfigs.debug',
    ].join('\n');

    if (!contents.includes(releaseAnchor)) {
      throw new Error('withReleaseSigning: could not find the release buildType');
    }

    contents = contents.replace(
      releaseAnchor,
      [
        '            // Signed with NØTE’s own keystore via withReleaseSigning.',
        '            signingConfig signingConfigs.release',
      ].join('\n')
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withReleaseSigning(config) {
  // Resolved lazily: config plugins run from the project root.
  const credentials = readCredentials(process.cwd());

  // No credentials checked out -> leave the debug signing in place rather than
  // failing the build for anyone who just cloned the repo.
  if (!credentials) return config;

  let next = withKeystoreCopied(config, credentials);
  next = withSigningConfig(next, credentials);
  return next;
};
