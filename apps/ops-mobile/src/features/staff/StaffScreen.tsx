import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useStaffMembers } from '../../hooks/useOpsData';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { staff, loading, reload } = useStaffMembers();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => [s.full_name, s.email, s.phone_number, s.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [staff, search]);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Staff" subtitle={`${staff.length} members`} />
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search staff" />
        <Button label="Add" onPress={() => navigation.navigate('StaffForm', {})} />
      </View>
      <RefreshableScrollView refreshing={refreshing || loading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <ScreenState loading={loading && !staff.length} empty={!loading && filtered.length === 0} emptyMessage="No staff found." />
        {filtered.map((member) => (
          <Pressable key={member.id} onPress={() => navigation.navigate('StaffDetail', { staffId: member.id })}>
            <Card>
              <Text style={styles.title}>{member.full_name ?? 'Staff member'}</Text>
              <Text style={styles.meta}>{member.email ?? member.phone_number ?? member.status ?? '—'}</Text>
            </Card>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, alignItems: 'center' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
