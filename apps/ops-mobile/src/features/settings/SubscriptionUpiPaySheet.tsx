import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCodeSvg from 'react-native-qrcode-svg';
import type { ApiClient } from '@ie-orbit/sdk';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { uploadMedia } from '../../api/media';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

/** Metro/babel interop sometimes leaves the default export nested under `.default`. */
function PaymentQrCode({ value, size }: { value: string; size: number }) {
  const Comp =
    typeof QRCodeSvg === 'function'
      ? QRCodeSvg
      : (QRCodeSvg as { default?: React.ComponentType<{ value: string; size: number }> })?.default;
  if (typeof Comp !== 'function') {
    return <Text style={styles.meta}>QR unavailable</Text>;
  }
  return <Comp value={value} size={size} />;
}

export type SubscriptionUpiPayRequest = {
  productCode: string;
  planCode: string;
  productName: string;
  planName?: string;
  extraStaff?: number;
  extraOffices?: number;
  petsPackEnabled?: boolean;
  mode: 'subscribe' | 'change_plan' | 'addons';
  /** When true, generate QR immediately when the sheet opens. */
  autoStart?: boolean;
};

type SessionPayload = {
  session_id: string;
  amount: number;
  currency: string;
  upi_vpa: string;
  upi_pay_url: string;
  payment_qr_url?: string;
  payment_status: string;
  product_code: string;
  plan_code: string;
};

type Props = {
  client: ApiClient;
  token: string;
  tenantId: string;
  businessId: string;
  request: SubscriptionUpiPayRequest;
  onClose: () => void;
  onClaimed: () => Promise<void> | void;
  onError: (message: string) => void;
};

function paiseToInr(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function SubscriptionUpiPaySheet({
  client,
  token,
  tenantId,
  businessId,
  request,
  onClose,
  onClaimed,
  onError,
}: Props) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [utr, setUtr] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'ready' | 'awaiting' | 'done'>('idle');

  const title = useMemo(() => {
    if (request.mode === 'change_plan') return `Upgrade ${request.productName}`;
    if (request.mode === 'addons') return `Pay current total · ${request.productName}`;
    return `Subscribe · ${request.productName}`;
  }, [request.mode, request.productName]);

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await client.billing.createUpiCheckout({
        product_code: request.productCode,
        plan_code: request.planCode,
        business_id: businessId,
        extra_staff: request.extraStaff ?? 0,
        extra_offices: request.extraOffices ?? 0,
        pets_pack_enabled: Boolean(request.petsPackEnabled),
      });
      setSession(res.data);
      setStatus('ready');
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to start UPI checkout. Set PLATFORM_UPI_VPA on the server.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (request.autoStart && status === 'idle' && !loading && !session) {
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once when opened with autoStart
  }, [request.autoStart]);

  async function pickProof() {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const uploaded = await uploadMedia({
        token,
        tenantId,
        businessId,
        asset: picked.assets[0],
        folderType: 'business',
        tags: ['billing', 'upi_proof'],
        displayName: `UPI proof ${request.productCode}`,
      });
      setProofUrl(uploaded.public_url || uploaded.private_url || '');
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to upload screenshot.'));
    }
  }

  async function submitClaim() {
    if (!session) return;
    if (utr.trim().length < 6 && !proofUrl) {
      onError('Enter a UTR / UPI reference or upload a payment screenshot.');
      return;
    }
    setClaiming(true);
    try {
      await client.billing.claimUpiCheckout(session.session_id, {
        upi_utr: utr.trim(),
        payment_proof_url: proofUrl || undefined,
        business_id: businessId,
      });
      setStatus('awaiting');
      await onClaimed();
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to submit payment claim.'));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {request.planName || request.planCode}
            {request.extraStaff ? ` · +${request.extraStaff} staff` : ''}
            {request.extraOffices ? ` · +${request.extraOffices} offices` : ''}
            {request.petsPackEnabled ? ' · Pets pack' : ''}
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.stack}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            bounces
          >
            {status === 'idle' ? (
              <Text style={styles.body}>
                Pay IE Orbit via UPI for the exact amount, then submit your UTR for confirmation.
              </Text>
            ) : null}

            {session && (status === 'ready' || status === 'awaiting') ? (
              <>
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Amount due</Text>
                  <Text style={styles.amountValue}>{paiseToInr(session.amount)}</Text>
                  <Text style={styles.meta}>UPI: {session.upi_vpa}</Text>
                </View>

                {session.upi_pay_url ? (
                  <View style={styles.qrWrap}>
                    <PaymentQrCode value={session.upi_pay_url} size={188} />
                    <Text style={styles.meta}>Scan with any UPI app — amount is locked.</Text>
                  </View>
                ) : session.payment_qr_url ? (
                  <Image source={{ uri: session.payment_qr_url }} style={styles.staticQr} />
                ) : null}

                {status === 'ready' ? (
                  <>
                    <Text style={styles.body}>
                      After paying, enter your UTR / UPI reference and/or upload a payment screenshot.
                    </Text>
                    <Input
                      label="UTR / UPI reference"
                      value={utr}
                      onChangeText={setUtr}
                      autoCapitalize="characters"
                      placeholder="From your UPI app"
                    />
                    <Button
                      label={proofUrl ? 'Change payment screenshot' : 'Upload payment screenshot'}
                      variant="outline"
                      fullWidth
                      onPress={() => void pickProof()}
                    />
                    {proofUrl ? (
                      <Image source={{ uri: proofUrl }} style={styles.proof} resizeMode="cover" />
                    ) : null}
                  </>
                ) : (
                  <View style={styles.awaiting}>
                    <Text style={styles.awaitingTitle}>Awaiting platform confirmation</Text>
                    <Text style={styles.meta}>
                      Your payment claim was submitted{utr ? ` · UTR ${utr}` : ''}. Plan activates after IE confirms —
                      the trial banner updates to “Payment under review” until then.
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {status === 'idle' ? (
              <>
                <Button label="Generate payment QR" loading={loading} fullWidth onPress={() => void startCheckout()} />
                <Button label="Cancel" variant="outline" fullWidth onPress={onClose} />
              </>
            ) : null}
            {status === 'ready' ? (
              <>
                <Button
                  label={claiming ? 'Submitting…' : 'I’ve paid — submit for confirmation'}
                  loading={claiming}
                  fullWidth
                  onPress={() => void submitClaim()}
                />
                <Button label="Close" variant="outline" fullWidth onPress={onClose} />
              </>
            ) : null}
            {status === 'awaiting' ? <Button label="Done" fullWidth onPress={onClose} /> : null}
          </View>
        </View>
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.foreground },
  /** Lets the sheet hit maxHeight and scroll instead of clipping the footer. */
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  footer: { gap: spacing.sm, paddingTop: spacing.md },
  meta: { ...typography.caption, color: colors.mutedForeground },
  body: { ...typography.body, color: colors.foreground, lineHeight: 20 },
  amountBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    gap: 4,
  },
  amountLabel: { ...typography.caption, color: colors.mutedForeground },
  amountValue: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground },
  qrWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  staticQr: { width: 188, height: 188, alignSelf: 'center', borderRadius: radius.md },
  proof: { width: '100%', height: 140, borderRadius: radius.md },
  awaiting: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  awaitingTitle: { ...typography.label, fontFamily: fonts.bodyBold, color: colors.foreground },
});
