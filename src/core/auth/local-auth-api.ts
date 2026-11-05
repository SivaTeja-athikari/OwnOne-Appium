import type { AppEnvironment } from "@/config/environment/types";
import type { AuthenticatedUser, TenantId } from "@/config/company/types";
import { TENANT_REGISTRY } from "@/config/company/tenants";
import { validateUserTenantAccess } from "@/config/company/validation";
import type { ISecureStorage } from "@/core/storage/types";

export interface SignupInput {
  fullName: string;
  email: string;
  password: string;
  tenantIds: readonly TenantId[];
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface LocalAuthSession {
  user: AuthenticatedUser;
  activeTenantId: TenantId;
  authToken: string;
  refreshToken: string;
}
export interface LocalApiResponse<T> {
  data: T;
  status: number;
  message: string;
}
interface Account {
  user: AuthenticatedUser;
  passwordHash: string;
  salt: string;
}
interface StoredSession {
  userId: string;
  activeTenantId: TenantId;
  authToken: string;
  refreshToken: string;
  expiresAt: number;
}
export interface LocalAuthDependencies {
  storage: Pick<ISecureStorage, "getItem" | "setItem" | "removeItem">;
  hashPassword: (password: string, salt: string) => Promise<string>;
  randomId: () => Promise<string>;
  now?: () => number;
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateSignup(input: SignupInput): string | null {
  if (input.fullName.trim().length < 2) return "Please enter your full name.";
  if (!emailPattern.test(input.email.trim()))
    return "Please enter a valid email address.";
  if (input.password.length < 8)
    return "Use at least 8 characters for your password.";
  if (input.password.length > 128)
    return "Use no more than 128 characters for your password.";
  if (!input.tenantIds.length)
    return "Choose at least one workspace to get started.";
  if (input.tenantIds.some((id) => !TENANT_REGISTRY[id]))
    return "Please choose an available workspace.";
  return null;
}

/** A device-local API: no seeded users, no network requests, and no automatic registration on login. */
export function createLocalAuthApi({
  storage,
  hashPassword,
  randomId,
  now = Date.now,
}: LocalAuthDependencies) {
  const accountKey = (env: AppEnvironment) => `ownone.accounts.v1.${env}`;
  const sessionKey = (env: AppEnvironment) => `ownone.session.v1.${env}`;
  const readAccounts = async (env: AppEnvironment): Promise<Account[]> => {
    const raw = await storage.getItem(accountKey(env));
    if (!raw) return [];
    const accounts: unknown = JSON.parse(raw);
    if (!Array.isArray(accounts))
      throw new Error("Saved accounts could not be read. Please try again.");
    return accounts as Account[];
  };
  // Serialize writes so double submissions cannot overwrite another newly registered account.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const createSession = async (
    user: AuthenticatedUser,
    env: AppEnvironment,
    activeTenantId = user.memberships[0].tenantId,
  ): Promise<LocalAuthSession> => {
    const authToken = `local_${await randomId()}`;
    const refreshToken = `local_refresh_${await randomId()}`;
    await storage.setItem(
      sessionKey(env),
      JSON.stringify({
        userId: user.id,
        activeTenantId,
        authToken,
        refreshToken,
        expiresAt: now() + 7 * 24 * 60 * 60 * 1000,
      } satisfies StoredSession),
    );
    return { user, activeTenantId, authToken, refreshToken };
  };
  const restore = async (
    env: AppEnvironment,
  ): Promise<LocalAuthSession | null> => {
    const raw = await storage.getItem(sessionKey(env));
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as StoredSession;
      const account = (await readAccounts(env)).find(
        (item) => item.user.id === session.userId,
      );
      if (
        !account ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= now() ||
        !session.authToken ||
        !session.refreshToken
      ) {
        await storage.removeItem(sessionKey(env));
        return null;
      }
      validateUserTenantAccess(account.user, session.activeTenantId);
      return {
        user: account.user,
        activeTenantId: session.activeTenantId,
        authToken: session.authToken,
        refreshToken: session.refreshToken,
      };
    } catch {
      await storage.removeItem(sessionKey(env));
      return null;
    }
  };
  return {
    signup: (
      input: SignupInput,
      env: AppEnvironment,
    ): Promise<LocalApiResponse<AuthenticatedUser>> =>
      serialize(async () => {
        const validation = validateSignup(input);
        if (validation) throw new Error(validation);
        const email = input.email.trim().toLowerCase();
        const accounts = await readAccounts(env);
        if (accounts.some((account) => account.user.email === email))
          throw new Error(
            "An account with this email already exists in this environment. Sign in instead.",
          );
        const salt = await randomId();
        const passwordHash = await hashPassword(input.password, salt);
        const user: AuthenticatedUser = {
          id: `usr_${await randomId()}`,
          email,
          fullName: input.fullName.trim(),
          memberships: [...new Set(input.tenantIds)].map((tenantId) => ({
            tenantId,
            role: "admin",
            status: "active",
            assignedAt: new Date(now()).toISOString(),
          })),
        };
        await storage.setItem(
          accountKey(env),
          JSON.stringify([...accounts, { user, salt, passwordHash }]),
        );
        return {
          data: user,
          status: 201,
          message: "Your account is ready.",
        };
      }),
    login: async (
      input: LoginInput,
      env: AppEnvironment,
    ): Promise<LocalApiResponse<LocalAuthSession>> => {
      const account = (await readAccounts(env)).find(
        (item) => item.user.email === input.email.trim().toLowerCase(),
      );
      if (
        !account ||
        !input.password ||
        input.password.length > 128 ||
        (await hashPassword(input.password, account.salt)) !==
          account.passwordHash
      )
        throw new Error(
          "Email or password is incorrect. New here? Create an account first.",
        );
      return {
        data: await createSession(account.user, env),
        status: 200,
        message: "Welcome back.",
      };
    },
    restore,
    switchTenant: async (
      id: TenantId,
      env: AppEnvironment,
    ): Promise<LocalApiResponse<LocalAuthSession>> => {
      const session = await restore(env);
      if (!session) throw new Error("Please sign in to open a workspace.");
      validateUserTenantAccess(session.user, id);
      return {
        data: await createSession(session.user, env, id),
        status: 200,
        message: "Workspace updated.",
      };
    },
    logout: async (env: AppEnvironment) => {
      await storage.removeItem(sessionKey(env));
    },
  };
}
export type LocalAuthApi = ReturnType<typeof createLocalAuthApi>;
