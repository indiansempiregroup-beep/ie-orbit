import React, { useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { layout } from '../theme/layout';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

const CARD_GAP = spacing.md;

export function resolveCarouselCardWidth(pageWidth: number, windowWidth: number, scrollable: boolean): number {
  const available = pageWidth || Math.max(windowWidth - spacing.xl * 2, 0);
  const capped = Math.min(available, layout.homeCarouselCardMaxWidth);
  return scrollable ? Math.max(capped - CARD_GAP, 0) : capped;
}

type Props = {
  title: string;
  count: number;
  loading: boolean;
  onSeeAll?: () => void;
  emptyState?: React.ReactNode;
  hideHeader?: boolean;
  hidePanelMargin?: boolean;
  getItemKey: (index: number) => string;
  renderItem: (index: number, activeIndex: number) => React.ReactNode;
};

export function HorizontalCarouselPanel({
  title,
  count,
  loading,
  onSeeAll,
  emptyState,
  hideHeader = false,
  hidePanelMargin = false,
  getItemKey,
  renderItem,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const scrollable = count > 1;
  const [pageWidth, setPageWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardWidth = resolveCarouselCardWidth(pageWidth, windowWidth, scrollable);
  const snapStride = cardWidth + CARD_GAP;

  function onCarouselScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!snapStride) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / snapStride);
    setActiveIndex(Math.min(Math.max(index, 0), count - 1));
  }

  if (!loading && count === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <View style={[styles.panel, hidePanelMargin && styles.panelFlush]}>
      {!hideHeader ? (
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          {count > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          ) : null}
          <View style={styles.headerSpacer} />
          {count > 0 && onSeeAll ? (
            <Pressable onPress={onSeeAll} hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading && count === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View
          style={styles.carouselHost}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0 && width !== pageWidth) setPageWidth(width);
          }}
        >
          {!scrollable ? (
            <View
              style={[
                styles.singleCard,
                cardWidth > 0
                  ? { width: cardWidth, maxWidth: layout.homeCarouselCardMaxWidth }
                  : styles.singleCardFallback,
              ]}
            >
              {renderItem(0, 0)}
            </View>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              scrollEnabled
              pagingEnabled={false}
              snapToInterval={snapStride > 0 ? snapStride : undefined}
              snapToAlignment="start"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={Platform.OS === 'web'}
              keyboardShouldPersistTaps="handled"
              decelerationRate="fast"
              onScroll={onCarouselScroll}
              scrollEventThrottle={16}
              style={styles.carousel}
              contentContainerStyle={styles.carouselContent}
            >
              {Array.from({ length: count }, (_, index) => (
                <View
                  key={getItemKey(index)}
                  style={[
                    styles.carouselItem,
                    cardWidth > 0 ? { width: cardWidth } : styles.carouselItemFallback,
                    index < count - 1 ? styles.carouselItemGap : null,
                  ]}
                >
                  {renderItem(index, activeIndex)}
                </View>
              ))}
            </ScrollView>
          )}

          {scrollable ? (
            <View style={styles.footer}>
              <View style={styles.dots}>
                {Array.from({ length: count }, (_, index) => (
                  <View key={getItemKey(index)} style={[styles.dot, index === activeIndex && styles.dotActive]} />
                ))}
              </View>
              <Text style={styles.scrollHint}>
                Swipe for more · {activeIndex + 1}/{count}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  panelFlush: {
    marginTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  headerSpacer: { flex: 1 },
  seeAll: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  carouselHost: {
    alignItems: 'flex-start',
    width: '100%',
  },
  singleCard: {
    maxWidth: layout.homeCarouselCardMaxWidth,
    width: '100%',
    alignSelf: 'flex-start',
  },
  singleCardFallback: {
    maxWidth: layout.homeCarouselCardMaxWidth,
    width: '100%',
    alignSelf: 'flex-start',
  },
  carousel: {
    width: '100%',
    overflow: 'visible',
  },
  carouselContent: {
    alignItems: 'stretch',
  },
  carouselItem: {
    flexShrink: 0,
    maxWidth: layout.homeCarouselCardMaxWidth,
  },
  carouselItemFallback: {
    width: layout.homeCarouselCardMaxWidth,
    maxWidth: layout.homeCarouselCardMaxWidth,
  },
  carouselItemGap: {
    marginRight: CARD_GAP,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.primary,
  },
  scrollHint: {
    ...typography.tiny,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
});
