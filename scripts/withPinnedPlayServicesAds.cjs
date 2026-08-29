/**
 * Expo SDK 54 compiles Android with Kotlin 2.1.x.
 * react-native-google-mobile-ads 16.5 pulls play-services-ads 25.4.0, which
 * ships Kotlin 2.3 metadata and fails :compileReleaseKotlin on EAS.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const ADS_VERSION = '24.7.0';
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
