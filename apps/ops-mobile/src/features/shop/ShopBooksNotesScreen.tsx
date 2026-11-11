import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
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
import { clampPageSize, toPagedResult, type ShopBooksVoucher } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  voucherAmount,
  voucherPartyLabel,
} from './shopBooksHelpers';
import type { TFunction } from 'i18next';
import { shopListRefreshControl } from './shopRefreshControl';
import { getApiErrorMessage } from '../../utils/format';

type NoteKind = 'credit_note' | 'debit_note';

function noteSettlementLabel(voucher: ShopBooksVoucher, kind: NoteKind, t: TFunction): string {
  if (isVoidedVoucher(voucher.status)) return t('opsApp.shop.notes.voided');
  const paid = voucherAmount(voucher.amount_paid);
  if (paid > 0.009) {
    return kind === 'credit_note' ? t('opsApp.shop.notes.refunded') : t('opsApp.shop.notes.received');
  }
  return t('opsApp.shop.notes.adjusted');
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { lift, driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.88,
    visible && voucher?.id,
  );
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
        if (!cancelled) toast.push(getApiErrorMessage(err, t('opsApp.shop.notes.loadNoteFailed')), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, voucher?.id, client, toast, t]);

  if (!voucher || !localVoucher) return null;

  const voided = isVoidedVoucher(localVoucher.status);
  const settledCash = voucherAmount(localVoucher.amount_paid) > 0.009;
  const settlement = noteSettlementLabel(localVoucher, noteKind, t);
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
        title={isCredit ? t('opsApp.shop.notes.creditNote') : t('opsApp.shop.notes.debitNote')}
      />
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={detailStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
            <ExpandableSheetView
              onLayout={onSheetLayout}
              style={[
                detailStyles.sheet,
                {
                  paddingBottom: Math.max(insets.bottom, spacing.lg),
                  marginBottom: lift,
                },
                sheetMotionStyle,
              ]}
            >
              <View style={detailStyles.hero}>
                <SheetHandle {...handleProps} />
              <View style={detailStyles.heroTop}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={detailStyles.heroKicker}>
                    {[
                      isCredit ? t('opsApp.shop.notes.creditNote') : t('opsApp.shop.notes.debitNote'),
                      formatVoucherDateTime(localVoucher.voucher_date, localVoucher.created_at),
                      voucherPartyLabel(localVoucher),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={detailStyles.heroAmount}>{formatMoney(localVoucher.total)}</Text>
                  <Text style={detailStyles.heroNumber}>{localVoucher.voucher_number}</Text>
                </View>
                <Pressable style={detailStyles.heroClose} onPress={onClose} hitSlop={8} accessibilityLabel={t('opsApp.shop.common.close')}>
                  <Feather name="x" size={18} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={[detailStyles.scroll, driven && sheetBodyStyle]}
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
                  {t('opsApp.shop.notes.supplierLine', {
                    name: localVoucher.supplier_name?.trim() || voucherPartyLabel(localVoucher),
                  })}
                </Text>
              ) : null}

              <Text style={detailStyles.section}>{t('opsApp.shop.notes.lineItems')}</Text>
              {lines.length === 0 ? (
                <Text style={detailStyles.meta}>{t('opsApp.shop.notes.noLineItems')}</Text>
              ) : (
                lines.map((raw, index) => {
                  const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                  const name = String(line.name || line.product_name || t('opsApp.shop.notes.itemN', { n: index + 1 }));
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
                          {gst
                            ? t(inclusive ? 'opsApp.shop.notes.gstLineIncl' : 'opsApp.shop.notes.gstLine', { rate: gst })
                            : ''}
                        </Text>
                      </View>
                      <Text style={detailStyles.lineTotal}>{formatMoney(lineTotal)}</Text>
                    </View>
                  );
                })
              )}

              <View style={detailStyles.totals}>
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>{t('shop.vouchers.summary.subtotal')}</Text>
                  <Text style={detailStyles.meta}>{formatMoney(localVoucher.subtotal)}</Text>
                </View>
                {voucherAmount(localVoucher.discount_total) > 0 ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>{t('shop.vouchers.summary.discount')}</Text>
                    <Text style={detailStyles.meta}>-{formatMoney(localVoucher.discount_total)}</Text>
                  </View>
                ) : null}
                {voucherAmount(localVoucher.igst_total) > 0 ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>{t('shop.vouchers.summary.igst')}</Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.igst_total)}</Text>
                  </View>
                ) : voucherAmount(localVoucher.cgst_total) > 0 ||
                  voucherAmount(localVoucher.sgst_total) > 0 ? (
                  <>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>{t('shop.vouchers.summary.cgst')}</Text>
                      <Text style={detailStyles.meta}>{formatMoney(localVoucher.cgst_total)}</Text>
                    </View>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>{t('shop.vouchers.summary.sgst')}</Text>
                      <Text style={detailStyles.meta}>{formatMoney(localVoucher.sgst_total)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>{t('opsApp.shop.notes.gst')}</Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.tax_total)}</Text>
                  </View>
                )}
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.payableLabel}>{t('opsApp.shop.notes.noteTotal')}</Text>
                  <Text style={detailStyles.payableValue}>{formatMoney(localVoucher.total)}</Text>
                </View>
                {settledCash ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>
                      {isCredit ? t('opsApp.shop.notes.cashRefunded') : t('opsApp.shop.notes.cashReceived')}
                      {localVoucher.cash_account_name ? ` · ${localVoucher.cash_account_name}` : ''}
                    </Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.amount_paid)}</Text>
                  </View>
                ) : (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>
                      {isCredit ? t('opsApp.shop.notes.adjustedReceivable') : t('opsApp.shop.notes.adjustedPayable')}
                    </Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.total)}</Text>
                  </View>
                )}
              </View>

              {localVoucher.notes ? (
                <>
                  <Text style={detailStyles.section}>{t('opsApp.shop.notes.reason')}</Text>
                  <Text style={detailStyles.meta}>{localVoucher.notes}</Text>
                </>
              ) : null}
            </ScrollView>

            <View style={detailStyles.footer}>
              {businessId && !voided ? (
                <Button
                  label={t('opsApp.shop.notes.viewPrintShare')}
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
                  label={isCredit ? t('opsApp.shop.notes.voidCreditNote') : t('opsApp.shop.notes.voidDebitNote')}
                  variant="destructive"
                  fullWidth
                  onPress={() => onVoid(localVoucher)}
                />
              ) : null}
              <Button label={t('opsApp.shop.common.close')} variant="outline" fullWidth onPress={onClose} />
            </View>
          </ExpandableSheetView>
        </View>
      </Modal>
    </>
  );
}

export function ShopBooksNotesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [noteKind, setNoteKind] = useState<NoteKind>('credit_note');
  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [noteKind],
  });
  const [selected, setSelected] = useState<ShopBooksVoucher | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: noteKind })}
          accessibilityRole="button"
          accessibilityLabel={
            noteKind === 'credit_note'
              ? t('opsApp.shop.notes.newCreditNote')
              : t('opsApp.shop.notes.newDebitNote')
          }
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, noteKind, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const vouchersRes = await client.shop.listVouchers({
        business_id: businessId,
        type: noteKind,
        q,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(vouchersRes, pageSize);
      setVouchers(page.items);
      setPageMeta(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.notes.loadFailed'));
      setVouchers([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, noteKind, q, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = vouchers;

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
    const cashLabel =
      noteKind === 'credit_note' ? t('opsApp.shop.notes.refunded') : t('opsApp.shop.notes.cash');
    return [
      { label: t('opsApp.shop.documents.total'), value: formatMoney(total), hint: String(count) },
      { label: t('opsApp.shop.notes.adjusted'), value: formatMoney(adjusted) },
      { label: cashLabel, value: formatMoney(cash), tone: 'paid' as const },
    ];
  }, [filtered, noteKind, t]);

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert(
      t('opsApp.shop.notes.voidTitle'),
      t('opsApp.shop.notes.voidConfirm', { number: voucher.voucher_number }),
      [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('opsApp.shop.notes.void'),
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push(t('opsApp.shop.notes.noteVoided'), 'success');
            setSelected(null);
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : t('opsApp.shop.notes.voidFailed'), 'error');
          }
        },
      },
      ],
    );
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
            label={t('opsApp.shop.notes.creditNote')}
            active={noteKind === 'credit_note'}
            onPress={() => {
              setNoteKind('credit_note');
              setSelected(null);
            }}
          />
          <Chip
            label={t('opsApp.shop.notes.debitNote')}
            active={noteKind === 'debit_note'}
            onPress={() => {
              setNoteKind('debit_note');
              setSelected(null);
            }}
          />
        </View>
        <VoucherSummaryCards metrics={summaryMetrics} />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('opsApp.shop.notes.searchPlaceholder')} style={styles.search} />
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
            const settlement = noteSettlementLabel(item, noteKind, t);
            return (
              <BooksDocumentRow
                title={
                  voucherPartyLabel(item) === '—'
                    ? noteKind === 'credit_note'
                      ? t('opsApp.shop.common.customer')
                      : t('opsApp.shop.common.supplier')
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
                actionLabel={!voided ? t('opsApp.shop.notes.void') : undefined}
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
                    ? t('opsApp.shop.notes.noMatching')
                    : noteKind === 'credit_note'
                      ? t('opsApp.shop.notes.noCreditYet')
                      : t('opsApp.shop.notes.noDebitYet')
                }
                message={
                  noteKind === 'credit_note'
                    ? t('opsApp.shop.notes.creditEmpty')
                    : t('opsApp.shop.notes.debitEmpty')
                }
                actionLabel={
                  noteKind === 'credit_note'
                    ? t('opsApp.shop.notes.newCreditNote')
                    : t('opsApp.shop.notes.newDebitNote')
                }
                onAction={() => navigation.navigate('ShopPos', { mode: noteKind })}
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filtered.length}
              label={t('opsApp.shop.notes.paginationLabel', { defaultValue: 'notes' })}
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
