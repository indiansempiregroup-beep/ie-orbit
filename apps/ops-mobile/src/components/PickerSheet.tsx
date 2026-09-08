import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useSheetKeyboardLayout } from '../hooks/useSheetKeyboardLayout';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { Button } from './ui/Button';

type Props = {
  visible: boolean;
  title: string;
  preview: string;
  icon: keyof typeof Feather.glyphMap;
  onClose: () => void;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
};

export function PickerSheet({
  visible,
  title,
  preview,
  icon,
  onClose,
  children,
  actionLabel = 'Done',
  onAction,
  actionDisabled,
}: Props) {
  const { isDesktop } = useBreakpoint();
  const { keyboardOpen, lift, maxHeight, bottomPad } = useSheetKeyboardLayout(isDesktop ? 0.7 : 0.78);
  const sheetLift = isDesktop ? 0 : lift;
  const bodyMaxHeight = Math.max(160, maxHeight - (keyboardOpen ? 168 : 220));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isDesktop && styles.overlayCenter]}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : styles.sheetMobile,
            { paddingBottom: isDesktop ? spacing.lg : bottomPad, marginBottom: sheetLift, maxHeight },
          ]}
        >
          <View style={[styles.hero, keyboardOpen && styles.heroCompact]}>
            {!isDesktop && <View style={styles.handle} />}
            <View style={styles.heroTop}>
              <View style={styles.iconWrap}>
                <Feather name={icon} size={18} color={colors.primaryForeground} />
              </View>
              <Text style={styles.heroTitle}>{title}</Text>
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <Text style={[styles.preview, keyboardOpen && styles.previewCompact]} numberOfLines={1}>
              {preview}
            </Text>
          </View>

          <ScrollView
            style={{ maxHeight: bodyMaxHeight }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {onAction ? (
            <View style={styles.footer}>
              <Button
                label={actionLabel}
                size="lg"
                fullWidth
                disabled={actionDisabled}
                onPress={onAction}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.card,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 420,
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  sheetMobile: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxWidth: '100%',
  },
  sheetDesktop: {
    borderRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  heroCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...typography.label,
    color: 'rgba(255,255,255,0.82)',
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: -0.4,
  },
  previewCompact: { fontSize: 18 },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
