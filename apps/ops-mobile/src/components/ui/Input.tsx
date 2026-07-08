import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Feather.glyphMap;
};

export function Input({ label, error, leftIcon, secureTextEntry, style, ...rest }: Props) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {leftIcon ? <Feather name={leftIcon} size={16} color={colors.mutedForeground} style={styles.leftIcon} /> : null}
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={isPassword ? hidden : false}
          style={[styles.input, leftIcon ? styles.inputWithIcon : null, style]}
          {...rest}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={8} style={styles.eye}>
            <Feather name={hidden ? 'eye' : 'eye-off'} size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
  },
  fieldError: { borderColor: colors.destructive },
  leftIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  inputWithIcon: { paddingLeft: 0 },
  eye: { marginLeft: spacing.sm },
  error: { ...typography.caption, color: colors.destructive },
});
