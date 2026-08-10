import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateRoot(
  name: keyof RootStackParamList,
  params?: object,
) {
  if (!rootNavigationRef.isReady()) return;
  // Params vary by route; cast keeps call sites simple.
  (rootNavigationRef.navigate as (n: string, p?: object) => void)(name, params);
}
