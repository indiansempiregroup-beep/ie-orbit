import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StaffInvitation } from '@ie-platform/sdk';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ListRow } from '../../components/ui/ListRow';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useStaffMembers } from '../../hooks/useOpsData';
import { useIamMutations, useIamRoles, useTeamMembers } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const ASSIGNABLE_ROLES = ['manager', 'staff'];

export function TeamScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const { members, loading: membersLoading, reload: reloadMembers } = useTeamMembers();
  const { staff, loading: staffLoading, reload: reloadStaff } = useStaffMembers();
  const { roles } = useIamRoles();
  const iam = useIamMutations();
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [submitting, setSubmitting] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = roles.filter((item) => ASSIGNABLE_ROLES.includes(item.code));
  const memberEmails = new Set(members.map((member) => member.email?.toLowerCase()).filter(Boolean));
  const pendingInviteEmails = new Set(
    invitations
      .filter((invitation) => invitation.status === 'pending')
      .map((invitation) => invitation.email.toLowerCase()),
  );

  async function reloadInvites() {
    if (!client || !businessId) return;
    setLoading(true);
    try {
      const response = await client.invitations.list(businessId);
      setInvitations(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadInvites();
  }, [client, businessId]);

  return (
    <RefreshableScrollView
      contentContainerStyle={styles.wrap}
      onRefresh={async () => {
        await Promise.all([reloadMembers(), reloadInvites(), reloadStaff()]);
      }}
    >
      <Card>
        <Text style={styles.title}>Invite team member</Text>
        <Text style={styles.helper}>
          Inviting creates login access. Accepting the invite also creates/links a Staff profile.
        </Text>
        <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <View style={styles.roleRow}>
          <Button label="Staff" variant={role === 'staff' ? 'primary' : 'outline'} onPress={() => setRole('staff')} />
          <Button label="Manager" variant={role === 'manager' ? 'primary' : 'outline'} onPress={() => setRole('manager')} />
        </View>
        <Text style={styles.helper}>
          {role === 'manager'
            ? 'Managers: Settings, Team, staff directory, and reports.'
            : 'Staff: bookings, calendar, and customers only — no teammate directory.'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Send invitation"
          loading={submitting}
          fullWidth
          onPress={async () => {
            if (!client || !businessId) return;
            setSubmitting(true);
            setError(null);
            try {
              await client.invitations.create(businessId, { email: email.trim(), platform_role_code: role });
              setEmail('');
              await Promise.all([reloadInvites(), reloadStaff()]);
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to send invitation.'));
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </Card>

      <Text style={styles.section}>Staff directory</Text>
      <Text style={styles.helper}>Operational staff profiles used for scheduling and bookings.</Text>
      <ScreenState
        loading={staffLoading && !staff.length}
        empty={!staffLoading && staff.length === 0}
        emptyMessage="No staff profiles yet. Add staff or invite a teammate."
      />
      {staff.map((member) => {
        const name = member.display_name || member.full_name || member.email || 'Staff member';
        const emailKey = member.email?.toLowerCase() ?? '';
        const loginStatus = member.user
          ? 'Login linked'
          : emailKey && pendingInviteEmails.has(emailKey)
            ? 'Invite pending'
            : emailKey && memberEmails.has(emailKey)
              ? 'Team member'
              : 'No login yet';
        return (
          <ListRow
            key={member.id}
            title={name}
            subtitle={`${member.email ?? 'No email'} · ${loginStatus}`}
            meta={member.employment_status || member.status || undefined}
            avatarName={name}
            avatarSrc={member.photo_url}
            onPress={() => navigation.navigate('StaffDetail', { staffId: member.id })}
          />
        );
      })}
      <Button label="Add staff profile" variant="outline" fullWidth onPress={() => navigation.navigate('StaffForm', {})} />

      <Text style={styles.section}>Members with app access</Text>
      <ScreenState loading={membersLoading && !members.length} empty={!membersLoading && members.length === 0} emptyMessage="No members yet." />
      {members.map((member) => {
        const name = member.full_name || member.email || 'Member';
        return (
        <Card key={member.id}>
          <View style={styles.memberHeader}>
            <Avatar name={name} size="md" />
            <View style={styles.memberCopy}>
              <Text style={styles.itemTitle}>{name}</Text>
              <Text style={styles.itemMeta}>{member.email}</Text>
            </View>
          </View>
          <View style={styles.rolesWrap}>
            {member.roles.map((memberRole) => (
              <View key={memberRole.code} style={styles.roleChip}>
                <Text style={styles.roleChipText}>{memberRole.name}</Text>
                {ASSIGNABLE_ROLES.includes(memberRole.code) ? (
                  <Pressable
                    onPress={async () => {
                      setRoleBusy(`${member.id}-${memberRole.code}-remove`);
                      try {
                        await iam.removeRole(member.id, memberRole.code);
                        await reloadMembers();
                      } catch (err) {
                        setError(getApiErrorMessage(err, 'Unable to remove role.'));
                      } finally {
                        setRoleBusy(null);
                      }
                    }}
                  >
                    <Text style={styles.roleAction}>{roleBusy === `${member.id}-${memberRole.code}-remove` ? '…' : 'Remove'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <View style={styles.assignRow}>
            {assignableRoles
              .filter((assignable) => !member.roles.some((memberRole) => memberRole.code === assignable.code))
              .map((assignable) => (
                <Button
                  key={assignable.code}
                  label={`Add ${assignable.name}`}
                  variant="outline"
                  loading={roleBusy === `${member.id}-${assignable.code}-add`}
                  onPress={async () => {
                    setRoleBusy(`${member.id}-${assignable.code}-add`);
                    try {
                      await iam.assignRole(member.id, assignable.code);
                      await reloadMembers();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to assign role.'));
                    } finally {
                      setRoleBusy(null);
                    }
                  }}
                />
              ))}
          </View>
        </Card>
        );
      })}

      <Text style={styles.section}>Invitations</Text>
      <ScreenState loading={loading && !invitations.length} empty={!loading && invitations.length === 0} emptyMessage="No invitations yet." />
      {invitations.map((invitation) => (
        <Card key={invitation.id}>
          <View style={styles.inviteRow}>
            <View>
              <Text style={styles.itemTitle}>{invitation.email}</Text>
              <Text style={styles.itemMeta}>
                {invitation.platform_role_code} · {invitation.status}
              </Text>
            </View>
            {invitation.status === 'pending' && client && businessId ? (
              <Pressable
                onPress={async () => {
                  await client.invitations.revoke(businessId, invitation.id);
                  await reloadInvites();
                }}
              >
                <Text style={styles.revoke}>Revoke</Text>
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
  title: { ...typography.title, color: colors.foreground, marginBottom: spacing.sm },
  helper: { ...typography.caption, color: colors.mutedForeground, marginBottom: spacing.sm },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  error: { ...typography.caption, color: colors.destructive, marginBottom: spacing.sm },
  section: { ...typography.label, color: colors.foreground, marginTop: spacing.md },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberCopy: { flex: 1 },
  itemTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  itemMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  rolesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  roleChipText: { ...typography.caption, color: colors.foreground },
  roleAction: { ...typography.caption, color: colors.destructive, fontWeight: '600' },
  assignRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  inviteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revoke: { ...typography.caption, color: colors.destructive, fontWeight: '600' },
});
