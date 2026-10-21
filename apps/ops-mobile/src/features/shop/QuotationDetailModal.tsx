import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ShopQuotation } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useToast } from '../../contexts/ToastContext';
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatMoney, formatVoucherDate, formatVoucherDateTime, voucherLineProductId } from './shopBooksHelpers';

const STATUS_CHIPS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
] as const;

function canEditQuotation(quotation: ShopQuotation | null) {
  if (!quotation) return false;
  const status = (quotation.status || '').toLowerCase();
  return status !== 'converted' && !quotation.converted_order;
}

function canConvertQuotation(quotation: ShopQuotation | null) {
  if (!quotation || !canEditQuotation(quotation)) return false;
  const status = (quotation.status || '').toLowerCase();
  return status !== 'rejected' && status !== 'expired';
}

function quoteLineTotal(line: Record<string, unknown>) {
  const stored = Number(line.line_total ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const qty = Number(line.quantity ?? line.qty ?? 0);
  const rate = Number(line.unit_price ?? line.rate ?? 0);
  const gst = Number(line.tax_rate ?? line.gst_rate ?? 0);
  const base = qty * rate;
  return base + base * (gst / 100);
}

export function QuotationDetailModal({
  quotation,
  visible,
  converting = false,
  onClose,
  onEdit,
  onConvert,
  onUpdated,
}: {
  quotation: ShopQuotation | null;
  visible: boolean;
  converting?: boolean;
  onClose: () => void;
  onEdit?: (quote: ShopQuotation) => void;
  onConvert?: (quote: ShopQuotation) => void;
  onUpdated?: (quote: ShopQuotation) => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lift, driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.88,
    visible && quotation?.id,
  );
  const client = useOpsClient();
  const toast = useToast();

  const [localQuote, setLocalQuote] = useState<ShopQuotation | null>(quotation);
  const [busyStatus, setBusyStatus] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalQuote(quotation);
  }, [quotation?.id, visible]);

  useEffect(() => {
    if (!visible || !quotation?.id || !client) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await client.shop.getQuotation(quotation.id);
        if (!cancelled && response.data) {
          setLocalQuote(response.data);
          onUpdated?.(response.data);
        }
      } catch {
        if (!cancelled) setLocalQuote(quotation);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, quotation?.id, client]);

  const editable = canEditQuotation(localQuote);
  const convertible = canConvertQuotation(localQuote);
  const status = (localQuote?.status || '').toLowerCase();
  const converted = Boolean(localQuote?.converted_order || status === 'converted');
  const lines = Array.isArray(localQuote?.line_items) ? localQuote.line_items : [];
  const customerName = localQuote?.customer_name?.trim() || (localQuote?.customer ? 'Customer' : 'No customer');

  const statusLabel = useMemo(() => {
    if (converted) return 'Converted';
    const match = STATUS_CHIPS.find((item) => item.value === status);
    return match?.label || localQuote?.status || 'Draft';
  }, [converted, status, localQuote?.status]);

  async function changeStatus(next: string) {
    if (!client || !localQuote || !editable || next === status || busyStatus) return;
    setBusyStatus(true);
    try {
      const response = await client.shop.updateQuotation(localQuote.id, { status: next });
      setLocalQuote(response.data);
      onUpdated?.(response.data);
      toast.push(`Marked ${response.data.quotation_number} as ${next}`, 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't update this quotation."), 'error');
    } finally {
      setBusyStatus(false);
    }
  }

  if (!quotation || !localQuote) return null;

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
                <Text style={styles.heroNumber}>{localQuote.quotation_number}</Text>
                <Text style={styles.heroAmount}>{formatMoney(localQuote.total)}</Text>
                <Text style={styles.heroKicker} numberOfLines={2}>
                  {[
                    customerName,
                    localQuote.created_at
                      ? formatVoucherDateTime(localQuote.created_at, localQuote.created_at)
                      : null,
                    localQuote.valid_until ? `Valid till ${formatVoucherDate(localQuote.valid_until)}` : null,
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
              <View style={[styles.heroBadge, converted ? styles.heroBadgePaid : styles.heroBadgeDue]}>
                <Text style={[styles.heroBadgeText, { color: converted ? '#047857' : '#92400e' }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            style={[styles.scroll, driven && sheetBodyStyle]}
            contentContainerStyle={styles.stack}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? <ActivityIndicator color={colors.primary} /> : null}

            {editable ? (
              <>
                <Text style={styles.section}>Status</Text>
                <View style={styles.chipRow}>
                  {STATUS_CHIPS.map((item) => (
                    <Chip
                      key={item.value}
                      label={item.label}
                      active={status === item.value}
                      onPress={() => void changeStatus(item.value)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.meta}>
                {converted ? 'This quotation has been converted to a sale.' : `Status: ${statusLabel}`}
              </Text>
            )}

            <Text style={styles.section}>Items · {lines.length}</Text>
            {lines.length === 0 ? (
              <Text style={styles.meta}>No line items on this quotation.</Text>
            ) : (
              lines.map((raw, index) => {
                const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                const name = String(line.name || line.product_name || `Item ${index + 1}`);
                const productId = voucherLineProductId(line);
                const qty = Number(line.quantity ?? line.qty ?? 0);
                const rate = Number(line.unit_price ?? line.rate ?? 0);
                const gst = Number(line.tax_rate ?? line.gst_rate ?? 0);
                const body = (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, productId ? styles.lineNameLink : null]}>{name}</Text>
                      <Text style={styles.meta}>
                        {qty} × {formatMoney(rate)}
                        {gst ? ` · GST ${gst}%` : ''}
                      </Text>
                    </View>
                    <Text style={styles.lineTotal}>{formatMoney(quoteLineTotal(line))}</Text>
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
                <Text style={styles.meta}>Subtotal</Text>
                <Text style={styles.meta}>{formatMoney(localQuote.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.meta}>Tax</Text>
                <Text style={styles.meta}>{formatMoney(localQuote.tax_total)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.payableLabel}>Total</Text>
                <Text style={styles.payableValue}>{formatMoney(localQuote.total)}</Text>
              </View>
            </View>

            {localQuote.notes ? (
              <>
                <Text style={styles.section}>Notes</Text>
                <Text style={styles.meta}>{localQuote.notes}</Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {editable ? (
              <View style={styles.footerPrimaryRow}>
                {onEdit ? (
                  <View style={styles.footerEditBtn}>
                    <Button
                      label="Edit"
                      fullWidth
                      icon="edit-2"
                      onPress={() => onEdit(localQuote)}
                    />
                  </View>
                ) : null}
                {onConvert && convertible ? (
                  <View style={styles.footerConvertBtn}>
                    <Button
                      label={converting ? 'Converting…' : 'Convert to sale'}
                      variant="outline"
                      fullWidth
                      loading={converting}
                      disabled={converting}
                      onPress={() => onConvert(localQuote)}
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.meta}>Converted quotations cannot be edited.</Text>
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
  heroBadgeText: { fontSize: 11, fontWeight: '700' },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerPrimaryRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'nowrap' },
  footerEditBtn: { flex: 1, minWidth: 0 },
  footerConvertBtn: { flex: 1.4, minWidth: 0 },
});
