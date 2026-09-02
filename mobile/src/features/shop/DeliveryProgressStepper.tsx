import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DELIVERY_PROGRESS_STEPS, shopOrderProgressIndex } from './shopHelpers';
import type { ShopOrder } from '@ie-orbit/sdk';
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
  order: Pick<ShopOrder, 'status' | 'fulfillment_mode' | 'metadata'>;
  primary: string;
  compact?: boolean;
};

export function DeliveryProgressStepper({ order, primary, compact = false }: Props) {
  const activeIndex = shopOrderProgressIndex(order);
  return (
    <View style={styles.wrap}>
      <View style={[styles.track, compact && styles.trackCompact]}>
        {DELIVERY_PROGRESS_STEPS.map((step, index) => {
          const done = index <= activeIndex;
          const current = index === activeIndex;
          return (
            <React.Fragment key={step.key}>
              <View style={[styles.step, compact && styles.stepCompact]}>
                <View
                  style={[
                    styles.dot,
                    done && { backgroundColor: primary },
                    current && styles.dotCurrent,
                  ]}
                />
                {!compact ? (
                  <Text style={[styles.label, done && { color: colors.foreground }]} numberOfLines={1}>
                    {step.label}
                  </Text>
                ) : null}
              </View>
              {index < DELIVERY_PROGRESS_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.line,
                    compact && styles.lineCompact,
                    done && index < activeIndex && { backgroundColor: primary },
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  trackCompact: { alignItems: 'center' },
  step: { alignItems: 'center', minWidth: 52 },
  stepCompact: { minWidth: 0, flex: 1 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotCurrent: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginTop: 4,
    marginHorizontal: 2,
  },
  lineCompact: { marginTop: 0 },
  label: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 4,
    textAlign: 'center',
    fontSize: 10,
  },
});
