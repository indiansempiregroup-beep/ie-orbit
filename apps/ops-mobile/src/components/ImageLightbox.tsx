import React from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/tokens';

type Props = {
  uri: string | null;
  visible: boolean;
  title?: string;
  onClose: () => void;
  onReplace?: () => void;
  replaceLabel?: string;
};

/** Full-screen product/service photo viewer (white stage for product photos). */
export function ImageLightbox({
  uri,
  visible,
  title,
  onClose,
  onReplace,
  replaceLabel = 'Change photo',
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const imageH = Math.max(240, height - insets.top - insets.bottom - (onReplace ? 140 : 80));

  return (
    <Modal
      visible={visible && Boolean(uri)}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn} accessibilityLabel="Close">
            <Feather name="x" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title || 'Photo'}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <Pressable style={[styles.stage, { width, height: imageH }]} onPress={onClose}>
          {uri
            ? Platform.OS === 'web'
              ? React.createElement('img', {
                  src: uri,
                  alt: title || 'Photo',
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    background: '#FFFFFF',
                  },
                })
              : (
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF' }}
                    resizeMode="contain"
                  />
                )
            : null}
        </Pressable>

        {onReplace ? (
          <Pressable
            style={styles.replaceBtn}
            onPress={() => {
              onClose();
              onReplace();
            }}
          >
            <Feather name="refresh-cw" size={18} color="#fff" />
            <Text style={styles.replaceText}>{replaceLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  replaceText: { color: colors.primaryForeground, fontWeight: '600', fontSize: 15 },
});
