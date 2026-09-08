import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { brand, colors, fonts, spacing } from '../theme/tokens';

type Props = {
  onFinished: () => void;
  /** Hold the brand moment before entering the app. */
  durationMs?: number;
};

export function BrandSplash({ onFinished, durationMs = 3000 }: Props) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const copyTranslate = useRef(new Animated.Value(14)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const intro = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(copyOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(copyTranslate, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    intro.start();
    pulseLoop.start();

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
      intro.stop();
      pulseLoop.stop();
    };
  }, [copyOpacity, copyTranslate, durationMs, logoOpacity, logoScale, onFinished, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.05] });

  return (
    <LinearGradient
      colors={['#FFFFFF', '#E4EEF1', '#D0E3E9']}
      style={styles.root}
    >
      <Animated.View
        style={[
          styles.ring,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      <View style={styles.mark}>
        <Animated.Image
          source={require('../../assets/ie-orbit-logo.png')}
          style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
          accessibilityLabel="IE Orbit logo"
        />
        <Animated.View
          style={[
            styles.copy,
            { opacity: copyOpacity, transform: [{ translateY: copyTranslate }] },
          ]}
        >
          <Text style={styles.title}>{brand.appName}</Text>
          <Text style={styles.tagline}>{brand.tagline}</Text>
        </Animated.View>
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
  ring: {
    position: 'absolute',
    width: 224,
    height: 224,
    borderRadius: 112,
    borderWidth: 2,
    borderColor: brand.accent,
  },
  logo: { width: 176, height: 138, marginBottom: spacing.md },
  copy: { alignItems: 'center', gap: spacing.sm },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: brand.primary,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 24,
  },
});
