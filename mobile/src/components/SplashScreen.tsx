import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { BrandTheme } from '../theme/brandTheme';
import { buildBrandSplashGradient } from '../theme/colorUtils';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../theme/tokens';

type SplashScreenProps = {
  branding: BrandTheme;
  businessName?: string | null;
};

export function SplashBackdrop({ branding }: { branding: BrandTheme }) {
  const primary = branding.primaryColor ?? colors.primary;
  const secondary = branding.secondaryColor ?? colors.secondaryForeground;
  const gradientColors = useMemo(
    () => buildBrandSplashGradient(primary, secondary),
    [primary, secondary],
  );

  return <LinearGradient colors={gradientColors} style={styles.backdrop} />;
}

export function SplashScreen({ branding, businessName }: SplashScreenProps) {
  const primary = branding.primaryColor ?? colors.primary;
  const secondary = branding.secondaryColor ?? colors.secondaryForeground;
  const gradientColors = useMemo(
    () => buildBrandSplashGradient(primary, secondary),
    [primary, secondary],
  );
  const logoUri = useMemo(() => resolveMediaUrl(branding.logo), [branding.logo]);
  const [logoFailed, setLogoFailed] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslate = useRef(new Animated.Value(18)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUri]);

  useEffect(() => {
    const intro = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(nameOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(nameTranslate, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    ]);
    intro.start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      intro.stop();
      loop.stop();
    };
  }, [logoOpacity, logoScale, nameOpacity, nameTranslate, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.05] });
  const title = businessName || branding.appName || 'AppointIE';
  const showLogo = Boolean(logoUri) && !logoFailed;

  return (
    <LinearGradient colors={gradientColors} style={styles.root}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: secondary, opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: 'center' }}>
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <View style={[styles.logoFallback, { backgroundColor: primary }]}>
            <Feather name="calendar" size={42} color="#fff" />
          </View>
        )}
      </Animated.View>
      <Animated.View style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }], alignItems: 'center' }}>
        <Text style={[styles.businessName, { color: primary }]}>{title}</Text>
        <Text style={styles.tagline}>Your appointments, beautifully managed</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
  },
  logo: {
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
    backgroundColor: '#ffffffcc',
  },
  logoFallback: {
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  businessName: {
    ...typography.heading,
    fontSize: 28,
    textAlign: 'center',
  },
  tagline: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
