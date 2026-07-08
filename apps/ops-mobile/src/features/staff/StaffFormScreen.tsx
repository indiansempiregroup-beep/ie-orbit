import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useStaffMember, useStaffMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function StaffFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'StaffForm'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const isEdit = Boolean(route.params?.staffId);
  const { member, loading } = useStaffMember(route.params?.staffId ?? '');
  const mutations = useStaffMutations();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    setDisplayName(member.full_name ?? '');
    setEmail(member.email ?? '');
    setPhone(member.phone_number ?? '');
  }, [member]);

  if (isEdit && loading) return <View style={styles.wrap}><Text>Loading…</Text></View>;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{isEdit ? 'Edit staff' : 'Add staff'}</Text>
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={isEdit ? 'Save' : 'Create staff'}
        loading={submitting}
        fullWidth
        onPress={async () => {
          setSubmitting(true);
          setError(null);
          try {
            const code = `staff-${Date.now().toString(36)}`;
            if (isEdit && route.params?.staffId) {
              await mutations.update(route.params.staffId, {
                first_name: firstName,
                last_name: lastName,
                display_name: displayName || `${firstName} ${lastName}`.trim(),
                email,
                phone_number: phone,
              });
              navigation.replace('StaffDetail', { staffId: route.params.staffId });
            } else {
              const created = await mutations.create({
                business: businessId!,
                staff_code: code,
                first_name: firstName || displayName || code,
                last_name: lastName,
                display_name: displayName || firstName || code,
                email,
                phone_number: phone,
              });
              navigation.replace('StaffDetail', { staffId: created.id });
            }
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to save staff.'));
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
