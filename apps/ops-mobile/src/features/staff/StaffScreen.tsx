import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useStaffMembers } from '../../hooks/useOpsData';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { staff, loading, reload } = useStaffMembers();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      [s.display_name, s.full_name, s.email, s.phone_number, s.employment_status, s.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [staff, search]);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Staff" subtitle={`${staff.length} members`} />
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search staff" />
        <Button label="Add" onPress={() => navigation.navigate('StaffForm', {})} />
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !staff.length}
          empty={!loading && filtered.length === 0}
          emptyMessage="No staff found."
        />
        {filtered.map((member) => {
          const name =
            member.display_name?.trim() ||
            member.full_name?.trim() ||
            member.email ||
            'Staff member';
          return (
            <ListRow
              key={member.id}
              title={name}
              subtitle={member.email ?? member.phone_number ?? '—'}
              meta={member.employment_status || member.status || undefined}
              avatarName={name}
              avatarSrc={member.photo_url}
              onPress={() => navigation.navigate('StaffDetail', { staffId: member.id })}
            />
          );
        })}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  search: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
