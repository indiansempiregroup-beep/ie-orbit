import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { TAB_BAR_RADIUS } from '../theme/layout';

/**
 * expo-blur on Android needs the experimental Dimezis backend, which stutters badly
 * while content scrolls underneath. Android and web get a near-opaque frosted fill instead.
 */
const SUPPORTS_BLUR = Platform.OS === 'ios';

/**
 * Frosted pill behind the floating tab bar items. Rendered via the navigator's
 * `tabBarBackground` option, which fills the tab bar bounds.
 *
 * The shell keeps a low-alpha fill rather than a solid one: iOS derives a view's shadow
 * from its composited alpha, so some fill is needed for the shadow to appear at all, but
 * anything opaque would be what the blur samples and the glass would stop reading through.
 */
export function GlassTabBarBackground() {
  return (
    <View style={styles.shell}>
      {SUPPORTS_BLUR ? <BlurView intensity={28} tint="light" style={styles.blur} /> : null}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.62)', 'rgba(255, 255, 255, 0.04)']}
        style={styles.sheen}
      />
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11, 31, 58, 0.08)',
    backgroundColor: SUPPORTS_BLUR ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.94)',
    ...Platform.select({
      ios: {
        shadowColor: '#0B1F3A',
        shadowOpacity: 0.3,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_RADIUS,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '58%',
    borderTopLeftRadius: TAB_BAR_RADIUS,
    borderTopRightRadius: TAB_BAR_RADIUS,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: TAB_BAR_RADIUS / 2,
    right: TAB_BAR_RADIUS / 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});
