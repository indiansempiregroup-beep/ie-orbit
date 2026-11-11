import React, { useCallback, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampPageSize, toPagedResult, type ShopCoupon } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { formatMoney } from './posPayment';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from './shopRefreshControl';
import type { TFunction } from 'i18next';
import { confirmAction } from '../../utils/confirmAction';

type FormState = {
  code: string;
  name: string;
  description: string;
  discountType: 'percent' | 'amount';
  discountValue: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  perCustomer: string;
  firstOrderOnly: boolean;
  appliesToOnline: boolean;
  appliesToPos: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: '10',
  minOrder: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  perCustomer: '',
  firstOrderOnly: false,
  appliesToOnline: true,
  appliesToPos: true,
  isActive: true,
};

function statusOptions(t: TFunction) {
  return [
    { value: '', label: t('shop.coupons.allCoupons') },
    { value: 'active', label: t('common.active') },
    { value: 'inactive', label: t('shop.coupons.inactive') },
  ];
}

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function couponToForm(coupon: ShopCoupon): FormState {
  return {
    code: coupon.code,
    name: coupon.name,
    description: coupon.description ?? '',
    discountType: coupon.discount_type === 'amount' ? 'amount' : 'percent',
    discountValue: String(coupon.discount_value ?? ''),
    minOrder: coupon.min_order_total && Number(coupon.min_order_total) ? String(coupon.min_order_total) : '',
    maxDiscount: coupon.max_discount_amount != null ? String(coupon.max_discount_amount) : '',
    startsAt: dateInput(coupon.starts_at),
    endsAt: dateInput(coupon.ends_at),
    maxRedemptions: coupon.max_redemptions != null ? String(coupon.max_redemptions) : '',
    perCustomer:
      coupon.max_redemptions_per_customer != null ? String(coupon.max_redemptions_per_customer) : '',
    firstOrderOnly: Boolean(coupon.first_order_only),
    appliesToOnline: coupon.applies_to_online !== false,
    appliesToPos: Boolean(coupon.applies_to_pos),
    isActive: coupon.is_active !== false,
  };
}

function channelLabel(coupon: ShopCoupon, t: TFunction) {
  const online = coupon.applies_to_online !== false;
  const pos = Boolean(coupon.applies_to_pos);
  if (online && pos) return t('opsApp.shop.coupons.channelOnlinePos');
  if (pos) return t('opsApp.shop.coupons.channelPosOnly');
  if (online) return t('opsApp.shop.coupons.channelOnlineOnly');
  return t('opsApp.shop.coupons.channelNone');
}

function discountLabel(coupon: ShopCoupon, t: TFunction, currency?: string | null) {
  if (coupon.discount_type === 'amount') {
    return t('shop.coupons.discountAmountOff', {
      amount: formatMoney(coupon.discount_value, currency),
    });
  }
  if (coupon.max_discount_amount) {
    return t('shop.coupons.discountPercentOffCap', {
      value: coupon.discount_value,
      max: formatMoney(coupon.max_discount_amount, currency),
    });
  }
  return t('shop.coupons.discountPercentOff', { value: coupon.discount_value });
}

export function ShopCouponsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();
  const currency = activeBusiness?.currency;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<ShopCoupon[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState('');
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [statusFilter],
  });

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }, []);

  const openEdit = useCallback((coupon: ShopCoupon) => {
    setEditingId(coupon.id);
    setForm(couponToForm(coupon));
    setShowForm(true);
    setError(null);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (showForm) closeForm();
            else openCreate();
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? t('common.close') : t('shop.coupons.addCoupon')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, openCreate, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listCoupons({
        business_id: businessId,
        q,
        is_active: statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(response, pageSize);
      setCoupons(page.items);
      setPageMeta(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.coupons.loadFailed'));
      setCoupons([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, q, statusFilter, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = coupons;
  const hasFilters = Boolean(search.trim()) || Boolean(statusFilter);

  async function save() {
    if (!client || !businessId) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError(
        !form.code.trim()
          ? t('opsApp.shop.coupons.codeRequired')
          : t('opsApp.shop.coupons.nameRequired'),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        business_id: businessId,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        discount_type: form.discountType,
        discount_value: Number(form.discountValue) || 0,
        min_order_total: Number(form.minOrder) || 0,
        max_discount_amount: optionalNumber(form.maxDiscount),
        starts_at: form.startsAt ? `${form.startsAt}T00:00:00` : null,
        ends_at: form.endsAt ? `${form.endsAt}T23:59:59` : null,
        max_redemptions: optionalNumber(form.maxRedemptions),
        max_redemptions_per_customer: optionalNumber(form.perCustomer),
        first_order_only: form.firstOrderOnly,
        applies_to_online: form.appliesToOnline,
        applies_to_pos: form.appliesToPos,
        is_active: form.isActive,
      };
      if (editingId) {
        await client.shop.updateCoupon(editingId, payload);
        toast.push(t('shop.coupons.toastSaved'), 'success');
      } else {
        await client.shop.createCoupon(payload);
        toast.push(t('shop.coupons.toastAdded'), 'success');
      }
      closeForm();
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : t('shop.coupons.errSave');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!editingId || !client) return;
    const ok = await confirmAction({
      title: t('shop.coupons.deleteCoupon'),
      message: t('opsApp.shop.coupons.removeBody', { code: form.code || t('shop.coupons.thisCoupon') }),
      confirmLabel: t('opsApp.shop.common.delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.shop.deleteCoupon(editingId);
      toast.push(t('shop.coupons.toastRemoved'), 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('shop.coupons.errRemove'), 'error');
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <View style={[styles.footer, editingId ? styles.footerRow : null]}>
            {editingId ? (
              <View style={styles.footerBtn}>
                <Button
                  label={t('opsApp.shop.common.delete')}
                  variant="destructive"
                  fullWidth
                  size="lg"
                  onPress={() => void confirmDelete()}
                />
              </View>
            ) : null}
            <View style={editingId ? styles.footerBtnPrimary : undefined}>
              <Button
                label={
                  busy
                    ? t('common.saving')
                    : editingId
                      ? t('shop.coupons.updateCoupon')
                      : t('shop.coupons.saveCoupon')
                }
                fullWidth
                size="lg"
                loading={busy}
                onPress={() => void save()}
              />
            </View>
          </View>
        }
      >
        <Text style={styles.formTitle}>{editingId ? t('shop.coupons.editCoupon') : t('shop.coupons.addCoupon')}</Text>
        <Text style={styles.help}>
          Codes for online checkout and/or the sale counter. Turn on POS to show them on the sale page.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Input
          label={t('shop.coupons.code')}
          required
          value={form.code}
          onChangeText={(code) => setForm((current) => ({ ...current, code: code.toUpperCase() }))}
          placeholder="SAVE10"
          autoCapitalize="characters"
          error={!form.code.trim() && error === t('opsApp.shop.coupons.codeRequired') ? error : undefined}
        />
        <Input
          label={t('shop.coupons.name')}
          required
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
          placeholder={t('shop.coupons.namePlaceholder')}
          error={!form.name.trim() && error === t('opsApp.shop.coupons.nameRequired') ? error : undefined}
        />
        <Input
          label={t('shop.coupons.description')}
          optional
          value={form.description}
          onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          placeholder={t('shop.coupons.optional')}
        />
        <View style={styles.chipRow}>
          <Chip
            label={t('shop.coupons.percent')}
            active={form.discountType === 'percent'}
            onPress={() => setForm((current) => ({ ...current, discountType: 'percent' }))}
          />
          <Chip
            label={t('shop.coupons.amount')}
            active={form.discountType === 'amount'}
            onPress={() => setForm((current) => ({ ...current, discountType: 'amount' }))}
          />
        </View>
        <Input
          label={form.discountType === 'percent' ? t('shop.coupons.percent') : t('shop.coupons.amount')}
          required
          value={form.discountValue}
          onChangeText={(discountValue) => setForm((current) => ({ ...current, discountValue }))}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('shop.coupons.minOrder')}
          optional
          value={form.minOrder}
          onChangeText={(minOrder) => setForm((current) => ({ ...current, minOrder }))}
          placeholder={t('shop.coupons.optional')}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('shop.coupons.maxDiscount')}
          optional
          value={form.maxDiscount}
          onChangeText={(maxDiscount) => setForm((current) => ({ ...current, maxDiscount }))}
          placeholder={t('shop.coupons.optionalCap')}
          keyboardType="decimal-pad"
        />
        <DateField
          label={t('shop.coupons.starts')}
          optional
          value={form.startsAt}
          onChange={(startsAt) => setForm((current) => ({ ...current, startsAt }))}
          allowPast
          allowFuture
          allowClear
        />
        <DateField
          label={t('shop.coupons.ends')}
          optional
          value={form.endsAt}
          onChange={(endsAt) => setForm((current) => ({ ...current, endsAt }))}
          allowPast
          allowFuture
          allowClear
        />
        <Input
          label={t('shop.coupons.totalUses')}
          optional
          value={form.maxRedemptions}
          onChangeText={(maxRedemptions) => setForm((current) => ({ ...current, maxRedemptions }))}
          placeholder={t('shop.coupons.unlimited')}
          keyboardType="number-pad"
        />
        <Input
          label={t('shop.coupons.usesPerCustomer')}
          optional
          value={form.perCustomer}
          onChangeText={(perCustomer) => setForm((current) => ({ ...current, perCustomer }))}
          placeholder={t('shop.coupons.unlimited')}
          keyboardType="number-pad"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('shop.coupons.firstOrderOnly')}</Text>
          <Switch
            value={form.firstOrderOnly}
            onValueChange={(firstOrderOnly) => setForm((current) => ({ ...current, firstOrderOnly }))}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.switchLabel}>{t('opsApp.shop.coupons.onlineOrders')}</Text>
            <Text style={styles.switchHint}>{t('opsApp.shop.coupons.onlineOrdersHint')}</Text>
          </View>
          <Switch
            value={form.appliesToOnline}
            onValueChange={(appliesToOnline) => setForm((current) => ({ ...current, appliesToOnline }))}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.switchLabel}>{t('opsApp.shop.coupons.posCounter')}</Text>
            <Text style={styles.switchHint}>{t('opsApp.shop.coupons.posCounterHint')}</Text>
          </View>
          <Switch
            value={form.appliesToPos}
            onValueChange={(appliesToPos) => setForm((current) => ({ ...current, appliesToPos }))}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('common.active')}</Text>
          <Switch
            value={form.isActive}
            onValueChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
          />
        </View>
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('shop.coupons.searchPlaceholder')}
          style={styles.search}
        />
        <SelectField
          label={t('common.status')}
          value={statusFilter}
          options={statusOptions(t)}
          onChange={setStatusFilter}
        />
        {statusFilter ? (
          <Pressable onPress={() => setStatusFilter('')} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>{t('opsApp.shop.common.clearFilters')}</Text>
          </Pressable>
        ) : null}

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, marginTop: spacing.sm }}
          renderItem={({ item }) => (
            <BooksDocumentRow
              title={item.code}
              amount={discountLabel(item, t, currency)}
              meta={`${item.name} · ${channelLabel(item, t)} · ${
                item.max_redemptions != null
                  ? t('shop.coupons.usedOf', { used: item.redemption_count ?? 0, max: item.max_redemptions })
                  : t('opsApp.shop.coupons.usedMeta', { used: item.redemption_count ?? 0 })
              }${item.min_order_total && Number(item.min_order_total) > 0 ? ` · ${t('shop.coupons.minOrderShort', { amount: formatMoney(item.min_order_total, currency) })}` : ''}`}
              badge={item.is_active === false ? t('shop.coupons.inactive') : t('common.active')}
              badgeKind={item.is_active === false ? 'void' : 'paid'}
              icon="tag"
              iconTone="coral"
              dimmed={item.is_active === false}
              onPress={() => openEdit(item)}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="tag"
                title={
                  hasFilters
                    ? t('opsApp.shop.coupons.noMatching')
                    : t('opsApp.shop.coupons.noCoupons')
                }
                message={
                  hasFilters
                    ? t('opsApp.shop.coupons.tryAnother')
                    : t('opsApp.shop.coupons.emptyHint')
                }
                actionLabel={hasFilters ? undefined : t('shop.coupons.addCoupon')}
                onAction={hasFilters ? undefined : openCreate}
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filtered.length}
              label={t('shop.coupons.paginationLabel', { defaultValue: 'coupons' })}
              disabled={loading}
            />
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  search: { marginBottom: spacing.sm },
  clearFilters: { alignSelf: 'flex-start', marginTop: spacing.sm, marginBottom: spacing.sm },
  clearFiltersText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { color: colors.mutedForeground, marginBottom: spacing.sm },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  footer: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  footerBtn: { flexShrink: 0, minWidth: 110 },
  footerBtnPrimary: { flex: 1, minWidth: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.foreground, fontWeight: '600' },
  switchHint: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbEmpty: {
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
});
