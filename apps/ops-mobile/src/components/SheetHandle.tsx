import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme/tokens';

type Props = {
  expanded: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number, vy: number) => void;
  /** Light pill on a colored header. Muted pill on a white sheet. */
  tone?: 'light' | 'muted';
};

export function SheetHandle({
  expanded,
  onToggle,
  onDragStart,
  onDragMove,
  onDragEnd,
  tone = 'light',
}: Props) {
  const dragged = useRef(false);
  const onToggleRef = useRef(onToggle);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onToggleRef.current = onToggle;
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragged.current = true;
          onDragStartRef.current();
        },
        onPanResponderMove: (_event, gesture) => {
          onDragMoveRef.current(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          onDragEndRef.current(gesture.dy, gesture.vy);
          setTimeout(() => {
            dragged.current = false;
          }, 40);
        },
        onPanResponderTerminate: (_event, gesture) => {
          onDragEndRef.current(gesture.dy, gesture.vy);
          setTimeout(() => {
            dragged.current = false;
          }, 40);
        },
      }),
    [],
  );

  return (
    <View {...panResponder.panHandlers} style={styles.hit}>
      <Pressable
        onPress={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onToggleRef.current();
        }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse' : 'Expand'}
        style={styles.press}
      >
        <View style={[styles.pill, tone === 'muted' ? styles.pillMuted : styles.pillLight]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: 'center',
  },
  press: {
    minWidth: 72,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
  pillLight: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  pillMuted: {
    backgroundColor: colors.muted,
  },
});
