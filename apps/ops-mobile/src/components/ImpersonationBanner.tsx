import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts, spacing } from '../theme/tokens';

export function ImpersonationBanner() {
  const { user, isImpersonating, endImpersonation, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isImpersonating) return null;

  return (
    <View style={styles.bar}>
      <View style={styles.copy}>
        <Text style={styles.title}>Acting as {user?.email ?? 'tenant owner'}</Text>
        <Text style={styles.meta}>Platform support session in the ops app. Exit to return to Platform Admin.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <Pressable
        style={styles.button}
        disabled={busy || loading}
        onPress={() => {
          setBusy(true);
          setError(null);
          void endImpersonation().catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Could not exit impersonation');
            setBusy(false);
          });
        }}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonLabel}>Exit to Admin</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#1d4ed8',
  },
  copy: { flex: 1, minWidth: 220 },
  title: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 14 },
  meta: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  error: { color: '#fecaca', fontSize: 12, marginTop: 4 },
  button: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { color: '#1d4ed8', fontFamily: fonts.bodySemi, fontSize: 13 },
});
