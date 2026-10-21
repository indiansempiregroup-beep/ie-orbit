import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
import type { ShopReturn } from '@ie-orbit/sdk';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useToast } from '../../contexts/ToastContext';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { formatMoney } from './posPayment';

const MODE_OPTIONS = [
  { value: 'instant', label: 'Instant rider' },
  { value: 'manual', label: 'Manual / courier' },
];

type QuoteSnapshot = {
  available: boolean;
  reason?: string;
  provider_label?: string;
  provider?: string;
  quoted_fee?: string;
  eta_minutes?: number | null;
  refund_total?: string;
  customer_net_refund_if_charged?: string;
  currency?: string;
};

type Props = {
  visible: boolean;
  shopReturn: ShopReturn | null;
  businessId: string;
  onClose: () => void;
  onDone: (updated: ShopReturn) => void;
};

export function ArrangeReturnPickupSheet({
  visible,
  shopReturn,
  businessId,
  onClose,
  onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const { driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.92,
    visible && shopReturn?.id,
  );
  const client = useOpsClient();
  const toast = useToast();
  const [mode, setMode] = useState('instant');
  const [chargeCustomer, setChargeCustomer] = useState(false);
  const [manualFee, setManualFee] = useState('');
  const [notes, setNotes] = useState('');
  const [tracking, setTracking] = useState('');
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !shopReturn) return;
    setMode('instant');
    setChargeCustomer(false);
    setManualFee('');
    setNotes('');
    setTracking('');
    setQuote(null);
    setError(null);
  }, [visible, shopReturn?.id]);

  useEffect(() => {
    if (!visible || !shopReturn || !client || !businessId || mode !== 'instant') {
      return;
    }
    let cancelled = false;
    setQuoteBusy(true);
    setError(null);
    void (async () => {
      try {
        const res = await client.shop.quoteReturnPickup(shopReturn.id, {
          business_id: businessId,
        });
        if (!cancelled) setQuote(res.data as QuoteSnapshot);
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setError(getApiErrorMessage(err, "Couldn't load pickup quote."));
        }
      } finally {
        if (!cancelled) setQuoteBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, shopReturn?.id, mode, client, businessId]);

  async function submit() {
    if (!client || !businessId || !shopReturn) return;
    setBusy(true);
    setError(null);
    try {
      const bearer = chargeCustomer ? 'customer' : 'merchant';
      const res = await client.shop.arrangeReturnPickup(shopReturn.id, {
        business_id: businessId,
        mode,
        charge_bearer: bearer,
        notes: notes.trim() || undefined,
        tracking_number: mode === 'manual' ? tracking.trim() || undefined : undefined,
        fee:
          mode === 'manual' && chargeCustomer && manualFee.trim()
            ? manualFee.trim()
            : undefined,
      });
      const awaiting = String(res.data.status || '').toLowerCase() === 'awaiting_customer';
      toast.push(
        awaiting
          ? 'Sent to customer — waiting for them to accept or cancel.'
          : mode === 'instant'
            ? 'Pickup rider dispatched.'
            : 'Pickup arranged.',
        'success',
      );
      onDone(res.data);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't arrange pickup."));
    } finally {
      setBusy(false);
    }
  }

  const currency = quote?.currency || shopReturn?.currency || 'INR';
  const quoteReady = mode === 'manual' || (quote?.available === true && !quoteBusy);
  const canSubmit =
    !busy &&
    quoteReady &&
    (mode === 'manual' || Boolean(quote?.available));
  const primaryLabel = busy
    ? 'Saving…'
    : chargeCustomer
      ? 'Send for customer approval'
      : mode === 'instant'
        ? 'Dispatch rider'
        : 'Arrange pickup';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <ExpandableSheetView
          onLayout={onSheetLayout}
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
            sheetMotionStyle,
          ]}
        >
          <SheetHandle {...handleProps} tone="muted" />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Arrange return pickup</Text>
              <Text style={styles.subtitle}>
                {shopReturn?.return_number
                  ? `${shopReturn.return_number} · choose rider or courier`
                  : 'Choose rider or courier'}
              </Text>
            </View>
            <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            style={driven ? sheetBodyStyle : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.body}
          >
            <SelectField
              label="How will you collect it?"
              required
              value={mode}
              options={MODE_OPTIONS}
              onChange={(value) => {
                setMode(value);
                setError(null);
              }}
              searchable={false}
            />

            {mode === 'instant' ? (
              <View style={styles.quoteCard}>
                {quoteBusy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : quote?.available ? (
                  <>
                    <Text style={styles.quoteTitle}>
                      {quote.provider_label || quote.provider || 'Rider'} quote
                    </Text>
                    <Text style={styles.quoteFee}>
                      {formatMoney(quote.quoted_fee ?? 0, currency)}
                      {quote.eta_minutes != null ? ` · ~${quote.eta_minutes} min` : ''}
                    </Text>
                    <Text style={styles.meta}>
                      Product refund {formatMoney(quote.refund_total ?? shopReturn?.refund_total ?? 0, currency)}
                    </Text>
                    {chargeCustomer ? (
                      <Text style={styles.meta}>
                        Customer net refund{' '}
                        {formatMoney(
                          quote.customer_net_refund_if_charged ?? 0,
                          currency,
                        )}{' '}
                        (fee deducted)
                      </Text>
                    ) : (
                      <Text style={styles.meta}>Shop pays the pickup fee</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.error}>
                    {quote?.reason
                      ? `Instant pickup unavailable (${String(quote.reason).replace(/_/g, ' ')})`
                      : error || 'Instant pickup quote unavailable.'}
                  </Text>
                )}
              </View>
            ) : null}

            {(mode === 'manual' || quote?.available) ? (
              <View style={styles.switchCard}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.switchLabel}>Charge customer</Text>
                  <Text style={styles.meta}>
                    Customer must accept the fee (or cancel the return) before pickup. Off = shop
                    bears the cost.
                  </Text>
                </View>
                <Switch
                  value={chargeCustomer}
                  onValueChange={setChargeCustomer}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            ) : null}

            {mode === 'manual' ? (
              <>
                {chargeCustomer ? (
                  <Input
                    label="Courier / pickup fee"
                    value={manualFee}
                    onChangeText={setManualFee}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                ) : null}
                <Input
                  label="AWB / tracking number"
                  value={tracking}
                  onChangeText={setTracking}
                  placeholder="Optional"
                  autoCapitalize="characters"
                />
                <Input
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Courier / self-collect notes"
                />
              </>
            ) : (
              <Input
                label="Notes (optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Gate code, call on arrival…"
              />
            )}

            {error && mode === 'manual' ? <Text style={styles.error}>{error}</Text> : null}
            {error && mode === 'instant' && quote?.available ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label="Cancel"
              variant="soft"
              icon="x"
              disabled={busy}
              style={styles.footerBtn}
              onPress={onClose}
            />
            <Button
              label={primaryLabel}
              icon={chargeCustomer ? 'send' : mode === 'instant' ? 'truck' : 'send'}
              loading={busy}
              disabled={!canSubmit}
              style={styles.footerPrimary}
              onPress={() => void submit()}
            />
          </View>
        </ExpandableSheetView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
    paddingHorizontal: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  title: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.foreground },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.mutedForeground },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  body: { gap: spacing.md, paddingBottom: spacing.md },
  quoteCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.background,
  },
  quoteTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground },
  quoteFee: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  switchLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  error: { color: colors.destructive, fontSize: 13 },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  footerBtn: { flex: 1 },
  footerPrimary: { flex: 1.4 },
});
