import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { brand, colors, spacing, typography } from '../../theme/tokens';

export function WorkspacePickerScreen() {
  const { tenants, businesses, tenantId, businessId, setTenantId, setBusinessId, loading } = useWorkspace();

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>{brand.appName}</Text>
      <Text style={styles.title}>Choose workspace</Text>
      <Text style={styles.copy}>Select the business you want to manage.</Text>

      <Text style={styles.section}>Workspaces</Text>
      {tenants.map((tenant) => (
        <Pressable
          key={tenant.id}
          style={[styles.item, tenantId === tenant.id && styles.itemActive]}
          onPress={() => void setTenantId(tenant.id)}
        >
          <Text style={styles.itemTitle}>{tenant.name}</Text>
          <Feather name={tenantId === tenant.id ? 'check-circle' : 'circle'} size={18} color={colors.primary} />
        </Pressable>
      ))}

      {tenantId ? (
        <>
          <Text style={styles.section}>Businesses</Text>
          {businesses.map((business) => (
            <Pressable
              key={business.id}
              style={[styles.item, businessId === business.id && styles.itemActive]}
              onPress={() => void setBusinessId(business.id)}
            >
              <Text style={styles.itemTitle}>{business.display_name ?? business.business_name}</Text>
              <Feather name={businessId === business.id ? 'check-circle' : 'circle'} size={18} color={colors.primary} />
            </Pressable>
          ))}
        </>
      ) : null}

      <Button label={loading ? 'Loading…' : 'Continue'} fullWidth disabled={!tenantId || !businessId || loading} onPress={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.md },
  kicker: { ...typography.caption, color: colors.mutedForeground, textTransform: 'uppercase' },
  title: { ...typography.heading, color: colors.foreground },
  copy: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.md },
  section: { ...typography.label, color: colors.foreground, marginTop: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  itemTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
});
