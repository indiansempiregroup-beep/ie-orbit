import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { ShopCoupon } from '@ie-platform/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

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

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(coupon: ShopCoupon) {
    setEditingId(coupon.id);
    setForm(couponToForm(coupon));
    setShowForm(true);
  }

  async function save() {
    if (!client || !businessId) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast.push('Code and name are required', 'error');
      return;
    }
    setBusy(true);
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
        toast.push('Coupon updated', 'success');
      } else {
        await client.shop.createCoupon(payload);
        toast.push('Coupon created', 'success');
      }
      resetForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save coupon', 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(coupon: ShopCoupon) {
    Alert.alert('Delete coupon', `Remove ${coupon.code}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!client) return;
            try {
              await client.shop.deleteCoupon(coupon.id);
              toast.push('Coupon deleted', 'success');
              await load();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : 'Unable to delete', 'error');
            }
          })();
        },
      },
    ]);
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        showForm ? (
          <View style={styles.footer}>
            <Button
              label={busy ? 'Saving…' : editingId ? 'Update coupon' : 'Create coupon'}
              fullWidth
              loading={busy}
              onPress={() => void save()}
            />
            <Button label="Cancel" variant="outline" fullWidth onPress={resetForm} />
          </View>
        ) : (
          <Button label="Add coupon" fullWidth onPress={startCreate} />
        )
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Coupons</Text>
      <Text style={styles.help}>Codes customers can apply on pickup and delivery checkout.</Text>

      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit coupon' : 'New coupon'}</Text>
          <TextInput
            style={styles.input}
            value={form.code}
            onChangeText={(code) => setForm((current) => ({ ...current, code: code.toUpperCase() }))}
            placeholder="SAVE10"
            autoCapitalize="characters"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(name) => setForm((current) => ({ ...current, name }))}
            placeholder="Name"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            placeholder="Description (optional)"
            placeholderTextColor={colors.mutedForeground}
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
          <TextInput
            style={styles.input}
            value={form.discountValue}
            onChangeText={(discountValue) => setForm((current) => ({ ...current, discountValue }))}
            placeholder={form.discountType === 'percent' ? 'Percent' : 'Amount'}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.minOrder}
            onChangeText={(minOrder) => setForm((current) => ({ ...current, minOrder }))}
            placeholder="Min. order (optional)"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.maxDiscount}
            onChangeText={(maxDiscount) => setForm((current) => ({ ...current, maxDiscount }))}
            placeholder="Max discount cap (optional)"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.startsAt}
            onChangeText={(startsAt) => setForm((current) => ({ ...current, startsAt }))}
            placeholder="Starts YYYY-MM-DD (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.endsAt}
            onChangeText={(endsAt) => setForm((current) => ({ ...current, endsAt }))}
            placeholder="Ends YYYY-MM-DD (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.maxRedemptions}
            onChangeText={(maxRedemptions) => setForm((current) => ({ ...current, maxRedemptions }))}
            placeholder="Total uses (blank = unlimited)"
            keyboardType="number-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={form.perCustomer}
            onChangeText={(perCustomer) => setForm((current) => ({ ...current, perCustomer }))}
            placeholder="Uses per customer (blank = unlimited)"
            keyboardType="number-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>First order only</Text>
            <Switch
              value={form.firstOrderOnly}
              onValueChange={(firstOrderOnly) => setForm((current) => ({ ...current, firstOrderOnly }))}
            />
          </View>
          <View style={styles.chipRow}>
            <Chip
              label="Active"
              active={form.isActive}
              onPress={() => setForm((current) => ({ ...current, isActive: true }))}
            />
            <Chip
              label="Inactive"
              active={!form.isActive}
              onPress={() => setForm((current) => ({ ...current, isActive: false }))}
            />
          </View>
        </View>
      ) : null}

      {coupons.map((coupon) => (
        <View key={coupon.id} style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{coupon.code}</Text>
            <Text style={styles.meta}>
              {coupon.name} · {discountLabel(coupon)} · {coupon.is_active === false ? 'Inactive' : 'Active'}
            </Text>
            <Text style={styles.meta}>Used {coupon.redemption_count ?? 0}</Text>
          </View>
          <View style={styles.rowActions}>
            <Pressable onPress={() => startEdit(coupon)} hitSlop={8}>
              <Feather name="edit-2" size={18} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => confirmDelete(coupon)} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.destructive} />
            </Pressable>
          </View>
        </View>
      ))}

      {!coupons.length && !showForm ? (
        <EmptyState
          icon="tag"
          title="No coupons yet"
          message="Create a code for customers to apply on online checkout."
          actionLabel="Add coupon"
          onAction={startCreate}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  error: { color: colors.destructive },
  footer: { gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.bodySemi, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.foreground, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  rowActions: { flexDirection: 'row', gap: 12 },
});
