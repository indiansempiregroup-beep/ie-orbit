import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './tokens';

/** Shared inset helpers so tab/auth screens clear the notch and home indicator. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    headerPaddingTop: insets.top + spacing.md,
    bottomPadding: Math.max(insets.bottom, spacing.sm),
    insets,
  };
}
