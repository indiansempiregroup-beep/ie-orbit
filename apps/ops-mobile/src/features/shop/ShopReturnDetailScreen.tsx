import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ShopOrder, ShopReturn, ShopReturnPickupLive } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { formatDateTime, getApiErrorMessage } from '../../utils/format';
import type { TFunction } from 'i18next';
import { ArrangeReturnPickupSheet } from './ArrangeReturnPickupSheet';
import { DeliveryMapLegend } from './DeliveryMapLegend';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { formatMoney } from './posPayment';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopReturnDetail'>;

function returnMethodLabel(method: string | null | undefined, t: TFunction) {
  if (method === 'dropoff') return t('shop.returnsPage.methods.dropoff');
  if (method === 'reverse_pickup') return t('shop.returnsPage.methods.reverse_pickup');
  if (method === 'instant_pickup') return t('shop.returnsPage.methods.instant_pickup');
  if (method === 'in_store') return t('shop.returnsPage.methods.in_store');
  return method ? String(method).replace(/_/g, ' ') : '';
}

function returnStatusLabel(item: ShopReturn, t: TFunction) {
  const status = String(item.status || '').toLowerCase();
  if (status === 'completed') return t('shop.returnsPage.statusLabels.completed');
  if (status === 'rejected') return t('shop.returnsPage.statusLabels.rejected');
  if (status === 'awaiting_customer') return t('opsApp.shop.returns.awaitingCustomer');
  if (status === 'approved' || item.pickup_arranged_at) {
    return item.return_method === 'instant_pickup'
      ? t('shop.returnsPage.statusLabels.riderDispatched')
      : t('shop.returnsPage.statusLabels.pickupArranged');
  }
  if (item.return_method === 'dropoff') return t('shop.returnsPage.statusLabels.awaitingDropoff');
  if (item.return_method === 'instant_pickup') return t('shop.returnsPage.statusLabels.awaitingDispatch');
  if (item.return_method === 'reverse_pickup') return t('shop.returnsPage.statusLabels.awaitingPickup');
  return status || t('shop.returnsPage.statusLabels.pending');
}

function canArrange(item: ShopReturn) {
  if (String(item.status || '') !== 'pending') return false;
  return (
    item.return_method === 'reverse_pickup' ||
    item.return_method === 'instant_pickup' ||
    item.return_method === 'dropoff'
  );
}

function isOpen(item: ShopReturn) {
  const status = String(item.status || '').toLowerCase();
  return status === 'pending' || status === 'awaiting_customer' || status === 'approved';
}

export function ShopReturnDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const { returnId } = route.params;
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const toast = useToast();

  const [shopReturn, setShopReturn] = useState<ShopReturn | null>(null);
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [pickupLive, setPickupLive] = useState<ShopReturnPickupLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const loadPickupLive = useCallback(
    async (item: ShopReturn) => {
      if (!client || !businessId) return;
      if (String(item.return_method || '').toLowerCase() !== 'instant_pickup') {
        setPickupLive(null);
        return;
      }
      if (
        !['approved', 'completed'].includes(String(item.status || '').toLowerCase()) &&
        !item.pickup_arranged_at
      ) {
        setPickupLive(null);
        return;
      }
      try {
        const live = await client.shop.getReturnPickupLive(item.id, {
          business_id: businessId,
          refresh: true,
        });
        setPickupLive(live.data);
      } catch {
        setPickupLive(null);
      }
    },
    [businessId, client],
  );

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.shop.listReturns({ business_id: businessId });
      const found = (list.data || []).find((row) => row.id === returnId) || null;
      if (!found) {
        setShopReturn(null);
        setOrder(null);
        setPickupLive(null);
        setError(t('opsApp.shop.returns.notFound'));
        return;
      }
      setShopReturn(found);
      if (found.order) {
        try {
          const orderRes = await client.shop.getOrder(String(found.order));
          setOrder(orderRes.data);
        } catch {
          setOrder(null);
        }
      } else {
        setOrder(null);
      }
      await loadPickupLive(found);
    } catch (err) {
      setError(getApiErrorMessage(err, t('opsApp.shop.returns.loadDetailFailed')));
      setShopReturn(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, client, loadPickupLive, returnId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!client || !businessId || !shopReturn || !pickupLive || pickupLive.terminal) return;
    const timer = setInterval(() => {
      void client.shop
        .getReturnPickupLive(shopReturn.id, { business_id: businessId, refresh: true })
        .then((response) => setPickupLive(response.data))
        .catch(() => undefined);
    }, 12000);
    return () => clearInterval(timer);
  }, [businessId, client, pickupLive, shopReturn]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: shopReturn?.return_number
        ? t('opsApp.shop.returns.detailTitle', { number: shopReturn.return_number })
        : t('opsApp.shop.returns.detailFallbackTitle'),
    });
  }, [navigation, shopReturn?.return_number, t]);

  async function runAction(action: 'receive' | 'reject') {
    if (!client || !businessId || !shopReturn) return;
    setBusy(true);
    try {
      if (action === 'receive') {
        await client.shop.receiveReturn(shopReturn.id, { business_id: businessId });
        toast.push(t('shop.returnsPage.received'), 'success');
      } else {
        await client.shop.rejectReturn(shopReturn.id, { business_id: businessId });
        toast.push(t('shop.returnsPage.rejected'), 'success');
      }
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.returnsPage.updateFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !shopReturn) {
    return (
      <FormScreen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </FormScreen>
    );
  }

  if (!shopReturn) {
    return (
      <FormScreen>
        <Text style={styles.error}>{error || t('opsApp.shop.returns.notFound')}</Text>
      </FormScreen>
    );
  }

  const open = isOpen(shopReturn);
  const showArrange = canArrange(shopReturn);
  const liveRider = pickupLive?.rider;
  const showLive = Boolean(pickupLive?.available && pickupLive.dispatched);
  const lines = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];

  const footer = !open ? undefined : (
    <View style={styles.footer}>
      <Button
        label={t('opsApp.shop.returns.reject')}
        icon="x"
        variant="soft"
        disabled={busy}
        style={styles.footerBtn}
        onPress={() => void runAction('reject')}
      />
      {showArrange ? (
        <Button
          label={t('opsApp.shop.returns.arrangePickup')}
          icon="truck"
          variant="soft"
          disabled={busy}
          style={styles.footerBtn}
          onPress={() => setArrangeOpen(true)}
        />
      ) : null}
      <Button
        label={busy ? t('common.saving') : t('opsApp.shop.returns.markReceived')}
        icon="check"
        loading={busy}
        disabled={busy}
        style={styles.footerPrimary}
        onPress={() => void runAction('receive')}
      />
    </View>
  );

  return (
    <FormScreen
      footer={footer}
      contentContainerStyle={styles.content}
      onRefresh={() => void load()}
      refreshing={loading}
    >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.kicker}>{t('opsApp.shop.returns.kicker')}</Text>
          <Text style={styles.title}>{shopReturn.return_number}</Text>
          <Text style={styles.meta}>
            {returnStatusLabel(shopReturn, t)}
            {shopReturn.return_method ? ` · ${returnMethodLabel(shopReturn.return_method, t)}` : ''}
          </Text>
          <Text style={styles.refund}>
            {formatMoney(shopReturn.refund_total, shopReturn.currency)}
          </Text>
          {shopReturn.created_at ? (
            <Text style={styles.meta}>
              {t('opsApp.shop.returns.requested', { date: formatDateTime(shopReturn.created_at) })}
            </Text>
          ) : null}
          {shopReturn.reason ? <Text style={styles.body}>{shopReturn.reason}</Text> : null}
        </View>

        {order ? (
          <Pressable
            style={styles.linkCard}
            onPress={() =>
              navigation.navigate('ShopOrderDetail', { orderId: order.id })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{t('opsApp.shop.returns.originalOrder')}</Text>
              <Text style={styles.linkTitle}>{order.order_number}</Text>
              <Text style={styles.meta}>
                {formatMoney(order.total, order.currency)} · {order.status}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}

        {showLive && pickupLive ? (
          <View style={styles.card}>
            <View style={styles.liveHeader}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: pickupLive.terminal ? colors.success : colors.primary },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>{t('opsApp.shop.returns.returnPickup')}</Text>
                <Text style={styles.liveTitle}>
                  {pickupLive.headline || String(pickupLive.partner_status || '').replace(/_/g, ' ')}
                </Text>
                {pickupLive.subtitle ? <Text style={styles.meta}>{pickupLive.subtitle}</Text> : null}
                <Text style={[styles.meta, pickupLive.stale ? styles.stale : null]}>
                  {pickupLive.stale
                    ? t('opsApp.shop.returns.locationStale')
                    : t('opsApp.shop.returns.trackingUpToDate')}
                  {pickupLive.last_updated
                    ? ` · ${formatDateTime(pickupLive.last_updated)}`
                    : ''}
                </Text>
              </View>
              {pickupLive.eta_minutes != null ? (
                <View style={styles.etaCard}>
                  <Text style={styles.etaValue}>{pickupLive.eta_minutes}</Text>
                  <Text style={styles.etaLabel}>{t('opsApp.shop.returns.etaMin')}</Text>
                </View>
              ) : null}
            </View>

            {liveRider?.name || liveRider?.phone ? (
              <View style={styles.riderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kicker}>{t('opsApp.shop.returns.rider')}</Text>
                  <Text style={styles.riderName}>{liveRider?.name || t('opsApp.shop.returns.assignedRider')}</Text>
                  {liveRider?.vehicle ? (
                    <Text style={styles.meta}>{String(liveRider.vehicle)}</Text>
                  ) : null}
                </View>
                {liveRider?.phone && pickupLive.can_call_rider !== false ? (
                  <Pressable
                    style={styles.callBtn}
                    onPress={() => void Linking.openURL(`tel:${String(liveRider.phone)}`)}
                  >
                    <Feather name="phone" size={16} color="#fff" />
                    <Text style={styles.callBtnText}>{t('opsApp.shop.returns.call')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <DeliveryTrackingMap delivery={pickupLive} />
            <DeliveryMapLegend delivery={pickupLive} />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>{t('opsApp.shop.returns.items')}</Text>
          {lines.length ? (
            lines.map((raw, index) => {
              if (!raw || typeof raw !== 'object') return null;
              const row = raw as { name?: string; quantity?: string | number; line_total?: string | number };
              return (
                <View key={`${row.name}-${index}`} style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName}>{row.name || t('opsApp.shop.returns.itemN', { n: index + 1 })}</Text>
                    <Text style={styles.meta}>
                      {t('opsApp.shop.returns.qty', { qty: String(row.quantity ?? '') })}
                    </Text>
                  </View>
                  {row.line_total != null ? (
                    <Text style={styles.lineTotal}>
                      {formatMoney(row.line_total, shopReturn.currency)}
                    </Text>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={styles.meta}>{t('opsApp.shop.returns.noLineItems')}</Text>
          )}
        </View>

      {businessId ? (
        <ArrangeReturnPickupSheet
          visible={arrangeOpen}
          shopReturn={shopReturn}
          businessId={businessId}
          onClose={() => setArrangeOpen(false)}
          onDone={() => {
            setArrangeOpen(false);
            void load();
          }}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  footer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  footerBtn: { flex: 1 },
  footerPrimary: { flex: 1.35 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  linkCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kicker: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.foreground },
  linkTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  refund: { fontFamily: fonts.bodySemi, fontSize: 24, color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground },
  body: { fontSize: 14, color: colors.foreground },
  section: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  error: { color: colors.destructive, fontSize: 14 },
  liveHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  liveTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  stale: { color: colors.warning },
  etaCard: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  etaValue: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.foreground },
  etaLabel: { fontSize: 10, color: colors.mutedForeground },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  riderName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  callBtnText: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 13 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lineName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  lineTotal: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
});
