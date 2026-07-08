import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlatformTenantSummary } from '@ie-platform/sdk';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';

export function AdminScreen() {
  const client = useOpsClient();
  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setLoading(true);
    void client.platform
      .tenants()
      .then((response) => setTenants(response.data?.tenants ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [client]);

  if (loading) return <ScreenState loading />;
  if (error) return <ScreenState error={error} />;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Platform admin</Text>
      <Text style={styles.copy}>{tenants.length} tenants</Text>
      {tenants.map((tenant) => (
        <Card key={tenant.id}>
          <Text style={styles.name}>{tenant.display_name}</Text>
          <Text style={styles.meta}>{tenant.status} · {tenant.business_count} businesses</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.heading, color: colors.foreground },
  copy: { ...typography.body, color: colors.mutedForeground },
  name: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
