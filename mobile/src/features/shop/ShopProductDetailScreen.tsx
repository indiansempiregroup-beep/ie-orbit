import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShopProduct, ShopProductReview } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { HtmlContent } from '../../components/HtmlContent';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateTime, getApiErrorMessage } from '../../utils/format';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { useCart } from './CartContext';
import { QtyStepper } from './QtyStepper';
import { StarRating } from './StarRating';
import { formatShopMoney, isOutOfStock, shopCategoryKey, shopCategoryLabel, stockLabel } from './shopHelpers';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopProductDetail'>;
type ReviewSort = 'recent' | 'top';

export function ShopProductDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { addItem, itemCount, quantityFor } = useCart();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [reviewSort, setReviewSort] = useState<ReviewSort>('recent');
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    try {
      const response = await mobileClient.mobile.getShopProduct(route.params.productId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setProduct(response.data);
      setError(null);
      if (response.data.my_review) {
        setRating(response.data.my_review.rating);
        setTitle(response.data.my_review.title || '');
        setComment(response.data.my_review.comment || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not found');
    }
  }, [businessCode, route.params.productId, tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const cartBtn = (
    <Pressable onPress={() => navigation.navigate('Cart')} hitSlop={8} accessibilityLabel="Cart">
      <Feather name="shopping-cart" size={20} color={colors.foreground} />
      {itemCount > 0 ? (
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  if (!product && !error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Product" onBack={() => navigation.goBack()} right={cartBtn} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Product" onBack={() => navigation.goBack()} right={cartBtn} />
        <Text style={[styles.error, { padding: spacing.lg }]}>{error}</Text>
      </View>
    );
  }

  const outOfStock = isOutOfStock(product);
  const inCart = quantityFor(product.id);
  const imageUri = resolveMediaUrl(product.image_url);
  const stock = stockLabel(product);
  const maxQty = product.stock_on_hand != null ? Math.max(1, Number(product.stock_on_hand)) : undefined;
  const reviews = product.reviews ?? [];
  const ratingCount = product.rating_count ?? reviews.length;
  const ratingAvg = product.rating_avg ?? 0;
  const breakdown = product.rating_breakdown ?? {};
  const facts = [
    product.brand ? { label: 'Brand', value: product.brand } : null,
    shopCategoryKey(product.category) ? { label: 'Category', value: shopCategoryLabel(product.category) } : null,
    product.pack_size ? { label: 'Pack size', value: product.pack_size } : null,
    product.sku ? { label: 'SKU', value: product.sku } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const visibleReviews = reviews
    .filter((item) => item.id !== product.my_review?.id)
    .filter((item) => (starFilter ? item.rating === starFilter : true))
    .slice()
    .sort((a, b) => (reviewSort === 'top' ? b.rating - a.rating : 0));

  function addToCart(goToCart = false) {
    if (!product || outOfStock) return;
    addItem(product, qty);
    setAdded(true);
    if (goToCart) navigation.navigate('Cart');
  }

  async function submitReview(update = Boolean(product?.my_review)) {
    if (!product) return;
    setSubmittingReview(true);
    try {
      const body = {
        tenant_slug: tenantSlug,
        business_code: businessCode,
        rating,
        title: title.trim(),
        comment: comment.trim(),
      };
      if (update) await mobileClient.mobile.updateShopProductReview(product.id, body);
      else await mobileClient.mobile.createShopProductReview(product.id, body);
      await load();
    } catch (err) {
      Alert.alert('Unable to submit review', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={product.name} onBack={() => navigation.goBack()} right={cartBtn} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Feather name="package" size={40} color={colors.mutedForeground} />
          </View>
        )}

        <View style={styles.body}>
          {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}
          <Text style={styles.title}>{product.name}</Text>
          <View style={styles.ratingLink}>
            <StarRating rating={ratingAvg} size={16} />
            {ratingCount ? (
              <Text style={[styles.ratingText, { color: primary }]}>
                {ratingAvg.toFixed(1)} out of 5 · {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
              </Text>
            ) : (
              <Text style={styles.ratingText}>No ratings yet</Text>
            )}
          </View>
          <Text style={[styles.price, { color: primary }]}>{formatShopMoney(product.price, product.currency)}</Text>
          {stock ? (
            <View style={[styles.stockPill, outOfStock ? styles.stockPillOut : styles.stockPillIn]}>
              <Text style={[styles.stockPillText, outOfStock ? styles.stockOut : styles.stockIn]}>{stock}</Text>
            </View>
          ) : null}
          {inCart > 0 ? <Text style={styles.inCartHint}>{inCart} already in cart</Text> : null}
        </View>

        {facts.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product information</Text>
            {facts.map((item) => (
              <View key={item.label} style={styles.factRow}>
                <Text style={styles.factLabel}>{item.label}</Text>
                <Text style={styles.factValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {product.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this item</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        ) : null}

        {product.details_html ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product details</Text>
            <HtmlContent html={product.details_html} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer reviews</Text>
          {ratingCount ? (
            <View style={styles.reviewSummary}>
              <View>
                <Text style={styles.reviewAvg}>{ratingAvg.toFixed(1)}</Text>
                <StarRating rating={ratingAvg} size={18} />
                <Text style={styles.meta}>{ratingCount} global {ratingCount === 1 ? 'rating' : 'ratings'}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = Number(breakdown[String(star)] || 0);
                  const pct = ratingCount ? Math.round((count / ratingCount) * 100) : 0;
                  const active = starFilter === star;
                  return (
                    <Pressable key={star} style={styles.histRow} onPress={() => setStarFilter(active ? null : star)}>
                      <Text style={[styles.histLabel, active && { color: primary }]}>{star} star</Text>
                      <View style={styles.histTrack}>
                        <View style={[styles.histFill, { width: `${pct}%`, backgroundColor: primary }]} />
                      </View>
                      <Text style={styles.histPct}>{pct}%</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.meta}>Be the first to review this product.</Text>
          )}

          <View style={styles.reviewTools}>
            <Pressable
              style={[styles.toolChip, reviewSort === 'recent' && { borderColor: primary }]}
              onPress={() => setReviewSort('recent')}
            >
              <Text style={styles.toolChipText}>Most recent</Text>
            </Pressable>
            <Pressable
              style={[styles.toolChip, reviewSort === 'top' && { borderColor: primary }]}
              onPress={() => setReviewSort('top')}
            >
              <Text style={styles.toolChipText}>Top rated</Text>
            </Pressable>
            {starFilter ? (
              <Pressable onPress={() => setStarFilter(null)}>
                <Text style={[styles.clearFilters, { color: primary }]}>Clear {starFilter}★</Text>
              </Pressable>
            ) : null}
          </View>

          {product.my_review ? (
            <Card style={styles.reviewCard}>
              <Text style={styles.reviewYou}>Your review</Text>
              <StarRating rating={product.my_review.rating} size={14} />
              {product.my_review.title ? <Text style={styles.reviewTitle}>{product.my_review.title}</Text> : null}
              {product.my_review.comment ? <Text style={styles.reviewBody}>{product.my_review.comment}</Text> : null}
            </Card>
          ) : null}

          {visibleReviews.map((item) => (
            <ReviewCard key={item.id} review={item} />
          ))}

          {product.can_review || product.my_review ? (
            <Card style={styles.writeCard}>
              <Text style={styles.writeTitle}>{product.my_review ? 'Edit your review' : 'Write a customer review'}</Text>
              {product.has_purchased ? (
                <Text style={styles.verifiedHint}>Verified purchase</Text>
              ) : (
                <Text style={styles.meta}>Reviews from verified buyers are marked after a completed order.</Text>
              )}
              <StarRating rating={rating} size={28} interactive onChange={setRating} />
              <Input label="Headline" value={title} onChangeText={setTitle} placeholder="What's most important to know?" />
              <Input
                label="Written review"
                value={comment}
                onChangeText={setComment}
                placeholder="What did you like or dislike?"
                multiline
                style={{ minHeight: 88, textAlignVertical: 'top' }}
              />
              <Button
                label={product.my_review ? 'Update review' : 'Submit review'}
                fullWidth
                loading={submittingReview}
                primaryColor={primary}
                onPress={() => void submitReview(Boolean(product.my_review))}
              />
            </Card>
          ) : !user ? (
            <Text style={styles.meta}>Sign in to write a review.</Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {added ? (
          <Pressable style={styles.addedBanner} onPress={() => navigation.navigate('Cart')}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.addedText}>Added to cart</Text>
            <Text style={[styles.viewCart, { color: primary }]}>View cart</Text>
          </Pressable>
        ) : null}
        <View style={styles.footerRow}>
          <QtyStepper value={qty} min={1} max={maxQty} onChange={setQty} primaryColor={primary} />
          <View style={styles.footerActions}>
            <Button
              label={outOfStock ? 'Out of stock' : 'Add to cart'}
              variant="outline"
              disabled={outOfStock}
              onPress={() => addToCart(false)}
              style={styles.footerBtn}
            />
            <Button
              label="Buy now"
              primaryColor={primary}
              disabled={outOfStock}
              onPress={() => addToCart(true)}
              style={styles.footerBtn}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function ReviewCard({ review }: { review: ShopProductReview }) {
  return (
    <Card style={styles.reviewCard}>
      <View style={styles.reviewHead}>
        <Text style={styles.reviewer}>{review.reviewer_name}</Text>
        <StarRating rating={review.rating} size={13} />
      </View>
      {review.verified_purchase ? <Text style={styles.verified}>Verified purchase</Text> : null}
      {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
      {review.comment ? <Text style={styles.reviewBody}>{review.comment}</Text> : null}
      {review.created_at ? <Text style={styles.reviewDate}>{formatDateTime(review.created_at)}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#111' },
  hero: { width: '100%', height: 300, backgroundColor: '#fff' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  body: { padding: spacing.xl, backgroundColor: colors.card, gap: 4 },
  brand: { ...typography.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { ...typography.heading, color: colors.foreground },
  ratingLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  ratingText: { ...typography.caption, fontWeight: '600' },
  price: { marginTop: spacing.sm, fontSize: 26, fontWeight: '800' },
  stockPill: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: spacing.sm },
  stockPillIn: { backgroundColor: '#ECFDF5' },
  stockPillOut: { backgroundColor: '#FEF2F2' },
  stockPillText: { ...typography.caption, fontWeight: '700' },
  stockIn: { color: colors.success },
  stockOut: { color: colors.destructive },
  meta: { marginTop: spacing.sm, ...typography.caption, color: colors.mutedForeground },
  inCartHint: { marginTop: spacing.sm, ...typography.caption, color: colors.mutedForeground },
  section: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: { ...typography.title, color: colors.foreground },
  description: { ...typography.body, color: colors.foreground, lineHeight: 22 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  factLabel: { ...typography.caption, color: colors.mutedForeground, width: 96 },
  factValue: { ...typography.body, color: colors.foreground, flex: 1, fontWeight: '600', textAlign: 'right' },
  reviewSummary: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  reviewAvg: { fontSize: 36, fontWeight: '800', color: colors.foreground },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histLabel: { width: 48, ...typography.caption, color: colors.mutedForeground },
  histTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' },
  histFill: { height: '100%', borderRadius: 4 },
  histPct: { width: 36, textAlign: 'right', ...typography.caption, color: colors.mutedForeground },
  reviewTools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  toolChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  toolChipText: { ...typography.caption, fontWeight: '600', color: colors.foreground },
  clearFilters: { ...typography.caption, fontWeight: '700' },
  reviewCard: { gap: spacing.sm },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewer: { ...typography.label, fontWeight: '700', color: colors.foreground },
  reviewYou: { ...typography.caption, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  reviewTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  reviewBody: { ...typography.body, color: colors.foreground, lineHeight: 20 },
  reviewDate: { ...typography.caption, color: colors.mutedForeground },
  verified: { ...typography.tiny, color: colors.success, fontWeight: '700', textTransform: 'uppercase' },
  verifiedHint: { ...typography.caption, color: colors.success, fontWeight: '700' },
  writeCard: { gap: spacing.md },
  writeTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerActions: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  footerBtn: { flex: 1 },
  addedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addedText: { ...typography.caption, color: colors.success, fontWeight: '700', flex: 1 },
  viewCart: { ...typography.caption, fontWeight: '700' },
  error: { color: colors.destructive },
});
