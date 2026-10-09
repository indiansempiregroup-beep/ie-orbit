import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/tokens';
import { publishPaymentProofCapture } from '../../utils/paymentProofCapture';
import type { RootStackParamList } from '../../navigation/types';

export function PaymentProofCameraScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeWithoutCapture() {
    publishPaymentProofCapture(null);
    navigation.goBack();
  }

  async function takePhoto() {
    if (capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
      });
      if (!photo?.uri) {
        throw new Error('Camera did not return a photo. Try again.');
      }
      publishPaymentProofCapture({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        mimeType: 'image/jpeg',
        fileName: `upi-proof-${Date.now()}.jpg`,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't capture the photo. Try again.");
      setCapturing(false);
    }
  }

  if (!permission) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Camera</Text>
        <Text style={styles.meta}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Payment proof</Text>
        <Text style={styles.meta}>Allow camera access to photograph the UPI payment screen.</Text>
        <Pressable style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={closeWithoutCapture}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="picture" />
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <Pressable style={styles.closeBtn} onPress={closeWithoutCapture} hitSlop={8}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.titleLight}>Capture UPI proof</Text>
          <View style={styles.closeBtn} />
        </View>
        <Text style={styles.hint}>Point at the customer’s UPI success screen, then tap capture.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.shutterRow}>
          <Pressable
            style={[styles.shutter, capturing && styles.shutterBusy]}
            onPress={() => void takePhoto()}
            disabled={capturing}
            accessibilityLabel="Capture photo"
          >
            {capturing ? <ActivityIndicator color="#111" /> : <View style={styles.shutterInner} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.foreground },
  titleLight: { fontFamily: fonts.display, fontSize: 18, color: '#fff' },
  meta: { marginTop: spacing.sm, color: colors.mutedForeground, lineHeight: 20 },
  hint: {
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
  error: {
    alignSelf: 'center',
    color: '#fecaca',
    backgroundColor: 'rgba(127,29,29,0.75)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
  },
  shutterRow: { alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterBusy: { opacity: 0.7 },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  buttonText: { color: colors.primaryForeground, fontWeight: '700' },
  linkBtn: { marginTop: spacing.md, alignSelf: 'flex-start' },
  linkText: { color: colors.mutedForeground, fontWeight: '600' },
});
