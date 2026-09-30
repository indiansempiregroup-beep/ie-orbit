import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useSheetKeyboardLayout } from '../../hooks/useSheetKeyboardLayout';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { BooksDocumentRow } from './BooksDocumentRow';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { groupedListProps } from '../../components/ui/GroupedList';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  voucherAmount,
  voucherPartyLabel,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { getApiErrorMessage } from '../../utils/format';

type NoteKind = 'credit_note' | 'debit_note';

function noteSettlementLabel(voucher: ShopBooksVoucher, kind: NoteKind): string {
  if (isVoidedVoucher(voucher.status)) return 'Void';
  const paid = voucherAmount(voucher.amount_paid);
  if (paid > 0.009) return kind === 'credit_note' ? 'Refunded' : 'Received';
  return 'Adjusted';
}

function noteSettlementKind(
  voucher: ShopBooksVoucher,
): 'paid' | 'due' | 'void' | 'neutral' {
  if (isVoidedVoucher(voucher.status)) return 'void';
  return voucherAmount(voucher.amount_paid) > 0.009 ? 'paid' : 'neutral';
}

function NoteDetailModal({
  voucher,
  noteKind,
  visible,
  onClose,
  onVoid,
}: {
  voucher: ShopBooksVoucher | null;
  noteKind: NoteKind;
  visible: boolean;
  onClose: () => void;
  onVoid: (voucher: ShopBooksVoucher) => void;
}) {
  const insets = useSafeAreaInsets();
  const { lift, maxHeight } = useSheetKeyboardLayout(0.88);
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [localVoucher, setLocalVoucher] = useState<ShopBooksVoucher | null>(voucher);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalVoucher(voucher);
  }, [voucher?.id, visible]);

  useEffect(() => {
    if (!visible || !voucher || !client) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await client.shop.getVoucher(voucher.id);
        if (!cancelled && res.data) setLocalVoucher(res.data);
      } catch (err) {
        if (!cancelled) toast.push(getApiErrorMessage(err, 'Unable to load note'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, voucher?.id, client, toast]);

  if (!voucher || !localVoucher) return null;

  const voided = isVoidedVoucher(localVoucher.status);
  const settledCash = voucherAmount(localVoucher.amount_paid) > 0.009;
  const settlement = noteSettlementLabel(localVoucher, noteKind);
  const lines = Array.isArray(localVoucher.line_items) ? localVoucher.line_items : [];
  const meta =
    localVoucher.metadata && typeof localVoucher.metadata === 'object' ? localVoucher.metadata : {};
  const gstin =
    typeof meta.customer_gstin === 'string'
      ? meta.customer_gstin
      : typeof meta.supplier_gstin === 'string'
        ? meta.supplier_gstin
        : '';
  const isCredit = noteKind === 'credit_note';

  return (
    <>
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={isCredit ? 'Credit note' : 'Debit note'}
      />
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={detailStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
          <View
            style={[
              detailStyles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg), marginBottom: lift, maxHeight },
            ]}
          >
            <View style={detailStyles.hero}>
              <View style={detailStyles.handle} />
              <View style={detailStyles.heroTop}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={detailStyles.heroKicker}>
                    {[
                      isCredit ? 'Credit note' : 'Debit note',
                      formatVoucherDateTime(localVoucher.voucher_date, localVoucher.created_at),
                      voucherPartyLabel(localVoucher),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={detailStyles.heroAmount}>{formatMoney(localVoucher.total)}</Text>
                  <Text style={detailStyles.heroNumber}>{localVoucher.voucher_number}</Text>
                </View>
                <Pressable style={detailStyles.heroClose} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                  <Feather name="x" size={18} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={detailStyles.scroll}
              contentContainerStyle={detailStyles.stack}
              keyboardShouldPersistTaps="handled"
            >
              <View style={detailStyles.badgeRow}>
                <View
                  style={[
                    detailStyles.badge,
                    {
                      backgroundColor: voided
                        ? colors.destructiveSoft
                        : settledCash
                          ? colors.successSoft
                          : colors.tint,
                    },
                  ]}
                >
                  <Text
                    style={[
                      detailStyles.badgeText,
                      {
                        color: voided ? '#B91C1C' : settledCash ? '#047857' : colors.primary,
                      },
                    ]}
                  >
                    {settlement}
                  </Text>
                </View>
                {gstin ? (
                  <View style={[detailStyles.badge, { backgroundColor: colors.tint }]}>
                    <Text style={[detailStyles.badgeText, { color: colors.primary }]}>B2B · {gstin}</Text>
                  </View>
                ) : (
                  <View style={[detailStyles.badge, { backgroundColor: colors.background }]}>
                    <Text style={[detailStyles.badgeText, { color: colors.mutedForeground }]}>B2C</Text>
                  </View>
                )}
              </View>

              {loading ? <ActivityIndicator color={colors.primary} /> : null}

              {isCredit && localVoucher.customer ? (
                <CustomerDetailLinkCard
                  customerId={String(localVoucher.customer)}
                  customerName={localVoucher.customer_name?.trim() || voucherPartyLabel(localVoucher)}
                  onBeforeNavigate={onClose}
                />
              ) : null}
              {!isCredit ? (
                <Text style={detailStyles.meta}>
                  Supplier: {localVoucher.supplier_name?.trim() || voucherPartyLabel(localVoucher)}
                </Text>
              ) : null}

              <Text style={detailStyles.section}>Line items</Text>
              {lines.length === 0 ? (
                <Text style={detailStyles.meta}>No line items on this note.</Text>
              ) : (
                lines.map((raw, index) => {
                  const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                  const name = String(line.name || line.product_name || `Item ${index + 1}`);
                  const qty = Number(line.qty ?? line.quantity ?? 0);
                  const rate = Number(line.rate ?? line.unit_price ?? 0);
                  const gst = Number(line.gst_rate ?? line.tax_rate ?? 0);
                  const inclusive = Boolean(line.tax_inclusive);
                  const lineTotal = Number(line.total ?? qty * rate);
                  return (
                    <View key={`${name}-${index}`} style={detailStyles.lineRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={detailStyles.lineName}>{name}</Text>
                        <Text style={detailStyles.meta}>
                          {qty} × {formatMoney(rate)}
                          {gst ? ` · GST ${gst}%${inclusive ? ' incl.' : ''}` : ''}
                        </Text>
                      </View>
                      <Text style={detailStyles.lineTotal}>{formatMoney(lineTotal)}</Text>
                    </View>
                  );
                })
              )}

              <View style={detailStyles.totals}>
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>Subtotal</Text>
                  <Text style={detailStyles.meta}>{formatMoney(localVoucher.subtotal)}</Text>
                </View>
                {voucherAmount(localVoucher.discount_total) > 0 ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>Discount</Text>
                    <Text style={detailStyles.meta}>-{formatMoney(localVoucher.discount_total)}</Text>
                  </View>
                ) : null}
                {voucherAmount(localVoucher.igst_total) > 0 ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>IGST</Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.igst_total)}</Text>
                  </View>
                ) : voucherAmount(localVoucher.cgst_total) > 0 ||
                  voucherAmount(localVoucher.sgst_total) > 0 ? (
                  <>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>CGST</Text>
                      <Text style={detailStyles.meta}>{formatMoney(localVoucher.cgst_total)}</Text>
                    </View>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>SGST</Text>
                      <Text style={detailStyles.meta}>{formatMoney(localVoucher.sgst_total)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>GST</Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.tax_total)}</Text>
                  </View>
                )}
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.payableLabel}>Note total</Text>
                  <Text style={detailStyles.payableValue}>{formatMoney(localVoucher.total)}</Text>
                </View>
                {settledCash ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>
                      {isCredit ? 'Cash refunded' : 'Cash received'}
                      {localVoucher.cash_account_name ? ` · ${localVoucher.cash_account_name}` : ''}
                    </Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.amount_paid)}</Text>
                  </View>
                ) : (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>
                      {isCredit ? 'Adjusted against receivable' : 'Adjusted against payable'}
                    </Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.total)}</Text>
                  </View>
                )}
              </View>

              {localVoucher.notes ? (
                <>
                  <Text style={detailStyles.section}>Reason</Text>
                  <Text style={detailStyles.meta}>{localVoucher.notes}</Text>
                </>
              ) : null}
            </ScrollView>

            <View style={detailStyles.footer}>
              {businessId && !voided ? (
                <Button
                  label="View / Print / Share"
                  variant="secondary"
                  fullWidth
                  onPress={() =>
                    setDocActions({
                      kind: noteKind,
                      id: localVoucher.id,
                      number: localVoucher.voucher_number,
                      businessId,
                      phone: localVoucher.customer_phone || '',
                      email: localVoucher.customer_email || '',
                    })
                  }
                />
              ) : null}
              {!voided ? (
                <Button
                  label={isCredit ? 'Void credit note' : 'Void debit note'}
                  variant="destructive"
                  fullWidth
                  onPress={() => onVoid(localVoucher)}
                />
              ) : null}
              <Button label="Close" variant="outline" fullWidth onPress={onClose} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function ShopBooksNotesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [noteKind, setNoteKind] = useState<NoteKind>('credit_note');
  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ShopBooksVoucher | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: noteKind })}
          accessibilityRole="button"
          accessibilityLabel={noteKind === 'credit_note' ? 'New credit note' : 'New debit note'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, noteKind]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const vouchersRes = await client.shop.listVouchers({ business_id: businessId, type: noteKind });
      setVouchers(vouchersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, noteKind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = vouchers.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.voucher_number, voucherPartyLabel(item), String(item.total), item.voucher_date ?? '']
      .join(' ')
      .toLowerCase()
      .includes(term);
  });

  const summaryMetrics = useMemo(() => {
    let total = 0;
    let adjusted = 0;
    let cash = 0;
    let count = 0;
    for (const voucher of filtered) {
      if (isVoidedVoucher(voucher.status)) continue;
      const amount = voucherAmount(voucher.total);
      const paid = voucherAmount(voucher.amount_paid);
      total += amount;
      count += 1;
      if (paid > 0.009) cash += amount;
      else adjusted += amount;
    }
    const cashLabel = noteKind === 'credit_note' ? 'Refunded' : 'Cash';
    return [
      { label: 'Total', value: formatMoney(total), hint: String(count) },
      { label: 'Adjusted', value: formatMoney(adjusted) },
      { label: cashLabel, value: formatMoney(cash), tone: 'paid' as const },
    ];
  }, [filtered, noteKind]);

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void note', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Note voided', 'success');
            setSelected(null);
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void note', 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <NoteDetailModal
        voucher={selected}
        noteKind={noteKind}
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        onVoid={onVoid}
      />
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.chipRow}>
          <Chip
            label="Credit note"
            active={noteKind === 'credit_note'}
            onPress={() => {
              setNoteKind('credit_note');
              setSelected(null);
            }}
          />
          <Chip
            label="Debit note"
            active={noteKind === 'debit_note'}
            onPress={() => {
              setNoteKind('debit_note');
              setSelected(null);
            }}
          />
        </View>
        <VoucherSummaryCards metrics={summaryMetrics} />
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search notes" style={styles.search} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const voided = isVoidedVoucher(item.status);
            const settlement = noteSettlementLabel(item, noteKind);
            return (
              <BooksDocumentRow
                title={
                  voucherPartyLabel(item) === '—'
                    ? noteKind === 'credit_note'
                      ? 'Customer'
                      : 'Supplier'
                    : voucherPartyLabel(item)
                }
                amount={formatMoney(item.total)}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={settlement}
                badgeKind={noteSettlementKind(item)}
                icon={noteKind === 'credit_note' ? 'minus-circle' : 'plus-circle'}
                iconTone={voided ? 'rose' : noteKind === 'credit_note' ? 'coral' : 'violet'}
                dimmed={voided}
                onPress={() => setSelected(item)}
                actionLabel={!voided ? 'Void' : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="file-minus"
                title={
                  search
                    ? 'No matching notes'
                    : noteKind === 'credit_note'
                      ? 'No credit notes yet'
                      : 'No debit notes yet'
                }
                message={
                  noteKind === 'credit_note'
                    ? 'Issue credit notes against customer sales for returns or adjustments.'
                    : 'Issue debit notes against supplier purchases for returns or adjustments.'
                }
                actionLabel={noteKind === 'credit_note' ? 'New credit note' : 'New debit note'}
                onAction={() => navigation.navigate('ShopPos', { mode: noteKind })}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  search: { marginBottom: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});

const detailStyles = StyleSheet.create({
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
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroKicker: { ...typography.caption, color: 'rgba(255,255,255,0.78)' },
  heroAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: -0.4,
  },
  heroNumber: { ...typography.label, color: 'rgba(255,255,255,0.88)' },
  heroClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  meta: { color: colors.mutedForeground, fontSize: 13, marginTop: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  section: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground, marginTop: spacing.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
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
  footer: { gap: spacing.sm, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
});
