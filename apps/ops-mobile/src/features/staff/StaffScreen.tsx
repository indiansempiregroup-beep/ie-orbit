import React, { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useStaffMembers } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { staff, loading, reload } = useStaffMembers();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${staff.length} team members`);
  }, [navigation, staff.length]);

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
    <DesktopPage>
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
          emptyTitle={search ? 'No matches' : 'No staff yet'}
          emptyMessage={
            search ? 'Try another name or email.' : 'Add staff, set schedules, and assign services.'
          }
          actionLabel={search ? undefined : 'Add staff'}
          onAction={search ? undefined : () => navigation.navigate('StaffForm', {})}
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
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
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
