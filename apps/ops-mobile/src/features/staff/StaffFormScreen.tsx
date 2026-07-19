import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useStaffMember, useStaffMutations } from '../../hooks/useOpsExtended';
import { colors, typography } from '../../theme/tokens';
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

  if (isEdit && loading) return <ScreenState loading />;

  return (
    <FormScreen>
      <Text style={styles.title}>{isEdit ? 'Edit staff' : 'Add staff'}</Text>
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={isEdit ? 'Save' : 'Create staff'}
        loading={submitting}
        fullWidth
        size="lg"
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
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
