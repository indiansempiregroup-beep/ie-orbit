import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ShopBooksVoucher, ShopCashAccount } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { getApiErrorMessage } from '../../utils/format';
import { voucherLineGrossAmount } from '../../utils/shopOrderBill';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  isVoucherFullyPaid,
  purchaseSourceLabel,
  voucherBalanceDue,
  voucherDisplayPaid,
  voucherDisplayTotal,
  voucherLineProductId,
  voucherPartyLabel,
  voucherPaymentHistory,
} from './shopBooksHelpers';

export function PurchaseInvoiceDetailModal({
  voucher,
  visible,
  onClose,
  onPaid,
  onVoid,
}: {
  voucher: ShopBooksVoucher | null;
  visible: boolean;
  onClose: () => void;
  onPaid?: (voucher: ShopBooksVoucher) => Promise<void> | void;
  onVoid?: (voucher: ShopBooksVoucher) => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lift, driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.88,
    visible && voucher?.id,
  );
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [localVoucher, setLocalVoucher] = useState<ShopBooksVoucher | null>(voucher);
  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [payMode, setPayMode] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    setLocalVoucher(voucher);
    setPayMode(false);
    const due = voucher ? voucherBalanceDue(voucher) : 0;
    setPayAmount(due > 0 ? due.toFixed(2) : '');
  }, [voucher?.id, visible]);

  useEffect(() => {
    if (!visible || !voucher) return;
    setLocalVoucher(voucher);
  }, [visible, voucher]);

  const loadAccounts = useCallback(async () => {
    if (!client || !businessId || !visible) return;
    setLoadingAccounts(true);
    try {
      const response = await client.shop.listCashAccounts({ business_id: businessId });
      const list = (response.data ?? []).filter((account) => account.is_active !== false);
      setAccounts(list);
      setCashAccountId((current) => {
        if (current && list.some((account) => account.id === current)) return current;
        if (voucher?.cash_account && list.some((account) => account.id === voucher.cash_account)) {
          return String(voucher.cash_account);
        }
        return list[0]?.id ?? '';
      });
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to load cash accounts'), 'error');
    } finally {
      setLoadingAccounts(false);
    }
  }, [client, businessId, visible, voucher?.cash_account, toast]);

  useEffect(() => {
    if (!visible) return;
    void loadAccounts();
  }, [visible, loadAccounts]);

  const paid = localVoucher ? isVoucherFullyPaid(localVoucher) : false;
  const voided = isVoidedVoucher(localVoucher?.status);
  const balance = localVoucher ? voucherBalanceDue(localVoucher) : 0;
  const displayPaid = localVoucher ? voucherDisplayPaid(localVoucher) : 0;
  const displayTotal = localVoucher ? voucherDisplayTotal(localVoucher) : 0;
  const lines = Array.isArray(localVoucher?.line_items) ? localVoucher.line_items : [];
  const payments = localVoucher ? voucherPaymentHistory(localVoucher) : [];
  const sourceLabel = localVoucher ? purchaseSourceLabel(localVoucher) : 'Purchase bill';
  const parsedAmount = Number(payAmount.replace(/[^0-9.]/g, ''));
  const canSubmitPay =
    !voided &&
    balance > 0.009 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= balance + 0.009 &&
    Boolean(cashAccountId);

  const gstRows = useMemo(() => {
    if (!localVoucher) return [];
    const rows: Array<{ label: string; value: number }> = [];
    const cgst = Number(localVoucher.cgst_total ?? 0);
    const sgst = Number(localVoucher.sgst_total ?? 0);
    const igst = Number(localVoucher.igst_total ?? 0);
    if (cgst) rows.push({ label: 'CGST', value: cgst });
    if (sgst) rows.push({ label: 'SGST', value: sgst });
    if (igst) rows.push({ label: 'IGST', value: igst });
    if (!rows.length && Number(localVoucher.tax_total ?? 0)) {
      rows.push({ label: 'Tax', value: Number(localVoucher.tax_total) });
    }
    return rows;
  }, [localVoucher]);

  async function submitPayment() {
    if (!client || !localVoucher || !canSubmitPay) return;
    setBusy(true);
    try {
      const response = await client.shop.payVoucher(localVoucher.id, {
        amount: parsedAmount.toFixed(2),
        cash_account_id: cashAccountId,
      });
      setLocalVoucher(response.data);
      setPayMode(false);
      const nextDue = voucherBalanceDue(response.data);
      setPayAmount(nextDue > 0 ? nextDue.toFixed(2) : '');
      toast.push(
        nextDue <= 0.009
          ? `${response.data.voucher_number} marked paid`
          : `Recorded ${formatMoney(parsedAmount)} on ${response.data.voucher_number}`,
        'success',
      );
      await onPaid?.(response.data);
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't record that payment. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!voucher || !localVoucher) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
        <ExpandableSheetView
          onLayout={onSheetLayout}
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              marginBottom: lift,
            },
            sheetMotionStyle,
          ]}
        >
          <View style={styles.hero}>
            <SheetHandle {...handleProps} />
            <View style={styles.heroTop}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.heroNumber}>{localVoucher.voucher_number}</Text>
                <Text style={styles.heroAmount}>{formatMoney(displayTotal)}</Text>
                <Text style={styles.heroKicker} numberOfLines={2}>
                  {[
                    sourceLabel,
                    voucherPartyLabel(localVoucher),
                    formatVoucherDateTime(localVoucher.voucher_date, localVoucher.created_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable style={styles.heroClose} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <View style={styles.heroBadges}>
              <View style={[styles.heroBadge, styles.heroBadgeSource]}>
                <Text style={[styles.heroBadgeText, styles.heroBadgeTextSource]}>{sourceLabel}</Text>
              </View>
              <View
                style={[
                  styles.heroBadge,
                  voided ? styles.heroBadgeVoid : paid ? styles.heroBadgePaid : styles.heroBadgeDue,
                ]}
              >
                <Text
                  style={[
                    styles.heroBadgeText,
                    { color: voided ? '#b91c1c' : paid ? '#047857' : '#92400e' },
                  ]}
                >
                  {voided ? 'Void' : paid ? 'Paid' : `To pay ${formatMoney(balance)}`}
                </Text>
              </View>
              {localVoucher.cash_account_name ? (
                <View style={[styles.heroBadge, styles.heroBadgeMuted]}>
                  <Text style={[styles.heroBadgeText, styles.heroBadgeTextMuted]}>
                    {localVoucher.cash_account_name}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.payStrip}>
            <View style={styles.payCell}>
              <Text style={styles.payLabel}>Paid</Text>
              <Text style={styles.payValue}>{formatMoney(displayPaid)}</Text>
            </View>
            <View style={styles.payDivider} />
            <View style={styles.payCell}>
              <Text style={styles.payLabel}>To pay</Text>
              <Text style={[styles.payValue, balance > 0 && { color: colors.warning }]}>
                {formatMoney(balance)}
              </Text>
            </View>
          </View>

          <ScrollView
            style={[styles.scroll, driven && sheetBodyStyle]}
            contentContainerStyle={styles.stack}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.section}>Items · {lines.length}</Text>
            {lines.length === 0 ? (
              <Text style={styles.meta}>No line items on this bill.</Text>
            ) : (
              lines.map((raw, index) => {
                const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                const name = String(line.name || line.product_name || `Item ${index + 1}`);
                const productId = voucherLineProductId(line);
                const qty = Number(line.qty ?? line.quantity ?? 0);
                const rate = Number(line.rate ?? line.unit_price ?? 0);
                const gst = Number(line.gst_rate ?? line.tax_rate ?? 0);
                const inclusive = Boolean(line.tax_inclusive);
                const lineTotal = voucherLineGrossAmount(line);
                const body = (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, productId ? styles.lineNameLink : null]}>{name}</Text>
                      <Text style={styles.meta}>
                        {qty} × {formatMoney(rate)}
                        {gst ? ` · GST ${gst}%${inclusive ? ' incl.' : ''}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.lineTotal}>{formatMoney(lineTotal)}</Text>
                    {productId ? (
                      <Feather name="chevron-right" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    ) : null}
                  </>
                );
                if (!productId) {
                  return (
                    <View key={`${name}-${index}`} style={styles.lineRow}>
                      {body}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={`${name}-${index}`}
                    style={({ pressed }) => [styles.lineRow, pressed && styles.lineRowPressed]}
                    onPress={() => {
                      onClose();
                      navigation.navigate('ShopProductAdd', { productId });
                    }}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${name}`}
                  >
                    {body}
                  </Pressable>
                );
              })
            )}

            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.meta}>Taxable</Text>
                <Text style={styles.meta}>{formatMoney(localVoucher.subtotal)}</Text>
              </View>
              {gstRows.map((row) => (
                <View key={row.label} style={styles.totalRow}>
                  <Text style={styles.meta}>{row.label}</Text>
                  <Text style={styles.meta}>{formatMoney(row.value)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.payableLabel}>Bill total</Text>
                <Text style={styles.payableValue}>{formatMoney(displayTotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.meta}>Paid</Text>
                <Text style={styles.meta}>{formatMoney(displayPaid)}</Text>
              </View>
              {balance > 0.009 ? (
                <View style={styles.totalRow}>
                  <Text style={styles.dueLabel}>Balance due</Text>
                  <Text style={styles.dueValue}>{formatMoney(balance)}</Text>
                </View>
              ) : null}
            </View>

            {payments.length ? (
              <>
                <Text style={styles.section}>Payments</Text>
                {payments.map((payment, index) => (
                  <View key={`${payment.at}-${index}`} style={styles.historyCard}>
                    <Text style={styles.lineName}>{formatMoney(payment.amount)}</Text>
                    <Text style={styles.meta}>
                      {[
                        payment.cashAccountName,
                        formatVoucherDateTime(payment.at, payment.at),
                        payment.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            {localVoucher.notes ? (
              <>
                <Text style={styles.section}>Notes</Text>
                <Text style={styles.meta}>{localVoucher.notes}</Text>
              </>
            ) : null}

            {payMode ? (
              <View style={styles.payBox}>
                <Text style={styles.lineName}>Record payment</Text>
                <Input
                  label="Amount"
                  value={payAmount}
                  onChangeText={(value) => setPayAmount(value.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  hint={`Due ${formatMoney(balance)}`}
                />
                <Text style={styles.accountLabel}>Pay from</Text>
                {loadingAccounts ? <ActivityIndicator color={colors.primary} /> : null}
                <View style={styles.accountRow}>
                  {accounts.map((account) => {
                    const selected = account.id === cashAccountId;
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => setCashAccountId(account.id)}
                        style={[styles.accountChip, selected && styles.accountChipOn]}
                      >
                        <Text style={[styles.accountChipText, selected && styles.accountChipTextOn]}>
                          {account.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!accounts.length && !loadingAccounts ? (
                  <Text style={styles.meta}>Add a cash or bank account in Books → Cash first.</Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {payMode ? (
              <View style={styles.footerPrimaryRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancel"
                    variant="outline"
                    fullWidth
                    disabled={busy}
                    onPress={() => setPayMode(false)}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Button
                    label={busy ? 'Recording…' : `Pay ${formatMoney(parsedAmount || balance)}`}
                    loading={busy}
                    fullWidth
                    disabled={!canSubmitPay || busy}
                    onPress={() => void submitPayment()}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.footerPrimaryRow}>
                {!voided && balance > 0.009 ? (
                  <View style={styles.footerPayBtn}>
                    <Button label="Record payment" fullWidth onPress={() => setPayMode(true)} />
                  </View>
                ) : null}
                {onVoid && !voided ? (
                  <View style={styles.footerVoidBtn}>
                    <Button
                      label="Void"
                      variant="outline"
                      fullWidth
                      icon="slash"
                      onPress={() => onVoid(localVoucher)}
                    />
                  </View>
                ) : (
                  <Text style={styles.meta}>
                    {voided ? 'This purchase is voided.' : paid ? 'This bill is fully paid.' : ''}
                  </Text>
                )}
              </View>
            )}
          </View>
        </ExpandableSheetView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroKicker: { ...typography.caption, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  heroAmount: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroNumber: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.2,
  },
  heroClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  heroBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  heroBadgePaid: { backgroundColor: 'rgba(220,252,231,0.95)' },
  heroBadgeDue: { backgroundColor: 'rgba(254,243,199,0.95)' },
  heroBadgeVoid: { backgroundColor: 'rgba(254,226,226,0.95)' },
  heroBadgeMuted: { backgroundColor: 'rgba(255,255,255,0.92)' },
  heroBadgeSource: { backgroundColor: '#E0F2FE' },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryForeground },
  heroBadgeTextMuted: { color: colors.foreground },
  heroBadgeTextSource: { color: '#075985' },
  payStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing.lg,
    marginTop: -10,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  payCell: { flex: 1, gap: 2 },
  payDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  payLabel: { ...typography.tiny, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.4 },
  payValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13, marginTop: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  section: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  lineNameLink: { color: colors.primary },
  lineRowPressed: { backgroundColor: colors.tint },
  lineTotal: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  totals: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },
  dueLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.destructive },
  dueValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.destructive },
  historyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    gap: 4,
  },
  payBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  accountLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.foreground },
  accountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountChipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  accountChipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground },
  accountChipTextOn: { color: colors.primaryForeground },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerPrimaryRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'nowrap' },
  footerPayBtn: { flex: 1.6, minWidth: 0 },
  footerVoidBtn: { flexShrink: 0, minWidth: 108 },
});
