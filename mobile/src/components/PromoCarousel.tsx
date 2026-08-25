import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { ShopDashboardAd } from '@ie-orbit/sdk';
import { radius, spacing, typography } from '../theme/tokens';
import { resolveMediaUrl } from '../utils/mediaUrl';

const AUTO_MS = 4500;
const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PromoNavigate = (screen: string, params?: object) => void;

export function openPromoAd(ad: ShopDashboardAd, navigate: PromoNavigate, showShop: boolean) {
  const link = (ad.link_url || '').trim();
  if (/^https?:\/\//i.test(link)) {
    void Linking.openURL(link);
    return;
  }
  if (PRODUCT_ID.test(link)) {
    navigate('ShopProductDetail', { productId: link });
    return;
  }
  if (showShop) navigate('Shop');
}

type PromoCarouselProps = {
  ads: ShopDashboardAd[];
  playing?: boolean;
  height?: number;
  ctaLabel?: string;
  fallbackColors: [string, string];
  onPressAd: (ad: ShopDashboardAd) => void;
};

export function PromoCarousel({
  ads,
  playing = true,
  height = 210,
  ctaLabel = 'Shop now',
  fallbackColors,
  onPressAd,
}: PromoCarouselProps) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);

  const goTo = useCallback(
    (next: number, animated = true) => {
      if (!ads.length) return;
      const clamped = ((next % ads.length) + ads.length) % ads.length;
      indexRef.current = clamped;
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * width, animated });
    },
    [ads.length, width],
  );

  useEffect(() => {
    goTo(0, false);
  }, [width, ads.length, goTo]);

  useEffect(() => {
    if (!playing || ads.length < 2) return;
    const timer = setInterval(() => goTo(indexRef.current + 1), AUTO_MS);
    return () => clearInterval(timer);
  }, [playing, ads.length, goTo]);

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    indexRef.current = next;
    setIndex(next);
  }

  if (!ads.length) return null;

  return (
    <View style={[styles.wrap, { height }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {ads.map((ad) => {
          const imageUri = resolveMediaUrl(ad.image_url);
          return (
            <Pressable
              key={ad.id}
              style={{ width, height }}
              onPress={() => onPressAd(ad)}
              accessibilityRole="button"
              accessibilityLabel={ad.title}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
              ) : (
                <LinearGradient colors={fallbackColors} style={styles.image} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.78)']}
                locations={[0.2, 0.55, 1]}
                style={styles.overlay}
              >
                <Text style={styles.title} numberOfLines={2}>
                  {ad.title}
                </Text>
                {ad.body ? (
                  <Text style={styles.body} numberOfLines={2}>
                    {ad.body}
                  </Text>
                ) : null}
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>{ctaLabel}</Text>
                  <Feather name="chevron-right" size={14} color="#fff" />
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
      {ads.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {ads.map((ad, i) => (
            <View key={ad.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: '#111827', overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    gap: 4,
  },
  title: { ...typography.title, color: '#fff', fontSize: 22, lineHeight: 26 },
  body: { ...typography.caption, color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 2 },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  ctaText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  dots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 16,
    backgroundColor: '#fff',
  },
});
