import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the on-screen keyboard, or 0 while it is closed.
 *
 * Scroll containers need this explicitly: iOS never resizes the window, and on Android
 * the enforced edge-to-edge layout in Expo SDK 54+ makes `softwareKeyboardLayoutMode:
 * 'resize'` a no-op. Without reserved space the content under a focused field stays
 * unreachable behind the keyboard.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
