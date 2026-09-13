import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { colors, spacing, typography } from '../../theme/tokens';
import { whatsappStatusColors } from './whatsappStatus';

const META_BUSINESS_URL = 'https://business.facebook.com/latest/whatsapp_manager/phone_numbers';
const META_TOKEN_DOCS =
  'https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-user-access-tokens';

export const WHATSAPP_SETUP_STEPS = [
  'Open Meta Business Suite and add WhatsApp if you do not already have a Cloud API number.',
  'Open WhatsApp Manager → API Setup. Copy Phone number ID and WhatsApp Business Account ID into Connection below.',
  'Create a system-user permanent token with whatsapp_business_messaging and whatsapp_business_management. Paste it as Access token, then Save & test.',
  'In Meta → WhatsApp → Configuration, paste the webhook URL and verify token from setup help. Subscribe to the messages field.',
  'Open Templates here and tap Sync missing. Wait until Meta marks them Approved, then keep sending switched on.',
  'Customers only receive WhatsApp if they opt in (profile or checkout).',
];

type SetupStepsProps = {
  webhookUrl: string;
  verifyToken: string;
  connected: boolean;
  onCopied: (label: string) => void;
  onOpenTemplates: () => void;
};

type Props = SetupStepsProps & {
  statusLabel: string;
  statusHint: string;
  statusTone: 'success' | 'warning' | 'danger' | 'muted';
  sectionSubtitle: string;
  sendingEnabled: boolean;
  sendingAvailable: boolean;
  onSendingChange: (value: boolean) => void;
};

function SetupStepsBody({
  webhookUrl,
  verifyToken,
  connected,
  onCopied,
  onOpenTemplates,
  copyValue,
}: SetupStepsProps & { copyValue: (value: string, label: string) => Promise<void> }) {
  return (
    <>
      {WHATSAPP_SETUP_STEPS.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
      <View style={styles.actions}>
        <Button label="Open WhatsApp Manager" variant="outline" icon="external-link" href={META_BUSINESS_URL} />
        <Button label="How to create a token" variant="outline" icon="book-open" href={META_TOKEN_DOCS} />
      </View>
      {webhookUrl ? (
        <View style={styles.copyCard}>
          <Text style={styles.copyLabel}>Webhook URL</Text>
          <Text selectable style={styles.copyValue}>
            {webhookUrl}
          </Text>
          <Button
            label="Copy webhook URL"
            variant="outline"
            size="sm"
            icon="copy"
            onPress={() => void copyValue(webhookUrl, 'Webhook URL')}
          />
        </View>
      ) : null}
      {verifyToken ? (
        <View style={styles.copyCard}>
          <Text style={styles.copyLabel}>Verify token</Text>
          <Text selectable style={styles.copyValue}>
            {verifyToken}
          </Text>
          <Text style={styles.copyHint}>
            Paste this as the verify token when Meta asks. Keep it in your Meta app, not in a public post.
          </Text>
          <Button
            label="Copy verify token"
            variant="outline"
            size="sm"
            icon="copy"
            onPress={() => void copyValue(verifyToken, 'Verify token')}
          />
        </View>
      ) : null}
      {connected ? (
        <Button label="Go to templates" onPress={onOpenTemplates} />
      ) : (
        <Text style={styles.copyHint}>After Save & test succeeds, continue from step 4 with the webhook values above.</Text>
      )}
    </>
  );
}

export function WhatsAppOwnerSetupGuide(props: Props) {
  const {
    webhookUrl,
    verifyToken,
    connected,
    statusLabel,
    statusHint,
    statusTone,
    sectionSubtitle,
    sendingEnabled,
    sendingAvailable,
    onSendingChange,
    onCopied,
    onOpenTemplates,
  } = props;
  const [helpOpen, setHelpOpen] = useState(false);
  const tone = whatsappStatusColors(statusTone);

  const copyValue = async (value: string, label: string) => {
    if (!value) return;
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard?.writeText(value);
        onCopied(`${label} copied.`);
        return;
      } catch {
        onCopied(`Copy this ${label.toLowerCase()}: ${value}`);
        return;
      }
    }
    await Share.share({ message: value, title: label });
  };

  return (
    <>
      <FormSection title="WhatsApp connection" subtitle={sectionSubtitle}>
        <View style={styles.statusRow}>
          <View style={styles.statusCopy}>
            <View style={styles.statusTitleRow}>
              <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.statusPillText, { color: tone.text }]}>{statusLabel}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="WhatsApp setup help"
                hitSlop={12}
                onPress={() => setHelpOpen(true)}
                style={styles.infoButton}
              >
                <Feather name="info" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={[styles.compactHint, statusTone === 'danger' && styles.errorHint]}>{statusHint}</Text>
            <Text style={styles.tapHint}>Need setup steps? Tap (i).</Text>
          </View>
          <Switch value={sendingEnabled} onValueChange={onSendingChange} disabled={!sendingAvailable} />
        </View>
      </FormSection>

      <Modal visible={helpOpen} animationType="slide" transparent onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>WhatsApp setup</Text>
              <Pressable onPress={() => setHelpOpen(false)} hitSlop={12}>
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <SetupStepsBody
                webhookUrl={webhookUrl}
                verifyToken={verifyToken}
                connected={connected}
                onCopied={onCopied}
                onOpenTemplates={() => {
                  setHelpOpen(false);
                  onOpenTemplates();
                }}
                copyValue={copyValue}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  statusCopy: { flex: 1, gap: 6 },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { ...typography.label, fontWeight: '700' },
  infoButton: { padding: spacing.xs },
  compactHint: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  errorHint: { color: colors.destructive },
  tapHint: { ...typography.caption, color: colors.mutedForeground },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: { ...typography.caption, fontWeight: '800', color: colors.primary },
  stepText: { ...typography.body, color: colors.foreground, flex: 1, lineHeight: 20 },
  actions: { gap: spacing.sm },
  copyCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  copyLabel: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  copyValue: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
  copyHint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.heading, fontSize: 18, color: colors.foreground },
  modalBody: { padding: spacing.lg, gap: spacing.md },
});
