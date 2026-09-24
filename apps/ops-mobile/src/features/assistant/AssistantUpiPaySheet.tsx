import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCodeSvg from 'react-native-qrcode-svg';
import type { ApiClient } from '@ie-orbit/sdk';
import { Button } from '../../components/ui/Button';
import { FieldLabel } from '../../components/ui/FieldLabel';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { uploadMedia } from '../../api/media';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { getApiErrorMessage } from '../../utils/format';

const PROOF_REQUIRED_MESSAGE = 'Enter a UTR / UPI reference or upload a payment screenshot.';

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

type SessionPayload = {
  session_id: string;
  amount: number;
  currency: string;
  upi_vpa: string;
  upi_pay_url: string;
  payment_qr_url?: string;
  payment_status: string;
};

type Props = {
  client: ApiClient;
  token: string;
  tenantId: string;
  businessId: string;
  amountPaise: number;
  onClose: () => void;
  onClaimed: () => Promise<void> | void;
  onError: (message: string) => void;
};

function paiseToInr(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function AssistantUpiPaySheet({
  client,
  token,
  tenantId,
  businessId,
  amountPaise,
  onClose,
  onClaimed,
  onError,
}: Props) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [utr, setUtr] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofMediaId, setProofMediaId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ready' | 'awaiting'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function startCheckout() {
    setLoading(true);
    setFormError(null);
    try {
      const res = await client.assistant.createWalletTopUp({
        amount_paise: amountPaise,
      });
      setSession(res.data);
      setStatus('ready');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to start UPI top-up.');
      setFormError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'idle' && !loading && !session) {
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickProof() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      const message = 'Allow photo library access to upload a payment screenshot.';
      setFormError(message);
      onError(message);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setUploading(true);
    try {
      const uploaded = await uploadMedia({
        token,
        tenantId,
        businessId,
        asset: picked.assets[0],
        folderType: 'documents',
        tags: ['billing', 'upi_proof', 'assistant'],
        displayName: `Assistant top-up ${paiseToInr(amountPaise)}`,
      });
      const relative = uploaded.public_url || uploaded.private_url || '';
      const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
      const absolute = relative.startsWith('http')
        ? relative
        : `${origin}${relative.startsWith('/') ? relative : `/${relative}`}`;
      setProofMediaId(uploaded.id);
      setProofUrl(absolute);
      setFormError(null);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to upload screenshot.');
      setFormError(message);
      onError(message);
    } finally {
      setUploading(false);
    }
  }

  async function submitClaim() {
    if (!session) return;
    if (utr.trim().length < 6 && !proofMediaId && !proofUrl) {
      setFormError(PROOF_REQUIRED_MESSAGE);
      return;
    }
    setClaiming(true);
    setFormError(null);
    try {
      await client.billing.claimUpiCheckout(session.session_id, {
        upi_utr: utr.trim(),
        payment_proof_url: proofUrl || undefined,
        payment_proof_media_id: proofMediaId || undefined,
        business_id: businessId,
      });
      setStatus('awaiting');
      await onClaimed();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to submit payment claim.');
      setFormError(message);
      onError(message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation?.()}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <Text style={styles.kicker}>Assistant wallet</Text>
            <Text style={styles.title}>Top up {paiseToInr(amountPaise)}</Text>
            <Text style={styles.meta}>Pay exact amount → submit UTR/screenshot → IE confirms → wallet credits.</Text>

            {session && (status === 'ready' || status === 'awaiting') ? (
              <View style={styles.stack}>
                <View style={styles.amountRow}>
                  <View>
                    <Text style={styles.meta}>Amount due</Text>
                    <Text style={styles.amount}>{paiseToInr(session.amount)}</Text>
                  </View>
                  <View>
                    <Text style={styles.meta}>UPI ID</Text>
                    <Text style={styles.amount}>{session.upi_vpa}</Text>
                  </View>
                </View>
                {session.upi_pay_url ? (
                  <View style={styles.qrWrap}>
                    <PaymentQrCode value={session.upi_pay_url} size={180} />
                  </View>
                ) : null}
                {status === 'ready' ? (
                  <>
                    <FieldLabel>UTR / UPI reference</FieldLabel>
                    <Input value={utr} onChangeText={setUtr} autoCapitalize="characters" placeholder="From your UPI app" />
                    <Button
                      label={uploading ? 'Uploading…' : proofUrl || proofMediaId ? 'Change screenshot' : 'Upload screenshot'}
                      variant="outline"
                      disabled={uploading}
                      onPress={() => void pickProof()}
                    />
                  </>
                ) : (
                  <FormAlert tone="info" message="Payment received — waiting for IE to confirm. Wallet credits after confirmation." />
                )}
              </View>
            ) : null}

            {formError ? <FormAlert tone="danger" message={formError} /> : null}

            <View style={styles.actions}>
              {status === 'idle' ? (
                <Button label="Generate payment QR" loading={loading} onPress={() => void startCheckout()} />
              ) : null}
              {status === 'ready' ? (
                <Button label="I’ve paid — submit" loading={claiming} onPress={() => void submitClaim()} />
              ) : null}
              <Button label={status === 'awaiting' ? 'Done' : 'Close'} variant="ghost" onPress={onClose} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  kicker: {
    ...typography.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: fonts.semibold,
  },
  title: {
    ...typography.title,
    color: colors.foreground,
    fontFamily: fonts.bold,
  },
  meta: {
    ...typography.body,
    color: colors.muted,
  },
  stack: {
    gap: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  amount: {
    ...typography.subtitle,
    color: colors.foreground,
    fontFamily: fonts.semibold,
    marginTop: 4,
  },
  qrWrap: {
    alignItems: 'center',
    padding: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
