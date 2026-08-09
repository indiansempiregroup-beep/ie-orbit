import React, { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { brand, colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';

export function AIPosterScreen() {
  const toast = useToast();
  const { activeBusiness } = useWorkspace();
  const brand =
    activeBusiness?.display_name || activeBusiness?.business_name || 'Your store';

  const [headline, setHeadline] = useState('Weekend offer');
  const [price, setPrice] = useState('499');

  async function sharePoster() {
    const summary = `${brand}\n${headline}\n₹${price || '—'}\nShop with us today.`;
    try {
      await Share.share({ message: summary, title: 'Promo poster' });
    } catch {
      toast.push('Unable to share poster', 'error');
    }
  }

  return (
    <FormScreen
      footer={<Button label="Share poster text" fullWidth size="lg" onPress={() => void sharePoster()} />}
    >
      <Text style={styles.formTitle}>Promo poster</Text>
      <Text style={styles.help}>Build a simple local poster card — no AI API required.</Text>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Headline</Text>
        <TextInput
          style={styles.input}
          value={headline}
          onChangeText={setHeadline}
          placeholder="Festival sale"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Price</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={(value) => setPrice(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="999"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <View style={styles.poster}>
        <Text style={styles.posterBrand}>{brand}</Text>
        <Text style={styles.posterHeadline}>{headline || 'Your offer'}</Text>
        <Text style={styles.posterPrice}>₹{price || '—'}</Text>
        <Text style={styles.posterFooter}>Limited time · Visit the store</Text>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  fieldBlock: { gap: 6 },
  label: { ...typography.label, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  poster: {
    marginTop: spacing.md,
    backgroundColor: brand.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    minHeight: 220,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  posterBrand: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: '#D6E2F0',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  posterHeadline: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  posterPrice: {
    fontFamily: fonts.bodyBold,
    fontSize: 36,
    color: '#FFFFFF',
  },
  posterFooter: {
    ...typography.caption,
    color: '#D6E2F0',
  },
});
