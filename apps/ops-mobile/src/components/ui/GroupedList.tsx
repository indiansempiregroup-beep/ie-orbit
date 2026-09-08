import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../../theme/tokens';

type GroupedListProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GroupedList({ children, style }: GroupedListProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <View style={[groupedListStyles.group, style]}>
      {items.map((child, index) => (
        <View key={React.isValidElement(child) && child.key != null ? String(child.key) : String(index)}>
          {index > 0 ? <View style={groupedListStyles.separator} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function GroupedListSeparator() {
  return <View style={groupedListStyles.separator} />;
}

export function groupedListProps(count: number, style?: StyleProp<ViewStyle>) {
  return {
    style: (count > 0 ? [groupedListStyles.group, style] : style) as StyleProp<ViewStyle>,
    ItemSeparatorComponent: count > 0 ? GroupedListSeparator : undefined,
  };
}

export const groupedListStyles = StyleSheet.create({
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
