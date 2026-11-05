import { createLocalAuthApi } from "./local-auth-api";

// Lazy platform adapters keep the service testable without loading native modules in Node.
export const localAuthApi = createLocalAuthApi({
  storage: {
    getItem: async (key) =>
      (await import("@/core/storage/local-storage")).localStorage.getItem(key),
    setItem: async (key, value) =>
      (await import("@/core/storage/local-storage")).localStorage.setItem(
        key,
        value,
      ),
    removeItem: async (key) =>
      (await import("@/core/storage/local-storage")).localStorage.removeItem(
        key,
      ),
  },
  hashPassword: async (password, salt) =>
    (await import("./password")).hashPassword(password, salt),
  randomId: async () => (await import("expo-crypto")).randomUUID(),
});
