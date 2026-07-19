import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { uploadStaffPhoto } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useIamMutations, useStaffMember, useStaffMutations, useTeamMembers } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff', helper: 'Bookings, calendar, and customers' },
  { value: 'manager', label: 'Manager', helper: 'Full access including Settings and Team' },
] as const;

type AppRole = 'staff' | 'manager';

export function StaffFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffForm'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { token } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const isEdit = Boolean(route.params?.staffId);
  const { member, loading } = useStaffMember(route.params?.staffId ?? '');
  const { members, reload: reloadMembers } = useTeamMembers();
  const mutations = useStaffMutations();
  const iam = useIamMutations();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>('staff');
  const [initialRole, setInitialRole] = useState<AppRole | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [photoAsset, setPhotoAsset] = useState<ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedMember = useMemo(() => {
    if (!member) return null;
    if (member.user) {
      return members.find((item) => item.id === member.user) ?? null;
    }
    if (member.email) {
      return members.find((item) => item.email?.toLowerCase() === member.email?.toLowerCase()) ?? null;
    }
    return null;
  }, [member, members]);

  useEffect(() => {
    if (!member) return;
    setFirstName(member.first_name ?? '');
    setLastName(member.last_name ?? '');
    setDisplayName(member.display_name ?? member.full_name ?? '');
    setEmail(member.email ?? '');
    setPhone(member.phone_number ?? '');
  }, [member]);

  useEffect(() => {
    if (!isEdit) return;
    const currentRole = linkedMember?.roles?.find((item) => item.code === 'manager' || item.code === 'staff')?.code as
      | AppRole
      | undefined;
    if (currentRole) {
      setRole(currentRole);
      setInitialRole(currentRole);
    } else if (linkedMember) {
      setRole('staff');
      setInitialRole('staff');
    }
  }, [isEdit, linkedMember]);

  if (isEdit && loading) return <ScreenState loading />;

  async function syncRole(userId: string, nextRole: AppRole, previousRole: AppRole | null) {
    if (previousRole && previousRole !== nextRole) {
      try {
        await iam.removeRole(userId, previousRole);
      } catch {
        // Role may already be absent.
      }
    }
    if (previousRole !== nextRole) {
      await iam.assignRole(userId, nextRole);
    }
  }

  return (
    <FormScreen
      footer={
        <Button
          label={isEdit ? 'Save' : 'Create staff'}
          loading={submitting}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!businessId) return;
            setSubmitting(true);
            setError(null);
            try {
              let photo: string | undefined;
              if (photoAsset && token && tenantId) {
                const uploaded = await uploadStaffPhoto({
                  token,
                  tenantId,
                  businessId,
                  asset: photoAsset,
                  staffName: displayName || firstName || 'Staff',
                });
                photo = uploaded.id;
              }

              const payload = {
                first_name: firstName || displayName || 'Staff',
                last_name: lastName,
                display_name: displayName || `${firstName} ${lastName}`.trim() || email,
                email,
                phone_number: phone,
                ...(photo ? { photo } : {}),
              };

              if (isEdit && route.params?.staffId) {
                await mutations.update(route.params.staffId, payload);

                const userId = member?.user || linkedMember?.id;
                if (userId) {
                  await syncRole(userId, role, initialRole);
                  await reloadMembers();
                } else if (sendInvite && email.trim() && client) {
                  await client.invitations.create(businessId, {
                    email: email.trim(),
                    platform_role_code: role,
                  });
                }

                navigation.replace('StaffDetail', { staffId: route.params.staffId });
              } else {
                const code = `staff-${Date.now().toString(36)}`;
                const created = await mutations.create({
                  business: businessId,
                  staff_code: code,
                  ...payload,
                });

                if (sendInvite && email.trim() && client) {
                  try {
                    await client.invitations.create(businessId, {
                      email: email.trim(),
                      platform_role_code: role,
                    });
                  } catch (inviteErr) {
                    setError(
                      getApiErrorMessage(
                        inviteErr,
                        'Staff saved, but the login invitation could not be sent.',
                      ),
                    );
                    navigation.replace('StaffDetail', { staffId: created.id });
                    return;
                  }
                }

                navigation.replace('StaffDetail', { staffId: created.id });
              }
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to save staff.'));
            } finally {
              setSubmitting(false);
            }
          }}
        />
      }
    >
      <Text style={styles.title}>{isEdit ? 'Edit staff' : 'Add staff'}</Text>
      <ImagePickerButton
        label="Profile photo"
        variant="avatar"
        valueUri={member?.photo_url}
        onPicked={setPhotoAsset}
      />
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <Text style={styles.section}>App access role</Text>
      <Text style={styles.helper}>
        Staff can manage bookings, calendar, and customers. Managers also get Settings and Team.
      </Text>
      <View style={styles.roleRow}>
        {ROLE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.roleCard, role === option.value && styles.roleCardActive]}
            onPress={() => setRole(option.value)}
          >
            <Text style={styles.roleLabel}>{option.label}</Text>
            <Text style={styles.roleHelper}>{option.helper}</Text>
          </Pressable>
        ))}
      </View>

      {isEdit && (member?.user || linkedMember) ? (
        <Text style={styles.helper}>Changing role updates their OPS-Mobile access immediately.</Text>
      ) : (
        <Pressable style={styles.inviteToggle} onPress={() => setSendInvite((value) => !value)}>
          <View style={[styles.checkbox, sendInvite && styles.checkboxOn]}>
            {sendInvite ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteTitle}>
              {isEdit ? 'Send login invitation with this role' : 'Send login invitation'}
            </Text>
            <Text style={styles.helper}>
              Emails a link so they can set a password and sign in to OPS-Mobile.
            </Text>
          </View>
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: spacing.sm },
  helper: { ...typography.caption, color: colors.mutedForeground },
  roleRow: { gap: spacing.sm },
  roleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
  },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  roleLabel: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  roleHelper: { ...typography.caption, color: colors.mutedForeground },
  inviteToggle: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  inviteCopy: { flex: 1, gap: 2 },
  inviteTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  error: { ...typography.caption, color: colors.destructive },
});
