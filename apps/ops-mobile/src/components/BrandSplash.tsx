import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { brand, colors, fonts, radius, spacing } from '../theme/tokens';

type Props = {
  onFinished: () => void;
  /** Hold the brand moment before entering the app. */
  durationMs?: number;
};

export function BrandSplash({ onFinished, durationMs = 2800 }: Props) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Native splash may already be hidden in Expo Go.
      }
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      if (!cancelled) onFinished();
    })();
    return () => {
      cancelled = true;
    };
  }, [durationMs, onFinished]);

  return (
    <LinearGradient
      colors={[brand.primary, brand.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={styles.mark}>
        <View style={styles.iconWrap}>
          <Feather name="briefcase" size={36} color="#fff" />
        </View>
        <Text style={styles.title}>{brand.appName}</Text>
        <View style={styles.rule} />
        <Text style={styles.tagline}>{brand.tagline}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  mark: { alignItems: 'center', gap: spacing.lg },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.primaryForeground,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  rule: {
    width: 48,
    height: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 24,
  },
});
