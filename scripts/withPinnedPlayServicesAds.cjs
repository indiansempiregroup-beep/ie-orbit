/**
 * Expo SDK 54 compiles Android with Kotlin 2.1.x.
 * play-services-ads 25.3+ ships Kotlin 2.3 metadata and fails compileReleaseKotlin.
 * Pair this pin with react-native-google-mobile-ads 16.3.4 (uses Ads 25.0.0 APIs).
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const ADS_VERSION = '25.0.0';
const MARKER = `play-services-ads:${ADS_VERSION}`;

function withPinnedPlayServicesAds(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) return mod;
    mod.modResults.contents = `${mod.modResults.contents.trimEnd()}

// Pin AdMob to a Kotlin 2.1-compatible Play Services Ads SDK (Expo SDK 54).
subprojects { subproject ->
  subproject.configurations.configureEach {
    resolutionStrategy.force "com.google.android.gms:${MARKER}"
  }
}
`;
    return mod;
  });
}

module.exports = withPinnedPlayServicesAds;
