import { it } from "node:test";
import assert from "node:assert";
import { createLocalAuthApi } from "../src/core/auth/local-auth-api";
import { createAuthStore } from "../src/state/auth-store";
import { switchEnvironment } from "../src/config/environment/index";

it("keeps authentication closed when the server rejects an offline request", async () => {
  switchEnvironment("development");
  const stored = new Map<string, string>();
  const local = createLocalAuthApi({
    storage: {
      getItem: async (key) => stored.get(key) ?? null,
      setItem: async (key, value) => { stored.set(key, value); },
      removeItem: async (key) => { stored.delete(key); },
    },
    hashPassword: async (password, salt) => `${salt}:${password}`,
    randomId: async () => "unit-test-id",
  });
  const api = {
    ...local,
    restore: async () => null,
    login: async () => { throw new Error("Internet is required to sign in."); },
    signup: async () => { throw new Error("Internet is required to create an account."); },
    switchTenant: async () => { throw new Error("Internet is required to open a workspace."); },
  };
  const store = createAuthStore(api);
  await store.getState().initialize();
  await assert.rejects(() => store.getState().login("alex.morgan@example.com", "ValidPassword1!"), /Internet is required/);
  assert.strictEqual(store.getState().isAuthenticated, false);
  await assert.rejects(() => store.getState().switchTenant("apex-health"), /sign in to change workspaces/i);
  assert.strictEqual(store.getState().isAuthenticated, false);
  assert.strictEqual(store.getState().currentUser, null);
  await assert.rejects(() => store.getState().signup({
    fullName: "Alex Morgan", email: "alex.morgan@example.com",
    password: "ValidPassword1!", tenantIds: ["acme-corp"],
  }), /Internet is required/);
  assert.strictEqual(store.getState().isAuthenticated, false);
});
