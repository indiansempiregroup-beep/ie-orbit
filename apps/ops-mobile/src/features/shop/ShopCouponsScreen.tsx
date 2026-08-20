import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { ShopCoupon } from '@ie-platform/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from './shopRefreshControl';

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
  isActive: true,
};

const STATUS_OPTIONS = [
  { value: '', label: 'All coupons' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

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
    isActive: coupon.is_active !== false,
  };
}

function discountLabel(coupon: ShopCoupon) {
  if (coupon.discount_type === 'amount') return `₹${coupon.discount_value} off`;
  const cap = coupon.max_discount_amount ? ` (max ₹${coupon.max_discount_amount})` : '';
  return `${coupon.discount_value}% off${cap}`;
}

export function ShopCouponsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<ShopCoupon[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
          accessibilityLabel={showForm ? 'Close' : 'Add coupon'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, openCreate]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listCoupons({ business_id: businessId });
      setCoupons(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return coupons.filter((coupon) => {
      if (statusFilter === 'active' && coupon.is_active === false) return false;
      if (statusFilter === 'inactive' && coupon.is_active !== false) return false;
      if (!term) return true;
      return [coupon.code, coupon.name, coupon.description ?? ''].join(' ').toLowerCase().includes(term);
    });
  }, [coupons, search, statusFilter]);

  async function save() {
    if (!client || !businessId) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast.push('Code and name are required', 'error');
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
        is_active: form.isActive,
      };
      if (editingId) {
        await client.shop.updateCoupon(editingId, payload);
        toast.push('Coupon updated.', 'success');
      } else {
        await client.shop.createCoupon(payload);
        toast.push('Coupon saved.', 'success');
      }
      closeForm();
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Unable to save coupon';
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!editingId) return;
    Alert.alert('Delete coupon', `Remove ${form.code || 'this coupon'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!client) return;
            try {
              await client.shop.deleteCoupon(editingId);
              toast.push('Coupon deleted.', 'success');
              closeForm();
              await load();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : 'Unable to delete', 'error');
            }
          })();
        },
      },
    ]);
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <View style={styles.footer}>
            <Button
              label={busy ? 'Saving…' : editingId ? 'Update coupon' : 'Save coupon'}
              fullWidth
              size="lg"
              loading={busy}
              onPress={() => void save()}
            />
            {editingId ? (
              <Button label="Delete coupon" variant="destructive" fullWidth onPress={confirmDelete} />
            ) : null}
          </View>
        }
      >
        <Text style={styles.formTitle}>{editingId ? 'Edit coupon' : 'Add coupon'}</Text>
        <Text style={styles.help}>Codes customers can apply on pickup and delivery checkout.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Input
          label="Code"
          value={form.code}
          onChangeText={(code) => setForm((current) => ({ ...current, code: code.toUpperCase() }))}
          placeholder="SAVE10"
          autoCapitalize="characters"
        />
        <Input
          label="Name"
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
          placeholder="10% off first order"
        />
        <Input
          label="Description"
          value={form.description}
          onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          placeholder="Optional"
        />
        <View style={styles.chipRow}>
          <Chip
            label="Percent"
            active={form.discountType === 'percent'}
            onPress={() => setForm((current) => ({ ...current, discountType: 'percent' }))}
          />
          <Chip
            label="Amount"
            active={form.discountType === 'amount'}
            onPress={() => setForm((current) => ({ ...current, discountType: 'amount' }))}
          />
        </View>
        <Input
          label={form.discountType === 'percent' ? 'Percent' : 'Amount'}
          value={form.discountValue}
          onChangeText={(discountValue) => setForm((current) => ({ ...current, discountValue }))}
          keyboardType="decimal-pad"
        />
        <Input
          label="Min. order"
          value={form.minOrder}
          onChangeText={(minOrder) => setForm((current) => ({ ...current, minOrder }))}
          placeholder="Optional"
          keyboardType="decimal-pad"
        />
        <Input
          label="Max discount"
          value={form.maxDiscount}
          onChangeText={(maxDiscount) => setForm((current) => ({ ...current, maxDiscount }))}
          placeholder="Optional cap"
          keyboardType="decimal-pad"
        />
        <DateField
          label="Starts"
          value={form.startsAt}
          onChange={(startsAt) => setForm((current) => ({ ...current, startsAt }))}
          allowPast
          allowFuture
          allowClear
        />
        <DateField
          label="Ends"
          value={form.endsAt}
          onChange={(endsAt) => setForm((current) => ({ ...current, endsAt }))}
          allowPast
          allowFuture
          allowClear
        />
        <Input
          label="Total uses"
          value={form.maxRedemptions}
          onChangeText={(maxRedemptions) => setForm((current) => ({ ...current, maxRedemptions }))}
          placeholder="Unlimited"
          keyboardType="number-pad"
        />
        <Input
          label="Uses per customer"
          value={form.perCustomer}
          onChangeText={(perCustomer) => setForm((current) => ({ ...current, perCustomer }))}
          placeholder="Unlimited"
          keyboardType="number-pad"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>First order only</Text>
          <Switch
            value={form.firstOrderOnly}
            onValueChange={(firstOrderOnly) => setForm((current) => ({ ...current, firstOrderOnly }))}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
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
          placeholder="Search code or name…"
          style={styles.search}
        />
        <SelectField
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
        {statusFilter ? (
          <Pressable onPress={() => setStatusFilter('')} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        ) : null}

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, marginTop: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openEdit(item)}>
              <View style={styles.rowInner}>
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="tag" size={18} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.code}</Text>
                  <Text style={styles.meta}>
                    {item.is_active === false ? 'Inactive' : 'Active'} · {item.name} · {discountLabel(item)}
                  </Text>
                  <Text style={styles.meta}>
                    Used {item.redemption_count ?? 0}
                    {item.max_redemptions != null ? `/${item.max_redemptions}` : ''}
                    {item.min_order_total && Number(item.min_order_total) > 0
                      ? ` · min ₹${item.min_order_total}`
                      : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="tag"
                title={coupons.length ? 'No matching coupons' : 'No coupons yet'}
                message={
                  coupons.length
                    ? 'Try another search or clear filters.'
                    : 'Create a code for customers to apply on online checkout.'
                }
                actionLabel={coupons.length ? undefined : 'Add coupon'}
                onAction={coupons.length ? undefined : openCreate}
              />
            ) : null
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.foreground, fontWeight: '600' },
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
