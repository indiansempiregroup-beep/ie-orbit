import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Monorepo-wide env: ie-orbit/.env (not mobile/.env)
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../scripts/load-root-env.cjs').loadRootEnv();

type FlavorManifestEntry = {
  key: string;
  appName: string;
  appSlug: string;
  bundleIdIos: string;
  bundleIdAndroid: string;
  tenantSlug: string;
  businessCode: string;
  primaryColor: string;
  secondaryColor: string;
};

type FlavorManifest = {
  flavors: FlavorManifestEntry[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('./flavors/manifest.json') as FlavorManifest;

const flavorKey = process.env.EXPO_PUBLIC_FLAVOR_KEY ?? 'dev';
const selectedFlavor = manifest.flavors.find((entry) => entry.key === flavorKey);
const appName = process.env.EXPO_PUBLIC_APP_NAME ?? selectedFlavor?.appName ?? 'IE Orbit Mobile';
const appSlug = process.env.EXPO_PUBLIC_APP_SLUG ?? selectedFlavor?.appSlug ?? 'ie-orbit-mobile';
const referralLinkBaseUrl = process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL ?? '';
let referralHost = '';
try {
  referralHost = referralLinkBaseUrl ? new URL(referralLinkBaseUrl).host : '';
} catch {
  referralHost = '';
}

const FACE_ID_USAGE = 'Allow $(PRODUCT_NAME) to use Face ID for quick sign-in.';
const androidPackage = selectedFlavor?.bundleIdAndroid ?? 'com.ieorbit.mobile.dev';
const googleServicesFile = `./credentials/google-services/${androidPackage}.json`;
const googleServicesFileAbs = path.join(__dirname, 'credentials', 'google-services', `${androidPackage}.json`);
const adMobAndroidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const adMobIosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;
const adMobPlugin: NonNullable<ExpoConfig['plugins']>[number] | null =
  adMobAndroidAppId && adMobIosAppId
    ? [
        'react-native-google-mobile-ads',
        {
          androidAppId: adMobAndroidAppId,
          iosAppId: adMobIosAppId,
          delayAppMeasurementInit: true,
          userTrackingUsageDescription:
            'This identifier is used to deliver more relevant ads and measure ad performance.',
        },
      ]
    : null;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: appSlug,
  owner: 'indians-empire',
  scheme: appSlug,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: selectedFlavor?.bundleIdIos ?? 'com.ieorbit.mobile.dev',
    associatedDomains: referralHost ? [`applinks:${referralHost}`] : undefined,
    infoPlist: {
      ...config.ios?.infoPlist,
      NSFaceIDUsageDescription: FACE_ID_USAGE,
    },
  },
  android: {
    package: androidPackage,
    ...(fs.existsSync(googleServicesFileAbs) ? { googleServicesFile } : {}),
    softwareKeyboardLayoutMode: 'resize',
    intentFilters: referralHost
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: referralHost, pathPrefix: '/invite' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : undefined,
    config: {
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
          process.env.GOOGLE_PLACES_API_KEY ||
          '',
      },
    },
  },
  extra: {
    flavorKey,
    tenantSlug: selectedFlavor?.tenantSlug,
    businessCode: selectedFlavor?.businessCode,
    googleOAuth: {
      clientId:
        process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
        process.env.GOOGLE_OAUTH_CLIENT_ID ||
        '',
    },
    eas: {
      projectId:
        (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '').trim() ||
        'd3605998-b92a-497d-a72f-8028df3ca64d',
    },
  },
  plugins: [
    [
      'expo-local-authentication',
      {
        faceIDPermission: FACE_ID_USAGE,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Allow $(PRODUCT_NAME) to access your location to set your delivery address.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow $(PRODUCT_NAME) to access your photos for your profile picture.',
        cameraPermission: 'Allow $(PRODUCT_NAME) to use the camera for your profile picture.',
      },
    ],
    [
      'expo-notifications',
      {
        defaultChannel: 'default',
      },
    ],
    ...(adMobPlugin ? [adMobPlugin] : []),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../scripts/withPinnedPlayServicesAds.cjs'),
  ],
  assetBundlePatterns: ['**/*'],
});
