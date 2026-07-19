import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { brand, colors, radius, spacing, typography } from '../../theme/tokens';

export function WorkspacePickerScreen() {
  const { tenants, businesses, tenantId, businessId, setTenantId, setBusinessId, loading, ready } = useWorkspace();

  return (
    <FormScreen contentContainerStyle={styles.content}>
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
              <Feather
                name={businessId === business.id ? 'check-circle' : 'circle'}
                size={18}
                color={colors.primary}
              />
            </Pressable>
          ))}
        </>
      ) : null}

      <Button
        label={ready ? 'Continue' : loading ? 'Loading…' : 'Select a business'}
        fullWidth
        size="lg"
        disabled={!tenantId || !businessId || loading}
        onPress={() => {
          // Selecting tenant/business updates workspace context; RootNavigator routes to Main when ready.
        }}
      />
      {ready ? (
        <Text style={styles.hint}>Workspace ready — opening your dashboard…</Text>
      ) : (
        <Text style={styles.hint}>Pick a workspace and business to continue.</Text>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 56 },
  kicker: { ...typography.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...typography.heading, color: colors.foreground },
  copy: { ...typography.body, color: colors.mutedForeground },
  section: { ...typography.label, color: colors.foreground, marginTop: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  itemTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  hint: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
});
