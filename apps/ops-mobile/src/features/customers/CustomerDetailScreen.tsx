import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerBorrowLedgerEntry } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ScreenState } from '../../components/ScreenState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useCustomer, useReviews } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatCustomerAddressLabel } from '../../utils/customerAddress';
import { formatRelativeTime, getApiErrorMessage } from '../../utils/format';
import { hasShopie } from '../../utils/products';
import type { RootStackParamList } from '../../navigation/types';

type PayMethod = 'cash' | 'upi' | 'card';

export function CustomerDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { activeBusiness } = useWorkspace();
  const showGstFields = hasShopie(activeBusiness?.product_subscriptions);
  const { customer, loading, reload } = useCustomer(route.params.customerId);
  const { reviews } = useReviews(route.params.customerId);
  const mutations = useCustomerMutations();
  const [ledger, setLedger] = useState<CustomerBorrowLedgerEntry[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const loadBorrow = useCallback(async () => {
    if (!client) return;
    try {
      const response = await client.customers.listBorrowLedger(route.params.customerId);
      setLedger(response.data ?? []);
    } catch {
      setLedger([]);
    }
  }, [client, route.params.customerId]);

  useEffect(() => {
    void loadBorrow();
  }, [loadBorrow, customer?.borrow_balance_due]);

  if (loading || !customer) {
    return <ScreenState loading={loading} empty={!loading && !customer} emptyMessage="Customer not found." />;
  }

  const isArchived = customer.status === 'archived' || customer.status === 'inactive';
  const name =
    customer.display_name?.trim() ||
    customer.full_name?.trim() ||
    `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
    customer.email ||
    'Customer';
  const balanceDue = Number(customer.borrow_balance_due ?? 0);
  const currency = customer.borrow_currency || 'INR';

  async function recordPayment() {
    if (!client || balanceDue <= 0) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.push('Enter a valid payment amount.', 'error');
      return;
    }
    if (amount > balanceDue) {
      toast.push(`Amount cannot exceed outstanding ${balanceDue.toFixed(2)}.`, 'error');
      return;
    }
    setPaying(true);
    try {
      await client.customers.recordBorrowPayment(customer.id, {
        amount,
        payment_method: payMethod,
        notes: payNotes.trim(),
      });
      toast.push(`Payment of ${amount.toFixed(2)} recorded.`, 'success');
      setPayAmount('');
      setPayNotes('');
      await reload();
      await loadBorrow();
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to record payment.'), 'error');
    } finally {
      setPaying(false);
    }
  }

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{customer.status ?? 'Active'}</Text>
          </View>
        </View>
        <DetailRow label="Email" value={customer.email ?? '—'} />
        <DetailRow label="Phone" value={customer.phone_number ?? '—'} />
        {showGstFields ? (
          <DetailRow label="GSTIN" value={customer.gstin?.trim() || '—'} />
        ) : null}
        <DetailRow label="Address" value={formatCustomerAddressLabel(customer)} />
      </Card>

      <Card>
        <SectionHeader title="Borrow / credit" />
        <Text style={styles.balanceLabel}>Outstanding</Text>
        <Text style={[styles.balanceValue, balanceDue > 0 && styles.balanceDue]}>
          {currency} {balanceDue.toFixed(2)}
        </Text>
        {balanceDue > 0 ? (
          <View style={styles.payBox}>
            <Text style={styles.payHint}>Record a repayment (full or partial). Bill status is unchanged.</Text>
            <TextInput
              style={styles.input}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder={`Amount (max ${balanceDue.toFixed(2)})`}
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.methodRow}>
              {(['cash', 'upi', 'card'] as const).map((method) => (
                <Pressable
                  key={method}
                  style={[styles.chip, payMethod === method && styles.chipActive]}
                  onPress={() => setPayMethod(method)}
                >
                  <Text style={styles.chipText}>{method.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder="Note (optional)"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.methodRow}>
              <Pressable style={styles.quickBtn} onPress={() => setPayAmount(balanceDue.toFixed(2))}>
                <Text style={styles.quickBtnText}>Full balance</Text>
              </Pressable>
            </View>
            <Button label={paying ? 'Saving…' : 'Record payment'} fullWidth loading={paying} onPress={() => void recordPayment()} />
          </View>
        ) : (
          <Text style={styles.payHint}>No outstanding borrow amount.</Text>
        )}
        {ledger.length ? (
          <View style={styles.ledger}>
            <Text style={styles.ledgerTitle}>Recent activity</Text>
            {ledger.slice(0, 8).map((entry) => (
              <View key={entry.id} style={styles.ledgerRow}>
                <Text style={styles.ledgerMain}>
                  {entry.entry_type === 'payment' ? 'Payment' : entry.entry_type === 'charge' ? 'Borrow' : entry.entry_type}
                  {' · '}
                  {Number(entry.amount).toFixed(2)}
                  {entry.order_number ? ` · ${entry.order_number}` : ''}
                </Text>
                <Text style={styles.ledgerMeta}>
                  Balance {Number(entry.balance_after).toFixed(2)}
                  {entry.created_at ? ` · ${formatRelativeTime(entry.created_at)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {reviews.length ? (
        <Card>
          <SectionHeader title="Reviews" />
          {reviews.slice(0, 5).map((review) => (
            <Pressable
              key={review.id}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: review.booking_id })}
              style={styles.reviewRow}
            >
              <Text style={styles.rating}>
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </Text>
              <Text style={styles.reviewService}>{review.service_name || 'Appointment'}</Text>
              {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
              <Text style={styles.reviewMeta}>
                #{review.booking_number || review.booking_id.slice(0, 8)} · {formatRelativeTime(review.created_at)}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Button
        label="Edit customer"
        fullWidth
        onPress={() => navigation.navigate('CustomerForm', { customerId: customer.id })}
      />
      <Button
        label="New booking"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { customerId: customer.id })}
      />
      <Button
        label={isArchived ? 'Reactivate customer' : 'Deactivate customer'}
        variant={isArchived ? 'outline' : 'destructive'}
        fullWidth
        onPress={async () => {
          if (isArchived) await mutations.restore(customer.id);
          else await mutations.archive(customer.id);
          await reload();
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  heroCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, textTransform: 'capitalize' },
  balanceLabel: { ...typography.caption, color: colors.mutedForeground },
  balanceValue: { ...typography.title, fontSize: 28, color: colors.foreground, marginTop: 4, marginBottom: spacing.md },
  balanceDue: { color: colors.destructive },
  payBox: { gap: spacing.sm, marginBottom: spacing.md },
  payHint: { ...typography.caption, color: colors.mutedForeground, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.muted },
  chipText: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
  quickBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  ledger: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  ledgerTitle: { ...typography.label, color: colors.foreground, marginBottom: spacing.sm },
  ledgerRow: { marginBottom: spacing.sm },
  ledgerMain: { ...typography.body, color: colors.foreground },
  ledgerMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  reviewRow: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rating: { ...typography.title, fontSize: 16, color: colors.primary },
  reviewService: { ...typography.label, color: colors.foreground, marginTop: 4 },
  reviewComment: { ...typography.body, color: colors.mutedForeground, marginTop: 4, lineHeight: 20 },
  reviewMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
