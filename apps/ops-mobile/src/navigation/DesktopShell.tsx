import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DesktopSidebar } from './DesktopSidebar';

/** Keeps the desktop sidebar visible across root stack screens (Books, forms, etc.). */
export function DesktopShell({
  children,
  activeRoute,
}: {
  children: React.ReactNode;
  activeRoute?: string;
}) {
  const { isDesktop } = useBreakpoint();

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <View style={styles.row}>
      <DesktopSidebar activeRoute={activeRoute} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  content: { flex: 1, minWidth: 0, height: '100%' },
});
