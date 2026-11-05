import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createAuthStore } from "../src/state/auth-store";
import { createLocalAuthApi } from "../src/core/auth/local-auth-api";
import { switchEnvironment } from "../src/config/environment/index";
import {
  appQueryClient,
  createTenantQueryKey,
  clearTenantCache,
  clearAllTenantCaches,
} from "../src/state/query-client";
import { UnauthorizedTenantAccessError } from "../src/config/company/validation";

const signupInput = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  password: "LocalAccount2026!",
  tenantIds: ["acme-corp", "apex-health"],
};
function setup() {
  const saved = new Map<string, string>();
  let sequence = 0;
  let timestamp = Date.now();
  const storage = {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: async (key: string) => {
      saved.delete(key);
    },
  };
  // Deterministic dependencies belong only to this unit-test fixture, never the running app.
  const api = createLocalAuthApi({
    storage,
    hashPassword: async (password, salt) =>
      `derived:${salt}:${password.length}:${[...password].map((letter) => letter.charCodeAt(0)).join("-")}`,
    randomId: async () => `test-id-${++sequence}`,
    now: () => timestamp,
  });
  return {
    saved,
    api,
    store: createAuthStore(api),
    advanceTime: () => {
      timestamp += 8 * 24 * 60 * 60 * 1000;
    },
  };
}

async function registerAndLogin(
  store: ReturnType<typeof createAuthStore>,
  input = signupInput,
) {
  await store.getState().signup(input);
  await store.getState().login(input.email, input.password);
}

describe("Local signup, persistent authentication & tenant isolation", () => {
  beforeEach(() => {
    switchEnvironment("development");
    clearAllTenantCaches(appQueryClient);
  });
  afterEach(() => {
    clearAllTenantCaches(appQueryClient);
  });

  it("rejects login for accounts that have never signed up", async () => {
    const { store } = setup();
    await assert.rejects(
      () => store.getState().login("admin@enterprise.com", "anything"),
      /Create an account first/,
    );
    assert.strictEqual(store.getState().isAuthenticated, false);
  });
  it("registers only through signup and returns the entered profile", async () => {
    const { store, saved, api } = setup();
    await store.getState().signup(signupInput);
    assert.strictEqual(store.getState().isAuthenticated, false);
    assert.strictEqual(await api.restore("development"), null);
    await store.getState().login(signupInput.email, signupInput.password);
    assert.strictEqual(store.getState().isAuthenticated, true);
    assert.strictEqual(
      store.getState().currentUser?.fullName,
      signupInput.fullName,
    );
    assert.strictEqual(store.getState().activeRole, "admin");
    assert(saved.get("ownone.accounts.v1.development"));
    assert(
      !saved
        .get("ownone.accounts.v1.development")!
        .includes(signupInput.password),
    );
  });
  it("persists accounts after logout and verifies the password on later login", async () => {
    const { store } = setup();
    await registerAndLogin(store);
    await store.getState().logout();
    await assert.rejects(
      () => store.getState().login(signupInput.email, "wrong-password"),
      /Email or password is incorrect/,
    );
    assert.strictEqual(store.getState().isAuthenticated, false);
    await store
      .getState()
      .login(signupInput.email.toUpperCase(), signupInput.password);
    assert.strictEqual(store.getState().currentUser?.email, signupInput.email);
  });
  it("rejects duplicate emails without replacing the existing account", async () => {
    const { api } = setup();
    await api.signup(signupInput, "development");
    await assert.rejects(
      () =>
        api.signup(
          { ...signupInput, email: " ALEX@EXAMPLE.COM " },
          "development",
        ),
      /already exists/,
    );
    assert.strictEqual(
      (await api.login(signupInput, "development")).data.user.fullName,
      signupInput.fullName,
    );
  });
  it("validates names, email, password, and workspace choices", async () => {
    const { api } = setup();
    for (const input of [
      { ...signupInput, fullName: "" },
      { ...signupInput, email: "invalid" },
      { ...signupInput, password: "short" },
      { ...signupInput, tenantIds: [] },
      { ...signupInput, tenantIds: ["unknown"] },
    ]) {
      await assert.rejects(() => api.signup(input, "development"));
    }
    assert.strictEqual(await api.restore("development"), null);
  });
  it("restores a saved session and selected company in a fresh store", async () => {
    const { store, api } = setup();
    await registerAndLogin(store);
    await store.getState().switchTenant("apex-health");
    const restartedStore = createAuthStore(api);
    await restartedStore.getState().initialize();
    assert.strictEqual(restartedStore.getState().isAuthenticated, true);
    assert.strictEqual(
      restartedStore.getState().activeTenant?.id,
      "apex-health",
    );
    assert.strictEqual(restartedStore.getState().isHydrated, true);
  });
  it("rejects unauthorized companies and preserves the selected company", async () => {
    const { store } = setup();
    await registerAndLogin(store);
    await assert.rejects(
      () => store.getState().switchTenant("zenith-financial"),
      UnauthorizedTenantAccessError,
    );
    assert.strictEqual(store.getState().activeTenant?.id, "acme-corp");
  });
  it("purges the previous company cache after a successful switch", async () => {
    const { store } = setup();
    await registerAndLogin(store);
    const key = createTenantQueryKey("acme-corp", "analytics");
    appQueryClient.setQueryData(key, { volume: 100 });
    await store.getState().switchTenant("apex-health");
    assert.strictEqual(appQueryClient.getQueryData(key), undefined);
  });
  it("retains each environment’s accounts and restores only that environment’s session", async () => {
    const { store } = setup();
    await registerAndLogin(store);
    switchEnvironment("qa");
    await store.getState().initialize();
    assert.strictEqual(store.getState().isAuthenticated, false);
    await assert.rejects(() =>
      store.getState().login(signupInput.email, signupInput.password),
    );
    await registerAndLogin(store, {
      ...signupInput,
      fullName: "QA Account",
      password: "DifferentQA2026!",
    });
    switchEnvironment("development");
    await store.getState().initialize();
    assert.strictEqual(
      store.getState().currentUser?.fullName,
      signupInput.fullName,
    );
    switchEnvironment("qa");
    await store.getState().initialize();
    assert.strictEqual(store.getState().currentUser?.fullName, "QA Account");
  });
  it("expires old sessions while retaining the account for sign-in", async () => {
    const { api, advanceTime } = setup();
    await api.signup(signupInput, "development");
    await api.login(signupInput, "development");
    advanceTime();
    assert.strictEqual(await api.restore("development"), null);
    assert.strictEqual(
      (await api.login(signupInput, "development")).status,
      200,
    );
  });
  it("checks permissions against the current company policy", async () => {
    const { store } = setup();
    await registerAndLogin(store);
    assert.strictEqual(
      store.getState().hasPermission("transactions:create"),
      true,
    );
    await store.getState().switchTenant("apex-health");
    assert.strictEqual(
      store.getState().hasPermission("transactions:create"),
      false,
    );
    assert.strictEqual(store.getState().hasPermission("audit:view"), true);
  });
  it("clears session and cached data on logout without deleting registered accounts", async () => {
    const { store, saved } = setup();
    await registerAndLogin(store);
    await store.getState().logout();
    assert.strictEqual(store.getState().isAuthenticated, false);
    assert.strictEqual(store.getState().currentUser, null);
    assert.strictEqual(saved.has("ownone.session.v1.development"), false);
    assert.strictEqual(saved.has("ownone.accounts.v1.development"), true);
  });
  it("keeps unrelated company caches separate", () => {
    const acmeKey = createTenantQueryKey("acme-corp", "summary");
    const apexKey = createTenantQueryKey("apex-health", "summary");
    appQueryClient.setQueryData(acmeKey, { volume: 10 });
    appQueryClient.setQueryData(apexKey, { volume: 20 });
    clearTenantCache(appQueryClient, "acme-corp");
    assert.strictEqual(appQueryClient.getQueryData(acmeKey), undefined);
    assert.deepStrictEqual(appQueryClient.getQueryData(apexKey), {
      volume: 20,
    });
  });
});
