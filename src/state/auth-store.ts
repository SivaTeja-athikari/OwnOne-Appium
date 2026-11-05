import { create } from "zustand";
import type {
  AuthenticatedUser,
  TenantConfig,
  TenantId,
  UserRole,
  TenantPermission,
} from "@/config/company/types";
import { TENANT_REGISTRY } from "@/config/company/tenants";
import { validateUserTenantAccess } from "@/config/company/validation";
import { getActiveEnvironmentConfig } from "@/config/environment/index";
import type {
  LocalAuthApi,
  LocalAuthSession,
  SignupInput,
} from "@/core/auth/local-auth-api";
import {
  appQueryClient,
  clearTenantCache,
  clearAllTenantCaches,
} from "./query-client";
import { setApiAuthTokenGetter, setApiTenantIdGetter } from "@/core/api/client";

export interface AuthState {
  isAuthenticated: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  currentUser: AuthenticatedUser | null;
  activeTenant: TenantConfig | null;
  activeRole: UserRole | null;
  authToken: string | null;
  refreshToken: string | null;
  initialize: (background?: boolean) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  switchTenant: (tenantId: TenantId) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  hasPermission: (permission: string) => boolean;
  isFeatureEnabled: (feature: string) => boolean;
}
const emptySession = {
  isAuthenticated: false,
  currentUser: null,
  activeTenant: null,
  activeRole: null,
  authToken: null,
  refreshToken: null,
};
function sessionState(session: LocalAuthSession) {
  const activeTenant = TENANT_REGISTRY[session.activeTenantId];
  if (!activeTenant) throw new Error("This workspace is no longer available.");
  return {
    isAuthenticated: true,
    currentUser: session.user,
    activeTenant,
    activeRole: validateUserTenantAccess(session.user, session.activeTenantId),
    authToken: session.authToken,
    refreshToken: session.refreshToken,
  };
}
const remoteApi: LocalAuthApi = {
  signup: async (input, env) => (await import("@/core/auth/remote-auth-api")).remoteAuthApi.signup(input, env),
  login: async (input, env) => (await import("@/core/auth/remote-auth-api")).remoteAuthApi.login(input, env),
  restore: async (env) => (await import("@/core/auth/remote-auth-api")).remoteAuthApi.restore(env),
  switchTenant: async (id, env) => (await import("@/core/auth/remote-auth-api")).remoteAuthApi.switchTenant(id, env),
  logout: async (env) => (await import("@/core/auth/remote-auth-api")).remoteAuthApi.logout(env),
};
export function createAuthStore(api: LocalAuthApi = remoteApi) {
  let revision = 0;
  return create<AuthState>((set, get) => {
    const authenticate = async (
      request: (
        env: ReturnType<typeof getActiveEnvironmentConfig>["environment"],
      ) => Promise<{ data: LocalAuthSession }>,
    ) => {
      if (get().isLoading) return;
      const operation = ++revision;
      const env = getActiveEnvironmentConfig().environment;
      set({ isLoading: true, error: null });
      try {
        const response = await request(env);
        if (
          operation !== revision ||
          env !== getActiveEnvironmentConfig().environment
        )
          return;
        set({
          ...sessionState(response.data),
          isLoading: false,
          isHydrated: true,
          error: null,
        });
      } catch (err) {
        if (operation === revision)
          set({
            isLoading: false,
            error:
              err instanceof Error
                ? err.message
                : "Unable to sign in. Please try again.",
          });
        throw err;
      }
    };
    return {
      ...emptySession,
      isHydrated: false,
      isLoading: false,
      error: null,
      initialize: async (background = false) => {
        const operation = ++revision;
        const env = getActiveEnvironmentConfig().environment;
        if (!background) clearAllTenantCaches(appQueryClient);
        if (!background) set({
          ...emptySession,
          isHydrated: false,
          isLoading: false,
          error: null,
        });
        try {
          const session = await api.restore(env);
          if (
            operation === revision &&
            env === getActiveEnvironmentConfig().environment
          )
            set({
              ...(session ? sessionState(session) : emptySession),
              isHydrated: true,
            });
        } catch (error) {
          if (operation === revision)
            set({
              ...emptySession,
              isHydrated: true,
              error: error instanceof Error
                ? error.message
                : "The authentication server could not be reached. Please try again.",
            });
        }
      },
      signup: async (input) => {
        if (get().isLoading) return;
        const operation = ++revision;
        const env = getActiveEnvironmentConfig().environment;
        set({ isLoading: true, error: null });
        try {
          await api.signup(input, env);
          if (
            operation !== revision ||
            env !== getActiveEnvironmentConfig().environment
          )
            throw new Error("Environment changed. Please try again.");
          set({
            ...emptySession,
            isLoading: false,
            isHydrated: true,
            error: null,
          });
        } catch (err) {
          if (operation === revision)
            set({
              isLoading: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Unable to create your account. Please try again.",
            });
          throw err;
        }
      },
      login: (email, password) =>
        authenticate((env) => api.login({ email, password }, env)),
      switchTenant: async (id) => {
        if (!get().authToken) {
          const error = "Connect to the internet and sign in to change workspaces.";
          set({ error });
          throw new Error(error);
        }
        const previousTenantId = get().activeTenant?.id;
        await authenticate((env) => api.switchTenant(id, env));
        if (previousTenantId)
          clearTenantCache(appQueryClient, previousTenantId);
      },
      logout: async () => {
        const operation = ++revision;
        const env = getActiveEnvironmentConfig().environment;
        set({ isLoading: true, error: null });
        try {
          await api.logout(env);
          clearAllTenantCaches(appQueryClient);
          if (operation === revision)
            set({ ...emptySession, isLoading: false, isHydrated: true });
        } catch {
          if (operation === revision)
            set({
              isLoading: false,
              error: "Unable to sign out. Please try again.",
            });
        }
      },
      clearError: () => set({ error: null }),
      hasPermission: (permission) => {
        const { activeTenant, activeRole } = get();
        return Boolean(
          activeTenant &&
          activeRole &&
          activeTenant.rolePermissions[activeRole]?.includes(
            permission as TenantPermission,
          ),
        );
      },
      isFeatureEnabled: (feature) => {
        const tenant = get().activeTenant;
        return Boolean(
          tenant && tenant.features[feature as keyof typeof tenant.features],
        );
      },
    };
  });
}
export const useAuthStore = createAuthStore();
setApiAuthTokenGetter(() => useAuthStore.getState().authToken);
setApiTenantIdGetter(() => useAuthStore.getState().activeTenant?.id ?? null);
