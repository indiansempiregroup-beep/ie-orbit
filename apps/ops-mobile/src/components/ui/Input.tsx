import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../../theme/tokens';
import { FieldLabel } from './FieldLabel';
import { fieldStyles, inputReset } from './fieldStyles';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Feather.glyphMap;
  required?: boolean;
  optional?: boolean;
};

export function Input({
  label,
  error,
  hint,
  leftIcon,
  required,
  optional,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  multiline,
  editable,
  ...rest
}: Props) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const [focused, setFocused] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={fieldStyles.wrap}>
      <FieldLabel label={label} required={required} optional={optional} />
      <View
        style={[
          fieldStyles.control,
          focused && fieldStyles.controlFocused,
          error ? fieldStyles.controlError : null,
          multiline && fieldStyles.controlMultiline,
          editable === false && fieldStyles.controlDisabled,
        ]}
      >
        {leftIcon ? (
          <Feather name={leftIcon} size={16} color={colors.mutedForeground} style={styles.leftIcon} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={isPassword ? hidden : false}
          multiline={multiline}
          editable={editable}
          underlineColorAndroid="transparent"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            fieldStyles.value,
            inputReset,
            styles.input,
            leftIcon ? styles.inputWithIcon : null,
            multiline ? styles.inputMultiline : null,
            style,
          ]}
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          testID={
            rest.testID ??
            (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : undefined)
          }
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={8}
            style={styles.eye}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Feather name={hidden ? 'eye' : 'eye-off'} size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={fieldStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {hint && !error ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leftIcon: { marginRight: spacing.sm },
  input: { paddingVertical: spacing.sm },
  inputWithIcon: { paddingLeft: 0 },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top', paddingTop: 0 },
  eye: { marginLeft: spacing.sm },
});
