import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { formatMoney } from './posPayment';
import {
  deviceMailtoUrl,
  deviceSmsUrl,
  deviceWhatsAppUrl,
  downloadAndShareShopDocumentPdf,
  openShopDocumentHtmlView,
  openUrl,
  copyTextToClipboard,
  toShareableShopDocUrl,
  type ShopDocTarget,
} from '../../utils/shopDocumentShare';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: ShopDocTarget | null;
  title?: string;
  allowNewBill?: boolean;
  onNewBill?: () => void;
};

function firstContact(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function DocumentActionsSheet({
  visible,
  onClose,
  target,
  title,
  allowNewBill = false,
  onNewBill,
}: Props) {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const auth = useAuth();
  const { tenantId, activeBusiness } = useWorkspace();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [message, setMessage] = useState('');
  const [amountDue, setAmountDue] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [billTotal, setBillTotal] = useState('');
  const [paymentLabel, setPaymentLabel] = useState('');

  useEffect(() => {
    if (!visible || !target || !client) return;
    setPhone(firstContact(target.phone));
    setEmail(firstContact(target.email));
    setPublicUrl('');
    setMessage('');
    setAmountDue('');
    setAmountPaid('');
    setBillTotal('');
    setPaymentLabel('');
    let cancelled = false;
    (async () => {
      setLoadingShare(true);
      try {
        const [doc, share] = await Promise.all([
          client.shop.getShopDocument(target.kind, target.id, { business_id: target.businessId }).catch(() => null),
          client.shop.createShopDocumentShareLink(target.kind, target.id, {
            business_id: target.businessId,
          }),
        ]);
        if (cancelled) return;
        setPhone(
          firstContact(
            target.phone,
            share.data.customer_phone,
            String(doc?.data?.customer_phone || ''),
          ),
        );
        setEmail(
          firstContact(
            target.email,
            share.data.customer_email,
            String(doc?.data?.customer_email || ''),
          ),
        );
        setPublicUrl(share.data.public_url);
        setMessage(share.data.message || '');
        setAmountDue(String(share.data.amount_due || doc?.data?.amount_due || ''));
        setAmountPaid(String(doc?.data?.amount_paid || share.data.amount_paid || ''));
        setBillTotal(String(doc?.data?.total || share.data.total || ''));
        setPaymentLabel(String(doc?.data?.payment_label || share.data.payment_label || ''));
      } catch (err) {
        if (!cancelled) toast.push(getApiErrorMessage(err, 'Could not prepare share link'), 'error');
      } finally {
        if (!cancelled) setLoadingShare(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, target?.id, target?.kind, target?.businessId, target?.phone, target?.email, client]);

  async function ensureShare() {
    if (!client || !target) throw new Error('Not ready');
    if (publicUrl) return { url: publicUrl, text: message || publicUrl };
    const share = await client.shop.createShopDocumentShareLink(target.kind, target.id, {
      business_id: target.businessId,
    });
    setPublicUrl(share.data.public_url);
    setMessage(share.data.message || '');
    setPhone((prev) => firstContact(prev, share.data.customer_phone));
    setEmail((prev) => firstContact(prev, share.data.customer_email));
    setAmountDue(String(share.data.amount_due || ''));
    setAmountPaid((prev) => prev || String(share.data.amount_paid || ''));
    setBillTotal((prev) => prev || String(share.data.total || ''));
    setPaymentLabel((prev) => prev || String(share.data.payment_label || ''));
    return { url: share.data.public_url, text: share.data.message || share.data.public_url };
  }

  async function onView() {
    if (!target || !auth.token) return;
    try {
      await openShopDocumentHtmlView({
        target,
        token: auth.token,
        tenantId,
        publicUrl: publicUrl || undefined,
      });
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'View failed'), 'error');
    }
  }

  async function onSharePdf(layout: 'a4' | 'thermal') {
    if (!target || !auth.token) return;
    try {
      await downloadAndShareShopDocumentPdf({
        target,
        token: auth.token,
        tenantId,
        layout,
      });
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'PDF share failed'), 'error');
    }
  }

  async function onDevice(channel: 'whatsapp' | 'sms' | 'email') {
    try {
      const share = await ensureShare();
      if (channel === 'whatsapp') await openUrl(deviceWhatsAppUrl(phone, share.text));
      else if (channel === 'sms') await openUrl(deviceSmsUrl(phone, share.text));
      else
        await openUrl(
          deviceMailtoUrl(email, `${title || 'Document'} ${target?.number || ''}`.trim(), share.text),
        );
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Share failed'), 'error');
    }
  }

  async function onCopy() {
    try {
      const share = await ensureShare();
      const url = toShareableShopDocUrl(share.url);
      if (!url) throw new Error('Link not ready yet');
      await copyTextToClipboard(url);
      setPublicUrl((prev) => prev || share.url);
      toast.push('Link copied', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Could not copy link'), 'error');
    }
  }

  async function onServerSend(channels: Array<'email' | 'whatsapp'>, remind = false) {
    if (!client || !target) return;
    setSending(true);
    try {
      const result = await client.shop.sendShopDocument(target.kind, target.id, {
        business_id: target.businessId,
        channels,
        to_phone: phone || undefined,
        to_email: email || undefined,
        remind_payment: remind,
      });
      const parts = Object.entries(result.data.channels || {}).map(
        ([channel, info]) => `${channel}: ${info.status || 'ok'}`,
      );
      toast.push(parts.join(' · ') || 'Sent', 'success');
      if (result.data.public_url) setPublicUrl(result.data.public_url);
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Send failed'), 'error');
    } finally {
      setSending(false);
    }
  }

  const due = Number(amountDue || 0);
  const heading = title || `Document ${target?.number || ''}`.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>
              {target?.kind === 'delivery_challan'
                ? 'Send challan'
                : target?.kind === 'quotation'
                  ? 'Send quotation'
                  : 'Send invoice'}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {heading}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {Number(billTotal || 0) > 0 || due > 0 || Number(amountPaid || 0) > 0 ? (
          <View style={styles.dueBox}>
            <Feather name={due > 0 ? 'alert-circle' : 'check-circle'} size={16} color="#92400e" />
            <Text style={styles.dueText}>
              {paymentLabel ? `${paymentLabel} · ` : ''}
              Total {formatMoney(Number(billTotal || 0), activeBusiness?.currency)}
              {' · '}
              Received {formatMoney(Number(amountPaid || 0), activeBusiness?.currency)}
              {due > 0 ? (
                <>
                  {' · '}
                  Due <Text style={styles.dueStrong}>{formatMoney(due, activeBusiness?.currency)}</Text>
                </>
              ) : (
                ' · Paid in full'
              )}
            </Text>
          </View>
        ) : null}

        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={styles.actionGrid}>
              <ActionTile icon="eye" label="View" onPress={() => void onView()} />
              <ActionTile icon="download" label="PDF" onPress={() => void onSharePdf('a4')} />
              <ActionTile icon="printer" label="Thermal" onPress={() => void onSharePdf('thermal')} />
              <ActionTile
                icon="link"
                label="Copy link"
                disabled={loadingShare && !publicUrl}
                onPress={() => void onCopy()}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Customer contact</Text>
              {loadingShare ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
            <Text style={styles.sectionHint}>
              Prefills from the customer when available. Edit before sending.
            </Text>
            <Input
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="WhatsApp / SMS"
            />
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="customer@email.com"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Send on device</Text>
            <View style={styles.row}>
              <Button label="WhatsApp" onPress={() => void onDevice('whatsapp')} />
              <Button label="SMS" variant="secondary" onPress={() => void onDevice('sms')} />
              <Button label="Email" variant="secondary" onPress={() => void onDevice('email')} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Send from server</Text>
            <View style={styles.row}>
              <Button
                label="WhatsApp"
                variant="secondary"
                disabled={sending}
                onPress={() => void onServerSend(['whatsapp'])}
              />
              <Button
                label="Email"
                variant="secondary"
                disabled={sending || !email}
                onPress={() => void onServerSend(['email'])}
              />
              {due > 0 ? (
                <Button
                  label="Remind"
                  variant="ghost"
                  disabled={sending}
                  onPress={() => void onServerSend(['whatsapp', 'email'], true)}
                />
              ) : null}
            </View>
          </View>

          {publicUrl ? <Text style={styles.url}>{publicUrl}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          {allowNewBill ? (
            <Button
              label="New bill"
              onPress={() => {
                onNewBill?.();
                onClose();
              }}
            />
          ) : null}
          <Button label="Done" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.tile, disabled ? styles.tileDisabled : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <View style={styles.tileIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    marginTop: 'auto',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { ...typography.title, fontFamily: fonts.bodySemi, fontSize: 20 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  dueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderColor: '#f0d7a4',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dueText: { ...typography.body },
  dueStrong: { fontFamily: fonts.bodySemi },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.foreground,
  },
  sectionHint: { ...typography.caption, color: colors.mutedForeground, marginBottom: 2 },
  actionGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileDisabled: { opacity: 0.45 },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  tileLabel: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    textAlign: 'center',
    width: '100%',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  url: { ...typography.caption, color: colors.mutedForeground },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
});

export type { ShopDocTarget };
