import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { brand, fonts } from '../theme/tokens';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Floating Business Assistant entry — soft pulse ring + gentle float. */
export function AssistantFab({
  onPress,
  style,
  accessibilityLabel = 'Business Assistant',
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    floatLoop.start();
    return () => {
      pulseLoop.stop();
      floatLoop.stop();
    };
  }, [pulse, floatY]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const translateY = floatY.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <Animated.View style={[styles.wrap, style, { transform: [{ translateY }, { scale: pressScale }] }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          Animated.spring(pressScale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <View style={styles.glow} />
        <Feather name="zap" size={20} color="#fff" />
        <Text style={styles.label}>AI</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: brand.primary,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    overflow: 'hidden',
    shadowColor: brand.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnPressed: { opacity: 0.92 },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2A7A90',
    opacity: 0.35,
  },
  label: {
    fontSize: 9,
    lineHeight: 10,
    fontFamily: fonts.bodyBold,
    color: '#fff',
    letterSpacing: 0.8,
    marginTop: -1,
  },
});
