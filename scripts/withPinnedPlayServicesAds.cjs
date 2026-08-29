/**
 * Expo SDK 54 compiles Android with Kotlin 2.1.x (can read metadata up to 2.2).
 * react-native-google-mobile-ads 16.5 defaults to play-services-ads 25.4.0
 * (Kotlin 2.3 metadata → compileReleaseKotlin fails) and needs
 * AgeRestrictedTreatment (added in 25.3.0). Pin 25.3.0 to satisfy both.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const ADS_VERSION = '25.3.0';
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
