import type { AppEnvironment } from "@/config/environment/types";
import type { LocalAuthSession } from "./local-auth-api";

let databasePromise: Promise<import("expo-sqlite").SQLiteDatabase> | null = null;

function database() {
  databasePromise ??= (async () => {
    const SQLite = await import("expo-sqlite");
    const db = await SQLite.openDatabaseAsync("ownone-offline.db");
    await db.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cached_profiles (
      environment TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signup_drafts (
      environment TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
    return db;
  })();
  return databasePromise;
}

export interface SignupDraft {
  fullName: string;
  email: string;
  tenantIds: string[];
}

/** Store non-secret signup fields locally; passwords must never be persisted in a draft. */
export async function saveSignupDraft(environment: AppEnvironment, draft: SignupDraft) {
  const db = await database();
  const sanitized = {
    fullName: draft.fullName.slice(0, 120),
    email: draft.email.slice(0, 254),
    tenantIds: [...new Set(draft.tenantIds)].slice(0, 20),
  };
  await db.runAsync(
    "INSERT INTO signup_drafts (environment, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(environment) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    environment,
    JSON.stringify(sanitized),
    new Date().toISOString(),
  );
}

export async function readSignupDraft(environment: AppEnvironment): Promise<SignupDraft | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM signup_drafts WHERE environment = ?",
    environment,
  );
  if (!row) return null;
  try {
    const value = JSON.parse(row.payload) as Partial<SignupDraft>;
    if (typeof value.fullName !== "string" || typeof value.email !== "string" || !Array.isArray(value.tenantIds))
      throw new Error("Invalid signup draft");
    return { fullName: value.fullName, email: value.email, tenantIds: value.tenantIds.filter((id): id is string => typeof id === "string") };
  } catch {
    await clearSignupDraft(environment);
    return null;
  }
}

export async function clearSignupDraft(environment: AppEnvironment) {
  const db = await database();
  await db.runAsync("DELETE FROM signup_drafts WHERE environment = ?", environment);
}

export async function saveOfflineProfile(environment: AppEnvironment, session: LocalAuthSession) {
  const db = await database();
  const cacheable = { ...session, authToken: "", refreshToken: "offline-cache" };
  await db.runAsync(
    "INSERT INTO cached_profiles (environment, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(environment) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    environment,
    JSON.stringify(cacheable),
    new Date().toISOString(),
  );
}

export async function readOfflineProfile(environment: AppEnvironment): Promise<LocalAuthSession | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM cached_profiles WHERE environment = ?",
    environment,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as LocalAuthSession;
  } catch {
    await db.runAsync("DELETE FROM cached_profiles WHERE environment = ?", environment);
    return null;
  }
}

export async function clearOfflineProfile(environment: AppEnvironment) {
  const db = await database();
  await db.runAsync("DELETE FROM cached_profiles WHERE environment = ?", environment);
}
