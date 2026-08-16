import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/tokens';

type Props = {
  rating: number;
  size?: number;
  color?: string;
  interactive?: boolean;
  onChange?: (value: number) => void;
};

export function StarRating({ rating, size = 14, color = colors.warning, interactive, onChange }: Props) {
  const rounded = Math.round(rating);
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((value) => {
        const star = (
          <Text style={{ fontSize: size, color: value <= rounded ? color : '#D1D5DB', lineHeight: size + 2 }}>
            ★
          </Text>
        );
        if (!interactive) return <View key={value}>{star}</View>;
        return (
          <Pressable key={value} onPress={() => onChange?.(value)} hitSlop={6}>
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 1 },
});
