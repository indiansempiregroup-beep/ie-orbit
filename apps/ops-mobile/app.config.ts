import type { ConfigContext, ExpoConfig } from 'expo/config';

// Monorepo-wide env: ie-platform/.env (not apps/ops-mobile/.env)
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../../scripts/load-root-env.cjs').loadRootEnv();

const FACE_ID_USAGE =
  'Allow IE Platform to use Face ID for quick sign-in.';
const CAMERA_USAGE =
  'Allow IE Platform to use the camera for barcode scanning and profile photos.';
const PHOTOS_USAGE =
  'Allow IE Platform to access your photos for profile and business images.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'IE Platform',
  slug: 'ie-platform-ops',
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
    'expo-notifications',
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_USAGE,
        barcodeScannerEnabled: true,
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
  ],
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.ieplatform.ops',
    infoPlist: {
      ...config.ios?.infoPlist,
      NSFaceIDUsageDescription: FACE_ID_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      NSPhotoLibraryUsageDescription: PHOTOS_USAGE,
    },
  },
  android: {
    ...config.android,
    package: 'com.ieplatform.ops',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#0B1F3A',
    },
  },
  web: {
    ...config.web,
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  extra: {
    ...config.extra,
    eas: {
      ...(typeof config.extra?.eas === 'object' && config.extra.eas ? config.extra.eas : {}),
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
    },
  },
});
