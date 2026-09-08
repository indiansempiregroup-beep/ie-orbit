import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';
import { useKeyboardHeight } from './useKeyboardHeight';

/**
 * Keep bottom sheets above the keyboard without pinning them to the top of the screen.
 * Transparent modals do not resize with the keyboard on native.
 */
export function useSheetKeyboardLayout(maxFraction = 0.68) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const lift = Platform.OS === 'web' ? 0 : keyboardHeight;
  const topReserve = Math.max(insets.top + 48, keyboardHeight > 0 ? 128 : 88);
  const available = Math.max(240, height - lift - topReserve);

  return {
    keyboardHeight,
    keyboardOpen: keyboardHeight > 0,
    lift,
    topReserve,
    maxHeight: Math.min(height * maxFraction, available),
    bottomPad: Math.max(insets.bottom, spacing.md),
  };
}
