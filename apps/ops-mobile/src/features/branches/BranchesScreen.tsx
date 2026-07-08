import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useBranches, useBranchMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function BranchesScreen() {
  const { branches, loading, reload } = useBranches();
  const { create, setPrimary } = useBranchMutations();
  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <RefreshableScrollView contentContainerStyle={styles.wrap} onRefresh={reload}>
      <Text style={styles.title}>Branches</Text>
      <Text style={styles.subtitle}>Manage physical locations for the active business.</Text>

      <Button label={showForm ? 'Cancel' : 'Add branch'} variant={showForm ? 'outline' : 'primary'} onPress={() => setShowForm((v) => !v)} />

      {showForm ? (
        <Card>
          <Input label="Branch name" value={branchName} onChangeText={setBranchName} placeholder="Downtown clinic" />
          <Input label="City" value={city} onChangeText={setCity} placeholder="Mumbai" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label="Create branch"
            loading={submitting}
            fullWidth
            onPress={async () => {
              if (!branchName.trim()) {
                setError('Branch name is required.');
                return;
              }
              setSubmitting(true);
              setError(null);
              try {
                await create({
                  branch_name: branchName.trim(),
                  display_name: branchName.trim(),
                  city: city.trim() || undefined,
                  is_primary: branches.length === 0,
                });
                setBranchName('');
                setCity('');
                setShowForm(false);
                setMessage('Branch created.');
                await reload();
              } catch (err) {
                setError(getApiErrorMessage(err, 'Unable to create branch.'));
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </Card>
      ) : null}

      {message ? <Text style={styles.success}>{message}</Text> : null}

      <ScreenState loading={loading && !branches.length} empty={!loading && branches.length === 0} emptyMessage="No branches yet." />
      {branches.map((branch) => (
        <Card key={branch.id}>
          <View style={styles.branchRow}>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>{branch.display_name ?? branch.branch_name}</Text>
              <Text style={styles.branchMeta}>
                {[branch.city, branch.state, branch.country].filter(Boolean).join(', ') || 'No location set'}
              </Text>
              {branch.is_primary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
            </View>
            {!branch.is_primary ? (
              <Pressable
                onPress={async () => {
                  try {
                    await setPrimary(branch.id);
                    setMessage('Primary branch updated.');
                    await reload();
                  } catch (err) {
                    setError(getApiErrorMessage(err, 'Unable to update branch.'));
                  }
                }}
              >
                <Text style={styles.link}>Set primary</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  branchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  branchInfo: { flex: 1, gap: 4 },
  branchName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  branchMeta: { ...typography.caption, color: colors.mutedForeground },
  primaryBadge: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: 4 },
  link: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
