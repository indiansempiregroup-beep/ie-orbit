import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../../theme/tokens';

type Props = {
  count: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  disabled?: boolean;
};

export function CursorPager({
  count,
  pageSize,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const unitLabel = label ?? t('bi.pagination.entries');

  if (count <= 0 && !hasPrevious && !hasNext) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.meta}>{t('bi.pagination.showingCount', { count, label: unitLabel })}</Text>
      <View style={styles.sizes}>
        {pageSizeOptions.map((size) => {
          const selected = size === pageSize;
          return (
            <Pressable
              key={size}
              disabled={disabled}
              onPress={() => onPageSizeChange(size)}
              style={[styles.sizeBtn, selected && styles.sizeBtnOn, disabled && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('bi.pagination.rowsPerPage')}
            >
              <Text style={[styles.sizeText, selected && styles.sizeTextOn]}>{size}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.nav}>
        <Pressable
          disabled={disabled || !hasPrevious}
          onPress={onPrevious}
          style={[styles.navBtn, (disabled || !hasPrevious) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={t('bi.pagination.previousPage')}
        >
          <Feather name="chevron-left" size={16} color={colors.foreground} />
        </Pressable>
        <Pressable
          disabled={disabled || !hasNext}
          onPress={onNext}
          style={[styles.navBtn, (disabled || !hasNext) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={t('bi.pagination.nextPage')}
        >
          <Feather name="chevron-right" size={16} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  meta: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.body },
  sizes: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  sizeBtn: {
    minWidth: 36,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  sizeBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sizeText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bodySemi },
  sizeTextOn: { color: colors.primaryForeground },
  nav: { flexDirection: 'row', gap: 6 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  disabled: { opacity: 0.45 },
});
