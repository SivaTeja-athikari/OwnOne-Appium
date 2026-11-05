// Firebase exposes this export through its React Native entry point. TypeScript
// resolves the web declaration, while Metro selects the native implementation.
// @ts-expect-error React Native conditional export
import { getReactNativePersistence } from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const keyFor = (key: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
export const firebasePersistence = getReactNativePersistence({
  getItem: async (key: string) => SecureStore.getItemAsync(await keyFor(key)),
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(await keyFor(key), value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  removeItem: async (key: string) => SecureStore.deleteItemAsync(await keyFor(key)),
});
