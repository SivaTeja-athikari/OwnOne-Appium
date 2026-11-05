import type { ISecureStorage } from './types';

// In-memory store for unit test execution and non-native web fallbacks
const inMemoryStore = new Map<string, string>();

class PlatformSecureStorage implements ISecureStorage {
  private isNative(): boolean {
    try {
      if (typeof require !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const rn = require('react-native');
        return rn?.Platform?.OS === 'ios' || rn?.Platform?.OS === 'android';
      }
    } catch {
      // Running in Node or headless test runner
    }
    return false;
  }

  async getItem(key: string): Promise<string | null> {
    if (this.isNative()) {
      try {
        const SecureStore = await import('expo-secure-store');
        return await SecureStore.getItemAsync(key);
      } catch (err) {
        console.warn(`[SecureStorage] Native get failed for key '${key}', falling back to memory:`, err);
        return inMemoryStore.get(key) ?? null;
      }
    }
    return inMemoryStore.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.isNative()) {
      try {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        return;
      } catch (err) {
        console.warn(`[SecureStorage] Native set failed for key '${key}', falling back to memory:`, err);
        inMemoryStore.set(key, value);
        return;
      }
    }
    inMemoryStore.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.isNative()) {
      try {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.deleteItemAsync(key);
      } catch {
        inMemoryStore.delete(key);
      }
    }
    inMemoryStore.delete(key);
  }

  async clear(): Promise<void> {
    inMemoryStore.clear();
  }
}

export const secureStorage: ISecureStorage = new PlatformSecureStorage();
export * from './types';
