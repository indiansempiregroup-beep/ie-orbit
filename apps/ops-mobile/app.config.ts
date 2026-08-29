import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Monorepo-wide env: ie-orbit/.env (not apps/ops-mobile/.env)
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../../scripts/load-root-env.cjs').loadRootEnv();

const FACE_ID_USAGE =
  'Allow IE Orbit to use Face ID for quick sign-in.';
const CAMERA_USAGE =
  'Allow IE Orbit to use the camera for barcode scanning and profile photos.';
const PHOTOS_USAGE =
  'Allow IE Orbit to access your photos for profile and business images.';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dest: googleServicesFileAbs, materializeGoogleServices } = require('./scripts/materialize-google-services.cjs');
const googleServicesFile = './credentials/google-services.json';
materializeGoogleServices();
const adMobAndroidAppId = process.env.EXPO_PUBLIC_ADMOB_OPS_ANDROID_APP_ID;
const adMobIosAppId = process.env.EXPO_PUBLIC_ADMOB_OPS_IOS_APP_ID;
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
  name: 'IE Orbit',
  slug: 'ie-orbit-ops',
  owner: 'indians-empire',
  scheme: 'ieorbitops',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#0B1F3A',
  },
  plugins: [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    'expo-font',
    [
      'expo-notifications',
      {
        defaultChannel: 'default',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_USAGE,
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Allow IE Orbit to use your location to set accurate business, office, customer, and warehouse addresses.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B1F3A',
        image: './assets/splash.png',
        resizeMode: 'cover',
      },
    ],
    ...(adMobPlugin ? [adMobPlugin] : []),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../scripts/withPinnedPlayServicesAds.cjs'),
  ],
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.ieorbit.ops',
    infoPlist: {
      ...config.ios?.infoPlist,
      NSFaceIDUsageDescription: FACE_ID_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      NSPhotoLibraryUsageDescription: PHOTOS_USAGE,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    ...config.android,
    package: 'com.ieorbit.ops',
    ...(fs.existsSync(googleServicesFileAbs) ? { googleServicesFile } : {}),
    softwareKeyboardLayoutMode: 'resize',
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
          process.env.GOOGLE_PLACES_API_KEY ||
          '',
      },
    },
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#0B1F3A',
    },
    // Allow http:// LAN API calls from Android builds / Expo Go.
    ...({ usesCleartextTraffic: true } as object),
  },
  web: {
    ...config.web,
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  extra: {
    ...config.extra,
    googleMapsApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      '',
    googleOAuth: {
      clientId:
        process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
        process.env.GOOGLE_OAUTH_CLIENT_ID ||
        '',
      iosClientId:
        process.env.EXPO_PUBLIC_GOOGLE_OAUTH_OPS_IOS_CLIENT_ID ||
        process.env.GOOGLE_OAUTH_OPS_IOS_CLIENT_ID ||
        '',
      androidClientId:
        process.env.EXPO_PUBLIC_GOOGLE_OAUTH_OPS_ANDROID_CLIENT_ID ||
        process.env.GOOGLE_OAUTH_OPS_ANDROID_CLIENT_ID ||
        '',
    },
    eas: {
      ...(typeof config.extra?.eas === 'object' && config.extra.eas ? config.extra.eas : {}),
      projectId:
        (process.env.EXPO_PUBLIC_OPS_EAS_PROJECT_ID || '').trim() ||
        'b897b310-e21b-49ab-b58f-56b8da1867f3',
    },
  },
});
