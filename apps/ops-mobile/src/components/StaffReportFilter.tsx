import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { StaffMember } from '@ie-orbit/sdk';
import { Chip } from './ui/Chip';
import { spacing } from '../theme/tokens';

type Props = {
  staff: StaffMember[];
  staffId: string | null;
  onChange: (staffId: string | null) => void;
};

function staffLabel(member: StaffMember) {
  return member.display_name || member.full_name || member.first_name || 'Staff';
}

export function StaffReportFilter({ staff, staffId, onChange }: Props) {
  if (!staff.length) return null;
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label="All staff" active={!staffId} onPress={() => onChange(null)} />
        {staff.map((member) => (
          <Chip
            key={member.id}
            label={staffLabel(member)}
            active={staffId === member.id}
            onPress={() => onChange(member.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 0 },
  row: { gap: spacing.sm, paddingRight: spacing.md },
});
