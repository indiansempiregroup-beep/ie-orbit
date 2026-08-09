import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Feather.glyphMap;
};

export function Input({
  label,
  error,
  hint,
  leftIcon,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const [focused, setFocused] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error ? styles.fieldError : null,
        ]}
      >
        {leftIcon ? (
          <Feather name={leftIcon} size={16} color={colors.mutedForeground} style={styles.leftIcon} />
        ) : null}
        <TextInput
          placeholderTextColor="#9B9EB8"
          secureTextEntry={isPassword ? hidden : false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
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
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedForeground,
  },
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
  fieldFocused: {
    borderColor: colors.primary,
  },
  fieldError: { borderColor: colors.destructive },
  leftIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: spacing.sm,
  },
  inputWithIcon: { paddingLeft: 0 },
  eye: { marginLeft: spacing.sm },
  error: { ...typography.caption, color: colors.destructive },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
