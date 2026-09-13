import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Templates',
    body: 'Each row is a WhatsApp utility message Orbit submits to your WhatsApp account (names like ieo_booking_confirmed). Sync missing creates any template Meta does not have yet. Refresh status pulls Meta’s review: not synced → pending → approved or rejected. Meta must approve a template before customers can receive it. Wording is fixed — Meta re-reviews every edit.',
  },
  {
    title: 'Event mappings',
    body: 'This list is fixed: each booking or order event uses one template. You cannot point “Booking confirmed” at a different Meta name, because the variables (customer, booking number, time, and so on) would break. After a template is approved, open it and turn Enabled for customers on or off. Unmapped events (reschedule, booking completed, pending order, staff alerts) stay on email and in-app only.',
  },
  {
    title: 'Mapped customer events',
    body: 'Bookings: received, confirmed, cancelled, reminder. Orders: confirmed, ready, out for delivery, completed, cancelled.',
  },
  {
    title: 'When a WhatsApp actually sends',
    body: 'All of these must be true: WhatsApp is connected and sending is not paused; the event has a mapping; that template is approved and enabled; the customer opted in (profile or checkout); there is a phone number. If any of those fail, email and in-app still go out — WhatsApp is skipped. Meta’s hello-world test message is separate from these templates.',
  },
  {
    title: 'What to do',
    body: 'Sync missing → Refresh until Approved → enable the events you want → send a booking or order with WhatsApp opted in.',
  },
];

type SheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function WhatsAppTemplatesHelpSheet({ visible, onClose }: SheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.flexFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>How templates & mappings work</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
            <Button label="Got it" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type TriggerProps = {
  compact?: boolean;
};

export function WhatsAppTemplatesHelpButton({ compact }: TriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How templates and mappings work"
          onPress={() => setOpen(true)}
          style={styles.compactRow}
        >
          <Feather name="info" size={20} color={colors.primary} />
          <Text style={styles.compactLabel}>How templates & mappings work</Text>
        </Pressable>
      ) : (
        <Button
          label="How templates & mappings work"
          variant="outline"
          icon="info"
          onPress={() => setOpen(true)}
        />
      )}
      <WhatsAppTemplatesHelpSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  flexFill: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.heading, fontSize: 18, color: colors.foreground, flex: 1 },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  sectionBody: { ...typography.body, color: colors.foreground, lineHeight: 22 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  compactLabel: { ...typography.body, color: colors.primary, fontWeight: '600', flex: 1 },
});
