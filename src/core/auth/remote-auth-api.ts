import { firebasePersistence } from "./firebase-persistence";
import * as Network from "expo-network";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
} from "firebase/auth";
import {
  doc,
  getDocFromServer,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import { TENANT_REGISTRY } from "@/config/company/tenants";
import { validateUserTenantAccess } from "@/config/company/validation";
import type { AuthenticatedUser, TenantId } from "@/config/company/types";
import type { AppEnvironment } from "@/config/environment/types";
import { validateSignup, type LoginInput, type LocalAuthSession, type SignupInput } from "./local-auth-api";
import { clearOfflineProfile, clearSignupDraft, readOfflineProfile, saveOfflineProfile } from "./offline-profile-cache";

const offlineMessage = "Internet is required to sign in and open a workspace. Reconnect and try again.";
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
export async function submissionCredentials(userId: string) {
  const service = services();
  await service.auth.authStateReady();
  if (service.auth.currentUser?.uid !== userId)
    throw new Error("Sign in online to send your saved reports.");
  return { token: await service.auth.currentUser.getIdToken(), projectId: firebaseConfig.projectId! };
}
function services() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId)
    throw new Error("Online authentication is not configured. Ask the app administrator to connect Firebase.");
  app ??= getApps().find((candidate) => candidate.name === "ownone-online") ??
    initializeApp(firebaseConfig, "ownone-online");
  if (!auth) {
    auth = initializeAuth(app, { persistence: firebasePersistence });
  }
  return { auth, db: getFirestore(app) };
}

async function requireInternet() {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false || state.isInternetReachable === false)
    throw new Error(offlineMessage);
}

function friendlyError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code) : "";
  if (code === "auth/email-already-in-use") return new Error("An account with this email already exists. Sign in instead.");
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return new Error("Email or password is incorrect.");
  if (code === "auth/network-request-failed" || code === "unavailable") return new Error(offlineMessage);
  return error instanceof Error ? error : new Error("The authentication server could not be reached. Try again.");
}

interface RemoteProfile {
  fullName: string;
  tenantIds: TenantId[];
  assignedAt: string;
  activeTenantId: TenantId;
}
async function serverSession(env: AppEnvironment): Promise<LocalAuthSession | null> {
  await requireInternet();
  const { auth, db } = services();
  await auth.authStateReady();
  const identity = auth.currentUser;
  if (!identity) return null;
  // Force a server token refresh. A cached Firebase session alone never opens the app.
  const authToken = await identity.getIdToken(true);
  const snapshot = await getDocFromServer(doc(db, "environments", env, "profiles", identity.uid));
  if (!snapshot.exists()) throw new Error("Your account profile is unavailable. Contact support.");
  const profile = snapshot.data() as RemoteProfile;
  if (!profile.fullName || !Array.isArray(profile.tenantIds) || !profile.tenantIds.length)
    throw new Error("Your account profile is incomplete. Contact support.");
  const user: AuthenticatedUser = {
    id: identity.uid,
    email: identity.email ?? "",
    fullName: profile.fullName,
    memberships: profile.tenantIds.filter((id) => Boolean(TENANT_REGISTRY[id])).map((tenantId) => ({
      tenantId, role: "viewer", status: "active", assignedAt: profile.assignedAt,
    })),
  };
  if (!user.memberships.length) throw new Error("No available workspace is assigned to this account.");
  const activeTenantId = profile.activeTenantId && user.memberships.some((entry) => entry.tenantId === profile.activeTenantId)
    ? profile.activeTenantId : user.memberships[0].tenantId;
  validateUserTenantAccess(user, activeTenantId);
  const session = { user, activeTenantId, authToken, refreshToken: "firebase-managed" };
  await saveOfflineProfile(env, session);
  return session;
}

export const remoteAuthApi = {
  async signup(input: SignupInput, env: AppEnvironment) {
    const validation = validateSignup(input);
    if (validation) throw new Error(validation);
    await requireInternet();
    const { auth, db } = services();
    const email = input.email.trim().toLowerCase();
    try {
      const created = await createUserWithEmailAndPassword(auth, email, input.password);
      await updateProfile(created.user, { displayName: input.fullName.trim() });
      const profile: RemoteProfile = {
        fullName: input.fullName.trim(),
        tenantIds: [...new Set(input.tenantIds)],
        assignedAt: new Date().toISOString(),
        activeTenantId: input.tenantIds[0],
      };
      await setDoc(doc(db, "environments", env, "profiles", created.user.uid), profile);
      await signOut(auth);
      await clearSignupDraft(env);
      const user: AuthenticatedUser = {
        id: created.user.uid, email, fullName: profile.fullName,
        memberships: profile.tenantIds.map((tenantId) => ({
          tenantId, role: "viewer", status: "active", assignedAt: profile.assignedAt,
        })),
      };
      return { data: user, status: 201, message: "Your account is ready." };
    } catch (error) {
      await signOut(auth).catch(() => undefined);
      throw friendlyError(error);
    }
  },
  async login(input: LoginInput, env: AppEnvironment) {
    await requireInternet();
    const { auth } = services();
    try {
      await signInWithEmailAndPassword(auth, input.email.trim().toLowerCase(), input.password);
      const session = await serverSession(env);
      if (!session) throw new Error("Sign in did not complete. Try again.");
      return { data: session, status: 200, message: "Welcome back." };
    } catch (error) {
      throw friendlyError(error);
    }
  },
  async restore(env: AppEnvironment) {
    const cached = await readOfflineProfile(env).catch(() => null);
    try {
      const { auth } = services();
      await auth.authStateReady();
      if (!auth.currentUser) return null;
      const matchingCache = cached?.user.id === auth.currentUser.uid ? cached : null;
      const state = await Network.getNetworkStateAsync().catch(() => null);
      if (!state || state.isConnected === false || state.isInternetReachable === false)
        return matchingCache;
      return await serverSession(env);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code) : "";
      if (["auth/network-request-failed", "unavailable", "deadline-exceeded"].includes(code))
        return auth?.currentUser?.uid === cached?.user.id ? cached : null;
      if (["auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled"].includes(code)) {
        await clearOfflineProfile(env);
        if (auth) await signOut(auth);
      }
      return null;
    }
  },
  async switchTenant(id: TenantId, env: AppEnvironment) {
    const session = await serverSession(env);
    if (!session) throw new Error(offlineMessage);
    validateUserTenantAccess(session.user, id);
    const { auth, db } = services();
    await setDoc(doc(db, "environments", env, "profiles", auth.currentUser!.uid),
      { activeTenantId: id }, { merge: true });
    const updated = { ...session, activeTenantId: id };
    await saveOfflineProfile(env, updated);
    return { data: updated, status: 200, message: "Workspace updated." };
  },
  async logout(env: AppEnvironment) {
    const { auth } = services();
    await signOut(auth);
    await clearOfflineProfile(env);
  },
};
