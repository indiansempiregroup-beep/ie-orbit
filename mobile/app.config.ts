import type { ConfigContext, ExpoConfig } from 'expo/config';

// Monorepo-wide env: ie-platform/.env (not mobile/.env)
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
const appName = process.env.EXPO_PUBLIC_APP_NAME ?? selectedFlavor?.appName ?? 'IE Platform Mobile';
const appSlug = process.env.EXPO_PUBLIC_APP_SLUG ?? selectedFlavor?.appSlug ?? 'ie-platform-mobile';

const FACE_ID_USAGE = 'Allow $(PRODUCT_NAME) to use Face ID for quick sign-in.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: appSlug,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: selectedFlavor?.bundleIdIos ?? 'com.ieplatform.mobile.dev',
    infoPlist: {
      ...config.ios?.infoPlist,
      NSFaceIDUsageDescription: FACE_ID_USAGE,
    },
  },
  android: {
    package: selectedFlavor?.bundleIdAndroid ?? 'com.ieplatform.mobile.dev',
    softwareKeyboardLayoutMode: 'resize',
  },
  extra: {
    flavorKey,
    tenantSlug: selectedFlavor?.tenantSlug,
    businessCode: selectedFlavor?.businessCode,
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
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
    'expo-notifications',
  ],
  assetBundlePatterns: ['**/*'],
});
