import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { InteractionManager, NativeModules, Platform } from 'react-native';

const ENABLED_KEY = 'ie.mobile.biometric.enabled';
const EMAIL_KEY = 'ie.mobile.biometric.email';
const REFRESH_KEY = 'ie.mobile.biometric.refresh';
const PROMPTED_KEY = 'ie.mobile.biometric.prompted';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** True when running inside Expo Go (Face ID is limited on iOS there). */
export function isExpoGo(): boolean {
  const constants = NativeModules.ExponentConstants as
    | { appOwnership?: string | null }
    | undefined;
  return constants?.appOwnership === 'expo';
}

async function read(key: string) {
  try {
    return await SecureStore.getItemAsync(key, STORE_OPTIONS);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null) {
  if (value == null) {
    await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
    return;
  }
  await SecureStore.setItemAsync(key, value, STORE_OPTIONS);
}

export type BiometricCapability = {
  available: boolean;
  enrolled: boolean;
  label: string;
  /** True when the OS can actually evaluate Face ID / fingerprint (not just passcode). */
  biometricsReady: boolean;
};

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = compatible ? await LocalAuthentication.isEnrolledAsync() : false;
  const types = compatible ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
  const level = compatible
    ? await LocalAuthentication.getEnrolledLevelAsync()
    : LocalAuthentication.SecurityLevel.NONE;
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const hasIris = types.includes(LocalAuthentication.AuthenticationType.IRIS);
  const levelValue = level as number;
  const biometricsReady =
    enrolled &&
    (level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG ||
      level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK ||
      levelValue === 3 ||
      levelValue === 2);

  let label = 'Biometrics';
  if (Platform.OS === 'ios' && hasFace) label = 'Face ID';
  else if (hasFingerprint) label = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  else if (hasIris) label = 'Iris';
  else if (hasFace) label = 'Face recognition';

  return {
    available: compatible && enrolled && biometricsReady,
    enrolled,
    label,
    biometricsReady,
  };
}

export async function isBiometricLoginEnabled() {
  return (await read(ENABLED_KEY)) === '1';
}

export async function wasBiometricPromptShown() {
  return (await read(PROMPTED_KEY)) === '1';
}

export async function markBiometricPromptShown() {
  await write(PROMPTED_KEY, '1');
}

export async function getBiometricEmail() {
  return read(EMAIL_KEY);
}

export async function storeBiometricSession(email: string, refreshToken: string) {
  await write(EMAIL_KEY, email.trim().toLowerCase());
  await write(REFRESH_KEY, refreshToken);
  await write(ENABLED_KEY, '1');
  await write(PROMPTED_KEY, '1');

  const enabled = await isBiometricLoginEnabled();
  const storedEmail = await read(EMAIL_KEY);
  const storedRefresh = await read(REFRESH_KEY);
  if (!enabled || !storedEmail || !storedRefresh) {
    throw new Error('Could not save Face ID / fingerprint login on this device.');
  }
}

/** Wait until alerts / navigation animations settle so Face ID can present. */
export function waitForUiIdle(ms = 450): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, ms);
    });
  });
}

export async function enableBiometricLogin(email: string, refreshToken: string) {
  const capability = await getBiometricCapability();
  if (!capability.available) {
    throw new Error(faceIdUnavailableMessage(capability.label));
  }

  await waitForUiIdle();
  const result = await authenticateWithBiometrics(`Enable ${capability.label} sign-in`);
  if (!result.success) {
    throw new Error(biometricFailureMessage(capability.label, result));
  }

  await storeBiometricSession(email, refreshToken);
}

export async function disableBiometricLogin() {
  await write(ENABLED_KEY, null);
  await write(EMAIL_KEY, null);
  await write(REFRESH_KEY, null);
  await write(PROMPTED_KEY, '1');
}

/**
 * Face ID / Touch ID only — no device-passcode fallback.
 * Requires NSFaceIDUsageDescription in the host app (Expo Go or a dev/production build).
 */
async function authenticateWithBiometrics(promptMessage: string) {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: true,
  });
}

function faceIdUnavailableMessage(label: string) {
  if (Platform.OS === 'ios') {
    return (
      `${label} is not available to this app right now. ` +
      `Open Settings → Expo Go → turn on Face ID, then reopen the app and try again.`
    );
  }
  return `Set up ${label} in your phone Settings first, and allow biometrics for this app.`;
}

function biometricFailureMessage(
  label: string,
  result: LocalAuthentication.LocalAuthenticationResult,
): string {
  if (result.success) return '';
  const error = 'error' in result ? String(result.error) : '';
  const warning = 'warning' in result && result.warning ? String(result.warning) : '';

  if (error === 'missing_usage_description' || warning.includes('NSFaceIDUsageDescription')) {
    if (Platform.OS === 'ios') {
      return (
        `This app host can’t open ${label}. ` +
        `Open Settings → Expo Go → turn on Face ID, or install a development build of IE Platform.`
      );
    }
    return `${label} is not configured in this app build. Please update the app and try again.`;
  }
  if (error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel') {
    return `${label} was cancelled. Close other popups, then try again.`;
  }
  if (error === 'user_fallback' || error === 'passcode_not_set') {
    return `${label} is required — use your face / fingerprint, not the phone passcode.`;
  }
  if (error === 'lockout' || error === 'lockout_permanent') {
    return `${label} is temporarily locked. Unlock your phone with your passcode, then try again.`;
  }
  if (error === 'not_enrolled' || error === 'not_available') {
    return faceIdUnavailableMessage(label);
  }
  if (error === 'authentication_failed') {
    return `${label} did not match. Look at the phone and try again.`;
  }

  const detail = [error, warning].filter(Boolean).join(' — ');
  return detail
    ? `${label} didn’t complete (${detail}). ${Platform.OS === 'ios' ? 'Check Settings → Expo Go → Face ID is on.' : 'Please try again.'}`
    : `${label} was not confirmed. Please try again.`;
}

export async function authenticateForBiometricLogin(label = 'Biometrics') {
  await waitForUiIdle(300);
  const result = await authenticateWithBiometrics(`Sign in with ${label}`);
  if (!result.success) {
    throw new Error(biometricFailureMessage(label, result));
  }
  return true;
}

export async function getStoredBiometricSession() {
  const enabled = await isBiometricLoginEnabled();
  if (!enabled) return null;
  const email = await read(EMAIL_KEY);
  const refresh = await read(REFRESH_KEY);
  if (!email || !refresh) return null;
  return { email, refresh };
}
