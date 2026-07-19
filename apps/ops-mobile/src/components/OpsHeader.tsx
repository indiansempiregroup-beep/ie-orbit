import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, spacing, typography } from '../theme/tokens';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { formatUserRole } from '../utils/roles';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
};

export function OpsHeader({ title, subtitle, right, children }: Props) {
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useWorkspace();
  const { user } = useAuth();

  return (
    <LinearGradient colors={[brand.primary, brand.primaryDark, '#1E40AF']} style={[styles.wrap, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.kicker}>{activeBusiness?.display_name ?? brand.appName}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {user?.roles?.length ? <Text style={styles.role}>{formatUserRole(user.roles)}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  copy: { flex: 1, gap: 4 },
  kicker: { ...typography.caption, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...typography.heading, color: colors.primaryForeground },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)' },
  role: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
