import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateTime, getApiErrorMessage } from '../../utils/format';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { DeliveryTrackerMap } from './DeliveryTrackerMap';
import {
  formatShopDateTime,
  formatShopMoney,
  formatShopQty,
  shopReturnMethodLabel,
  shopReturnStatusLabel,
} from './shopHelpers';
import type { ShopReturn, ShopReturnPickupLive } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReturnDetail'>;
type ReturnLine = { name?: string; quantity?: string | number; line_total?: string | number };

function returnHeadline(item: ShopReturn) {
  const status = String(item.status || '').toLowerCase();
  const method = String(item.return_method || '').toLowerCase();
  if (status === 'completed') {
    return {
      title: 'Return complete',
      subtitle: 'The shop received your items. Collect cash at the shop or wait for the original payment to reverse.',
      icon: 'check-circle' as const,
      bg: '#ECFDF5',
      text: '#047857',
      dot: '#047857',
    };
  }
  if (status === 'rejected') {
    return {
      title: 'Return declined',
      subtitle: 'The shop did not accept this return. Contact them if you need help.',
      icon: 'x-circle' as const,
      bg: '#FEF2F2',
      text: '#B91C1C',
      dot: '#B91C1C',
    };
  }
  if (status === 'awaiting_customer') {
    const meta =
      item.metadata && typeof item.metadata === 'object'
        ? (item.metadata as {
            pickup_charge?: { fee?: string; net_refund?: string; pending_mode?: string };
          })
        : {};
    const fee = meta.pickup_charge?.fee;
    const net = meta.pickup_charge?.net_refund;
    const instant = String(meta.pickup_charge?.pending_mode || '') === 'instant';
    return {
      title: 'Accept pickup fee?',
      subtitle: fee
        ? `The shop wants ${instant ? 'an instant rider' : 'a courier'} pickup. Fee ${formatShopMoney(fee, item.currency)} would leave a net refund of ${formatShopMoney(net ?? item.refund_total, item.currency)}. Accept to continue, or cancel the return.`
        : 'The shop proposed a pickup fee. Accept to continue, or cancel the return.',
      icon: 'alert-circle' as const,
      bg: '#FFF7ED',
      text: '#C2410C',
      dot: '#EA580C',
    };
  }
  if (status === 'approved' || item.pickup_arranged_at) {
    const delivery =
      item.metadata && typeof item.metadata === 'object'
        ? (item.metadata as { delivery?: { tracking_url?: string; partner_status?: string } }).delivery
        : undefined;
    const trackingUrl = String(delivery?.tracking_url || '').trim();
    return {
      title: method === 'instant_pickup' ? 'Rider dispatched' : 'Pickup arranged',
      subtitle: trackingUrl
        ? `Keep the items ready. Track: ${trackingUrl}. Refund is issued after the shop receives them.`
        : 'Keep the items ready. Refund is issued after the shop receives them.',
      icon: 'truck' as const,
      bg: '#EFF6FF',
      text: '#1D4ED8',
      dot: '#1D4ED8',
    };
  }
  if (method === 'dropoff') {
    return {
      title: 'Awaiting drop-off',
      subtitle: 'Bring the items to the shop. Refund is issued after they confirm receipt.',
      icon: 'map-pin' as const,
      bg: '#FFFBEB',
      text: '#B45309',
      dot: '#B45309',
    };
  }
  if (method === 'instant_pickup') {
    return {
      title: 'Awaiting instant pickup',
      subtitle: 'The shop will dispatch a rider soon. Refund is issued after they receive the items.',
      icon: 'zap' as const,
      bg: '#FFFBEB',
      text: '#B45309',
      dot: '#B45309',
    };
  }
  if (method === 'reverse_pickup') {
    return {
      title: 'Awaiting pickup',
      subtitle: 'The shop will arrange a pickup. Refund is issued after they receive the items.',
      icon: 'clock' as const,
      bg: '#FFFBEB',
      text: '#B45309',
      dot: '#B45309',
    };
  }
  return {
    title: 'Return in progress',
    subtitle: 'Refund is issued after the shop receives your items.',
    icon: 'clock' as const,
    bg: '#FFFBEB',
    text: '#B45309',
    dot: '#B45309',
  };
}

export function ReturnDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [item, setItem] = useState<ShopReturn | null>(null);
  const [pickupLive, setPickupLive] = useState<ShopReturnPickupLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<'accept' | 'decline' | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const loadPickupLive = useCallback(
    async (shopReturn: ShopReturn) => {
      if (String(shopReturn.return_method || '').toLowerCase() !== 'instant_pickup') {
        setPickupLive(null);
        return;
      }
      if (
        !['approved', 'completed'].includes(String(shopReturn.status || '').toLowerCase()) &&
        !shopReturn.pickup_arranged_at
      ) {
        setPickupLive(null);
        return;
      }
      try {
        const live = await mobileClient.mobile.getMyReturnPickupLive(route.params.returnId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
          refresh: true,
        });
        setPickupLive(live.data);
      } catch {
        setPickupLive(null);
      }
    },
    [businessCode, route.params.returnId, tenantSlug],
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await mobileClient.mobile.getMyReturn(route.params.returnId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setItem(res.data);
        await loadPickupLive(res.data);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Unable to load this return.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessCode, loadPickupLive, route.params.returnId, tenantSlug],
  );

  async function decidePickupFee(action: 'accept' | 'decline') {
    setDecisionBusy(action);
    setError(null);
    try {
      const scope = { tenant_slug: tenantSlug, business_code: businessCode };
      const res =
        action === 'accept'
          ? await mobileClient.mobile.acceptMyReturnPickupFee(route.params.returnId, scope)
          : await mobileClient.mobile.declineMyReturnPickupFee(route.params.returnId, scope);
      setItem(res.data);
      await loadPickupLive(res.data);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          action === 'accept' ? "Couldn't accept the pickup fee." : "Couldn't cancel the return.",
        ),
      );
    } finally {
      setDecisionBusy(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!item || pickupLive?.terminal) return;
    if (String(item.return_method || '').toLowerCase() !== 'instant_pickup') return;
    if (!['approved'].includes(String(item.status || '').toLowerCase()) && !item.pickup_arranged_at) {
      return;
    }
    const timer = setInterval(() => {
      void mobileClient.mobile
        .getMyReturnPickupLive(route.params.returnId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
          refresh: true,
        })
        .then((response) => setPickupLive(response.data))
        .catch(() => undefined);
    }, 60000);
    return () => clearInterval(timer);
  }, [
    businessCode,
    item,
    pickupLive?.terminal,
    route.params.returnId,
    tenantSlug,
  ]);

  if (loading && !item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="rotate-ccw"
          title="Return not found"
          description={error || 'This return is no longer available.'}
        />
      </View>
    );
  }

  const hero = returnHeadline(item);
  const lines = (Array.isArray(item.line_items) ? item.line_items : []).flatMap((raw) =>
    raw && typeof raw === 'object' ? [raw as ReturnLine] : [],
  );
  const completed = String(item.status || '').toLowerCase() === 'completed';
  const methodLabel = shopReturnMethodLabel(item.return_method);
  const meta = item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {};
  const pickupCharge =
    meta.pickup_charge && typeof meta.pickup_charge === 'object'
      ? (meta.pickup_charge as {
          fee?: string;
          charge_bearer?: string;
          original_refund?: string;
          net_refund?: string;
          status?: string;
        })
      : null;
  const awaitingFeeDecision = String(item.status || '').toLowerCase() === 'awaiting_customer';
  const customerPaysPickup = String(pickupCharge?.charge_bearer || '') === 'customer';
  const feeAccepted = String(pickupCharge?.status || '') === 'accepted';
  const feeProposed = String(pickupCharge?.status || '') === 'proposed';
  const liveRider = pickupLive?.rider;
  const liveRiderName = String(liveRider?.name || '').trim();
  const liveRiderPhone = String(liveRider?.phone || '').trim();
  const liveTrackingUrl = String(pickupLive?.tracking_url || '').trim();
  const hasPickupPin =
    pickupLive?.pickup?.latitude != null &&
    pickupLive?.pickup?.longitude != null &&
    Number.isFinite(Number(pickupLive.pickup.latitude)) &&
    Number.isFinite(Number(pickupLive.pickup.longitude));
  const hasDropPin =
    pickupLive?.drop?.latitude != null &&
    pickupLive?.drop?.longitude != null &&
    Number.isFinite(Number(pickupLive.drop.latitude)) &&
    Number.isFinite(Number(pickupLive.drop.longitude));
  const showPickupMap =
    Boolean(pickupLive?.available) &&
    pickupLive?.show_map !== false &&
    (Boolean(pickupLive?.dispatched) || hasPickupPin || hasDropPin);
  const showPickupLive = Boolean(pickupLive?.available && pickupLive.dispatched);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Return details" onBack={() => navigation.goBack()} />
      <RefreshableScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}
        refreshing={refreshing}
        onRefresh={() => void load('refresh')}
        primaryColor={primary}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.hero, { backgroundColor: hero.bg }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${hero.dot}22` }]}>
            <Feather name={hero.icon} size={22} color={hero.dot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: hero.text }]}>{hero.title}</Text>
            <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
            <Text style={styles.heroMeta}>
              #{item.return_number} · {shopReturnStatusLabel(item)} · {formatShopDateTime(item.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.kicker}>Refund</Text>
          <Text style={styles.refundAmount}>
            {formatShopMoney(
              awaitingFeeDecision && pickupCharge?.net_refund
                ? pickupCharge.net_refund
                : item.refund_total,
              item.currency,
            )}
          </Text>
          {customerPaysPickup && pickupCharge?.fee && feeProposed ? (
            <Text style={styles.meta}>
              If you accept, pickup fee {formatShopMoney(pickupCharge.fee, item.currency)} is
              deducted
              {pickupCharge.original_refund
                ? ` from ${formatShopMoney(pickupCharge.original_refund, item.currency)}`
                : ''}
              .
            </Text>
          ) : null}
          {customerPaysPickup && pickupCharge?.fee && feeAccepted ? (
            <Text style={styles.meta}>
              Pickup fee {formatShopMoney(pickupCharge.fee, item.currency)} deducted
              {pickupCharge.original_refund
                ? ` from ${formatShopMoney(pickupCharge.original_refund, item.currency)}`
                : ''}
              .
            </Text>
          ) : null}
          {completed && item.refund_instruction ? (
            <Text style={styles.body}>{item.refund_instruction}</Text>
          ) : null}
          <Text style={styles.meta}>
            {completed
              ? 'This amount is on the shop books. Collect cash in person or wait for the original payment to reverse, depending on how you paid.'
              : awaitingFeeDecision
                ? 'Accept the pickup fee to continue, or cancel the return.'
                : 'Refund is issued only after the shop receives your items.'}
          </Text>
        </View>

        {awaitingFeeDecision ? (
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button
                label={decisionBusy === 'decline' ? 'Cancelling…' : 'Cancel return'}
                variant="outline"
                icon="x"
                fullWidth
                disabled={decisionBusy != null}
                loading={decisionBusy === 'decline'}
                onPress={() => void decidePickupFee('decline')}
              />
            </View>
            <View style={{ flex: 1.2 }}>
              <Button
                label={decisionBusy === 'accept' ? 'Accepting…' : 'Accept fee'}
                icon="check"
                fullWidth
                primaryColor={primary}
                disabled={decisionBusy != null}
                loading={decisionBusy === 'accept'}
                onPress={() => void decidePickupFee('accept')}
              />
            </View>
          </View>
        ) : null}

        {showPickupLive && pickupLive ? (
          <View style={styles.card}>
            <View style={styles.liveHeader}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: pickupLive.terminal ? colors.success : primary },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.liveEyebrow}>
                  {pickupLive.terminal ? 'PICKUP STATUS' : 'LIVE PICKUP'}
                </Text>
                <Text style={styles.factValue}>
                  {String(pickupLive.headline || 'Pickup update').replace(
                    /\s*·\s*\d+\s*min(?:utes?)?$/i,
                    '',
                  )}
                </Text>
                {pickupLive.subtitle ? <Text style={styles.meta}>{pickupLive.subtitle}</Text> : null}
                <Text style={[styles.meta, pickupLive.stale ? styles.staleText : null]}>
                  {pickupLive.stale
                    ? `Location may be outdated${
                        pickupLive.last_updated
                          ? ` · Updated ${formatDateTime(pickupLive.last_updated)}`
                          : ''
                      }`
                    : pickupLive.last_updated
                      ? `Updated ${formatDateTime(pickupLive.last_updated)}`
                      : 'Waiting for an update'}
                </Text>
              </View>
            </View>
            {!pickupLive.terminal ? (
              <View style={[styles.etaBox, { backgroundColor: `${primary}12` }]}>
                <Feather name="clock" size={20} color={primary} />
                <View>
                  <Text style={styles.etaLabel}>ESTIMATED ARRIVAL</Text>
                  <Text style={[styles.etaValue, { color: primary }]}>
                    {pickupLive.eta_minutes != null ? `${pickupLive.eta_minutes} min` : 'Updating'}
                  </Text>
                </View>
              </View>
            ) : null}
            {showPickupMap ? <DeliveryTrackerMap live={pickupLive} primary={primary} /> : null}
            {showPickupMap ? (
              <View style={styles.legend}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendLabel}>Collect from you</Text>
                    <Text style={styles.meta}>
                      {[
                        pickupLive.pickup?.contact?.name,
                        pickupLive.pickup?.address,
                        pickupLive.pickup?.city,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Your address'}
                    </Text>
                  </View>
                </View>
                {pickupLive.rider_location?.latitude != null &&
                pickupLive.rider_location?.longitude != null ? (
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.legendLabel}>Rider</Text>
                      <Text style={styles.meta}>
                        {liveRiderName || 'Assigned rider'}
                        {pickupLive.rider_location.latitude != null
                          ? ` · ${Number(pickupLive.rider_location.latitude).toFixed(5)}, ${Number(pickupLive.rider_location.longitude).toFixed(5)}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendLabel}>Return to shop</Text>
                    <Text style={styles.meta}>
                      {[
                        pickupLive.drop?.contact?.name,
                        pickupLive.drop?.address,
                        pickupLive.drop?.city,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Shop'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
            {liveRiderName || liveRiderPhone || liveRider?.vehicle ? (
              <View style={styles.riderRow}>
                {resolveMediaUrl(liveRider?.photo_url) ? (
                  <Image
                    source={{ uri: resolveMediaUrl(liveRider?.photo_url) || '' }}
                    style={styles.riderPhoto}
                  />
                ) : (
                  <View style={[styles.riderAvatar, { backgroundColor: `${primary}18` }]}>
                    <Feather name="user" size={20} color={primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.riderName}>{liveRiderName || 'Pickup rider'}</Text>
                  <Text style={styles.meta}>{String(liveRider?.vehicle || 'Your pickup partner')}</Text>
                  {liveRiderPhone ? <Text style={styles.riderPhone}>{liveRiderPhone}</Text> : null}
                </View>
                {pickupLive.can_call_rider && liveRiderPhone ? (
                  <Pressable
                    style={[styles.callButton, { borderColor: primary }]}
                    onPress={() => Linking.openURL(`tel:${liveRiderPhone}`)}
                  >
                    <Feather name="phone" size={16} color={primary} />
                    <Text style={{ color: primary, fontWeight: '700' }}>Call</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {liveTrackingUrl ? (
              <Pressable style={styles.trackingLink} onPress={() => Linking.openURL(liveTrackingUrl)}>
                <Feather name="external-link" size={16} color={primary} />
                <Text style={[styles.trackingLinkText, { color: primary }]}>Open carrier tracking</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>Items</Text>
          {lines.length ? (
            lines.map((row, index) => (
              <View key={`${row.name}-${index}`}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.lineRow}>
                  <View style={styles.itemThumb}>
                    <Feather name="package" size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{row.name || `Item ${index + 1}`}</Text>
                    <Text style={styles.meta}>
                      Qty {formatShopQty(row.quantity)}
                      {item.created_at ? ` · ${formatShopDateTime(item.created_at)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.total}>{formatShopMoney(row.line_total, item.currency)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No line items on this return.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Details</Text>
          {item.created_at ? (
            <View style={styles.factRow}>
              <Feather name="clock" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Requested at</Text>
                <Text style={styles.factValue}>{formatShopDateTime(item.created_at)}</Text>
              </View>
            </View>
          ) : null}
          {methodLabel ? (
            <View style={styles.factRow}>
              <Feather name="map-pin" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Return method</Text>
                <Text style={styles.factValue}>{methodLabel}</Text>
              </View>
            </View>
          ) : null}
          {item.pickup_arranged_at ? (
            <View style={styles.factRow}>
              <Feather name="truck" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Pickup arranged</Text>
                <Text style={styles.factValue}>{formatShopDateTime(item.pickup_arranged_at)}</Text>
                {item.pickup_tracking_number ? (
                  <Text style={styles.meta}>Tracking {item.pickup_tracking_number}</Text>
                ) : null}
                {item.pickup_notes ? <Text style={styles.meta}>{item.pickup_notes}</Text> : null}
              </View>
            </View>
          ) : null}
          {item.received_at ? (
            <View style={styles.factRow}>
              <Feather name="package" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Received by shop</Text>
                <Text style={styles.factValue}>{formatShopDateTime(item.received_at)}</Text>
              </View>
            </View>
          ) : null}
          {item.reason ? (
            <View style={styles.factRow}>
              <Feather name="message-circle" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Reason</Text>
                <Text style={styles.factValue}>{item.reason}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.factRow}>
            <Feather name={item.restock ? 'archive' : 'slash'} size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>Inventory</Text>
              <Text style={styles.factValue}>
                {completed
                  ? item.restock
                    ? 'Sellable items were added back to stock.'
                    : 'These items were not restocked.'
                  : 'Stock is updated after the shop receives the items.'}
              </Text>
            </View>
          </View>
          {item.refund_mode ? (
            <View style={styles.factRow}>
              <Feather name="credit-card" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Refund method</Text>
                <Text style={styles.factValue}>{item.refund_mode.replace(/_/g, ' ')}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {item.order ? (
          <Pressable
            style={[styles.linkBtn, { borderColor: primary }]}
            onPress={() => navigation.navigate('ShopOrderDetail', { orderId: String(item.order) })}
          >
            <Text style={{ color: primary, fontWeight: '700' }}>View original order</Text>
          </Pressable>
        ) : null}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  error: { color: colors.danger, ...typography.body },
  hero: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { ...typography.title, fontSize: 18 },
  heroSubtitle: { ...typography.body, color: colors.foreground, marginTop: 4 },
  heroMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: { ...typography.caption, color: colors.mutedForeground, textTransform: 'uppercase', fontWeight: '700' },
  refundAmount: { ...typography.title, fontSize: 28, color: colors.foreground },
  body: { ...typography.body, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  section: { ...typography.label, color: colors.foreground, fontWeight: '700', marginBottom: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  total: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  factRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginTop: 4 },
  factLabel: { ...typography.caption, color: colors.mutedForeground },
  factValue: { ...typography.body, color: colors.foreground, marginTop: 2 },
  linkBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  liveHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  liveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  liveEyebrow: {
    ...typography.tiny,
    color: colors.mutedForeground,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  staleText: { color: colors.warning },
  etaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  etaLabel: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '800', letterSpacing: 0.6 },
  etaValue: { ...typography.title, fontSize: 20 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  riderPhoto: { width: 44, height: 44, borderRadius: 22 },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  riderPhone: { ...typography.caption, color: colors.foreground, marginTop: 2 },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  trackingLinkText: { ...typography.label, fontWeight: '700' },
  legend: { gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  legendLabel: {
    ...typography.tiny,
    color: colors.mutedForeground,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
