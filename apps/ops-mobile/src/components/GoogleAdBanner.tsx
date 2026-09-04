import React, { useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme/tokens';

export const GOOGLE_AD_BANNER_HEIGHT = 78;

type AdsModule = typeof import('react-native-google-mobile-ads');

let initialization: Promise<unknown> | null = null;

function nativeAdsModule() {
  const modules = NativeModules as Record<string, unknown>;
  return modules.RNGoogleMobileAdsModule;
}

function loadAds(): AdsModule | null {
  const appId =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_OPS_IOS_APP_ID
      : process.env.EXPO_PUBLIC_ADMOB_OPS_ANDROID_APP_ID;
  if (Platform.OS === 'web' || !appId || !nativeAdsModule()) {
    return null;
  }
  // Expo Go does not contain this native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-google-mobile-ads') as AdsModule;
}

function productionBannerUnitId() {
  if (Platform.OS === 'ios') {
    return (
      process.env.EXPO_PUBLIC_ADMOB_OPS_IOS_BANNER_UNIT_ID ||
      process.env.EXPO_PUBLIC_ADMOB_OPS_BANNER_UNIT_ID
    );
  }
  return process.env.EXPO_PUBLIC_ADMOB_OPS_BANNER_UNIT_ID;
}

function useTestAdUnits() {
  return (
    __DEV__ ||
    process.env.EXPO_PUBLIC_ADMOB_USE_TEST_ADS === 'true' ||
    process.env.EXPO_PUBLIC_ADMOB_USE_TEST_ADS === '1'
  );
}

async function initializeAdsSdk(ads: AdsModule) {
  // UMP can hang when no form is configured or the native UI never settles.
  // Never block Mobile Ads init on consent — otherwise the slot stays empty forever.
  await Promise.race([
    ads.AdsConsent.gatherConsent().catch(() => null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2500);
    }),
  ]);
  return ads.MobileAds().initialize();
}

export function isGoogleAdMobAvailable(): boolean {
  return loadAds() !== null;
}

export function GoogleAdBanner({
  onClose,
  onRemoveAds,
}: {
  onClose: () => void;
  onRemoveAds: () => void;
}) {
  const ads = useMemo(loadAds, []);
  const preferTest = useTestAdUnits();
  const [ready, setReady] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (!ads) return;
    if (!initialization) {
      initialization = initializeAdsSdk(ads);
    }
    let active = true;
    void initialization
      .then(() => {
        if (!active) return;
        const nextUnit = preferTest ? ads.TestIds.BANNER : productionBannerUnitId() || null;
        setUnitId(nextUnit);
        setReady(true);
      })
      .catch((error) => {
        console.warn('[GoogleAdBanner] Mobile Ads init failed', error);
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [ads, preferTest]);

  if (!ads || !ready || !unitId) return null;

  const BannerAd = ads.BannerAd;
  return (
    <View style={styles.shell}>
      <View style={styles.controls}>
        <Text style={styles.label}>Ad</Text>
        <Pressable accessibilityRole="button" onPress={onRemoveAds} hitSlop={8}>
          <Text style={styles.remove}>Remove ads</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close ad for this session"
          onPress={onClose}
          hitSlop={8}
        >
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.ad}>
        <BannerAd
          unitId={unitId}
          // Fixed 320x50 fits the shell; adaptive banners often clip behind overflow:hidden.
          size={ads.BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          onAdFailedToLoad={(error) => {
            console.warn('[GoogleAdBanner] failed to load', unitId, error);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: GOOGLE_AD_BANNER_HEIGHT,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  controls: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  label: {
    marginRight: 'auto',
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 9,
  },
  remove: {
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  ad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
