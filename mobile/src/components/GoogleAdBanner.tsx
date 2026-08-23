import React, { useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/tokens';

export const GOOGLE_AD_BANNER_HEIGHT = 74;

type AdsModule = typeof import('react-native-google-mobile-ads');

let initialization: Promise<unknown> | null = null;

function nativeAdsModule() {
  const modules = NativeModules as Record<string, unknown>;
  return modules.RNGoogleMobileAdsModule;
}

function loadAds(): AdsModule | null {
  const appId =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID
      : process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
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
      process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_UNIT_ID ||
      process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID
    );
  }
  return process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID;
}

export function isGoogleAdMobAvailable(): boolean {
  return loadAds() !== null;
}

export function GoogleAdBanner({ onClose }: { onClose: () => void }) {
  const ads = useMemo(loadAds, []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ads) return;
    if (!initialization) {
      initialization = ads.AdsConsent.gatherConsent()
        .catch(() => null)
        .then(() => ads.MobileAds().initialize());
    }
    let active = true;
    void initialization
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [ads]);

  if (!ads || !ready) return null;

  const unitId = __DEV__ ? ads.TestIds.BANNER : productionBannerUnitId();
  if (!unitId) return null;

  const BannerAd = ads.BannerAd;
  return (
    <View style={styles.shell}>
      <View style={styles.controls}>
        <Text style={styles.label}>Ad</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close ad for this session"
          hitSlop={10}
          onPress={onClose}
          style={styles.close}
        >
          <Feather name="x" size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.ad}>
        <BannerAd
          unitId={unitId}
          size={ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
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
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.xs,
  },
  label: {
    color: colors.mutedForeground,
    fontSize: 9,
  },
  ad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 30,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
