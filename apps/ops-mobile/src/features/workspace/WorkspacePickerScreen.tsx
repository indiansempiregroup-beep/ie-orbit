import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { brand, colors, radius, spacing, typography } from '../../theme/tokens';

export function WorkspacePickerScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const {
    tenants,
    businesses,
    tenantId,
    businessId,
    setTenantId,
    setBusinessId,
    loading,
    ready,
    error,
    refreshWorkspace,
  } = useWorkspace();
  const [continuing, setContinuing] = useState(false);

  const noTenants = !loading && tenants.length === 0;
  const noBusinesses = Boolean(tenantId) && !loading && businesses.length === 0;
  const canContinue = Boolean(tenantId && businessId);

  async function onContinue() {
    if (!tenantId || !businessId || continuing) return;
    setContinuing(true);
    try {
      await setBusinessId(businessId);
      // RootNavigator switches to Main when `ready` flips true.
    } finally {
      // If navigation didn't happen (still not ready), allow retry.
      setContinuing(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>{brand.appName}</Text>
      <Text style={styles.title}>Choose workspace</Text>
      <Text style={styles.copy}>Select the business you want to manage.</Text>

      {loading && !tenants.length ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Loading workspaces…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>Could not load workspace</Text>
          <Text style={styles.alertCopy}>{error}</Text>
        </View>
      ) : null}

      {noTenants ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>No business on this account</Text>
          <Text style={styles.alertCopy}>
            You need to create your business before you can use IE Orbit. Sign out, then tap Create
            your business on the sign-in screen.
          </Text>
          <Button label="Sign out and create your business" fullWidth onPress={() => void logout()} />
        </View>
      ) : (
        <>
          <Text style={styles.section}>Workspaces</Text>
          {tenants.map((tenant) => (
            <Pressable
              key={tenant.id}
              style={[styles.item, tenantId === tenant.id && styles.itemActive]}
              onPress={() => void setTenantId(tenant.id)}
            >
              <Text style={styles.itemTitle}>
                {(tenant as { display_name?: string }).display_name || tenant.name || tenant.slug}
              </Text>
              <Feather
                name={tenantId === tenant.id ? 'check-circle' : 'circle'}
                size={18}
                color={colors.primary}
              />
            </Pressable>
          ))}
        </>
      )}

      {tenantId ? (
        <>
          <Text style={styles.section}>Businesses</Text>
          {noBusinesses ? (
            <View style={styles.alert}>
              <Text style={styles.alertTitle}>No businesses in this workspace</Text>
              <Text style={styles.alertCopy}>
                Open the web app → Settings → Business and create a business, then retry here.
              </Text>
            </View>
          ) : (
            businesses.map((business) => (
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
            ))
          )}
        </>
      ) : null}

      <Button
        label={ready ? 'Opening…' : continuing ? 'Continuing…' : canContinue ? 'Continue' : 'Select a business'}
        fullWidth
        size="lg"
        loading={continuing || (ready && canContinue)}
        disabled={!canContinue || continuing}
        onPress={() => void onContinue()}
      />
      <Button
        label="Retry"
        variant="outline"
        fullWidth
        size="lg"
        disabled={loading}
        onPress={() => void refreshWorkspace()}
      />
      <Button label="Sign out" variant="ghost" fullWidth onPress={() => void logout()} />
      <Text style={styles.hint}>
        {ready
          ? 'Workspace ready — opening your dashboard…'
          : noTenants || noBusinesses
            ? 'Fix the workspace setup above, then tap Retry.'
            : 'Pick a workspace and business, then tap Continue.'}
      </Text>
      <Text style={styles.apiHint}>{getApiBaseUrl()}</Text>
      <Text style={styles.apiHint}>
        {`t:${tenants.length} b:${businesses.length} · ${tenantId ? 'tenant✓' : 'tenant·'} ${businessId ? 'biz✓' : 'biz·'} ${ready ? 'READY→dashboard' : loading ? 'loading' : 'idle'}`}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  kicker: {
    ...typography.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
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
  itemTitle: { ...typography.body, color: colors.foreground, fontWeight: '600', flex: 1, paddingRight: spacing.md },
  hint: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
  apiHint: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    opacity: 0.7,
    fontSize: 11,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  alert: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  alertTitle: { ...typography.label, color: colors.foreground },
  alertCopy: { ...typography.body, color: colors.mutedForeground },
});
