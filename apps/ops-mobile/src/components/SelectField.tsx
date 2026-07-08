import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SelectField({ label, value, options, onChange, placeholder = 'Select…' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.option, option.value === value && styles.optionActive]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
  },
  value: { ...typography.body, color: colors.foreground, flex: 1 },
  placeholder: { color: colors.mutedForeground },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '70%', padding: spacing.xl },
  sheetTitle: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  option: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionActive: { backgroundColor: colors.secondary },
  optionLabel: { ...typography.body, color: colors.foreground },
});
