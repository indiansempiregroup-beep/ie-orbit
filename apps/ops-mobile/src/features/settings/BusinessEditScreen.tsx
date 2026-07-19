import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { uploadBrandingLogo } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, radius, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export function BusinessEditScreen() {
  const client = useOpsClient();
  const { token } = useAuth();
  const { activeBusiness, businessId, tenantId, refreshWorkspace } = useWorkspace();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('');
  const [logoAsset, setLogoAsset] = useState<ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setDisplayName(activeBusiness.display_name ?? activeBusiness.business_name ?? '');
    setEmail(activeBusiness.email ?? '');
    setTimezone(activeBusiness.timezone ?? '');
    setCurrency(activeBusiness.currency ?? '');
  }, [activeBusiness]);

  const logoUri = resolveMediaUrl(activeBusiness?.logo);

  return (
    <FormScreen>
      <Text style={styles.title}>Edit business</Text>
      {logoUri ? <Image source={{ uri: logoUri }} style={styles.logo} /> : null}
      <ImagePickerButton label="Logo" valueUri={activeBusiness?.logo} onPicked={setLogoAsset} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Timezone" value={timezone} onChangeText={setTimezone} />
      <Input label="Currency" value={currency} onChangeText={setCurrency} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Save changes"
        loading={loading}
        fullWidth
        size="lg"
        onPress={async () => {
          if (!client || !businessId || !token || !tenantId) return;
          setLoading(true);
          setError(null);
          try {
            let logo = activeBusiness?.logo;
            if (logoAsset) {
              const uploaded = await uploadBrandingLogo({
                token,
                tenantId,
                businessId,
                asset: logoAsset,
                displayName: displayName || activeBusiness?.business_name || 'Business',
              });
              logo = uploaded.public_url || uploaded.private_url || logo;
            }
            await client.businesses.patch(businessId, {
              display_name: displayName,
              email,
              timezone,
              currency,
              ...(logo ? { logo } : {}),
            });
            await refreshWorkspace();
            setMessage('Business profile updated.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to update business.'));
          } finally {
            setLoading(false);
          }
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  logo: { width: 96, height: 96, borderRadius: radius.lg, alignSelf: 'flex-start' },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
