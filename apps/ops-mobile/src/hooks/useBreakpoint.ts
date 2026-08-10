import { useWindowDimensions } from 'react-native';
import { DESKTOP_MIN_WIDTH } from '../theme/layout';

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_MIN_WIDTH;
  return { width, height, isDesktop };
}
