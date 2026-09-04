import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore is a no-op on web (expo-secure-store web stub is empty).
 * Use localStorage on web so sessions survive refresh.
 *
 * Native notes:
 * - SecureStore keys must be alphanumeric / `.` / `-` / `_` (no `:`).
 * - Keychain calls can hang on Expo Go; always bound with a timeout.
 */

const memory = new Map<string, string>();
const STORE_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms = STORE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SecureStore timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function getPersistentItem(key: string): Promise<string | null> {
  if (memory.has(key)) return memory.get(key) ?? null;

  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    const value = await withTimeout(SecureStore.getItemAsync(key));
    if (value != null) memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function setPersistentItem(key: string, value: string | null): Promise<void> {
  if (value == null) memory.delete(key);
  else memory.set(key, value);

  if (Platform.OS === 'web') {
    try {
      if (value == null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore quota / private mode
    }
    return;
  }

  void (async () => {
    try {
      if (value == null) await withTimeout(SecureStore.deleteItemAsync(key));
      else await withTimeout(SecureStore.setItemAsync(key, value));
    } catch {
      // ignore
    }
  })();
}

export async function getSecureItem(
  key: string,
  options?: SecureStore.SecureStoreOptions,
): Promise<string | null> {
  if (memory.has(key)) return memory.get(key) ?? null;

  if (Platform.OS === 'web') {
    return getPersistentItem(key);
  }
  try {
    const value = options
      ? await withTimeout(SecureStore.getItemAsync(key, options))
      : await withTimeout(SecureStore.getItemAsync(key));
    if (value != null) memory.set(key, value);
    return value;
  } catch {
    try {
      const value = await withTimeout(SecureStore.getItemAsync(key));
      if (value != null) memory.set(key, value);
      return value;
    } catch {
      return null;
    }
  }
}

export async function setSecureItem(
  key: string,
  value: string | null,
  options?: SecureStore.SecureStoreOptions,
): Promise<void> {
  if (value == null) memory.delete(key);
  else memory.set(key, value);

  if (Platform.OS === 'web') {
    await setPersistentItem(key, value);
    return;
  }

  void (async () => {
    try {
      if (value == null) {
        await withTimeout(SecureStore.deleteItemAsync(key, options)).catch(() => undefined);
        await withTimeout(SecureStore.deleteItemAsync(key)).catch(() => undefined);
        return;
      }
      if (options) await withTimeout(SecureStore.setItemAsync(key, value, options));
      else await withTimeout(SecureStore.setItemAsync(key, value));
    } catch {
      try {
        if (value != null) await withTimeout(SecureStore.setItemAsync(key, value));
      } catch {
        // ignore
      }
    }
  })();
}
