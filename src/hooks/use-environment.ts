import { useSyncExternalStore } from "react";
import {
  getActiveEnvironmentConfig,
  subscribeToEnvironmentChanges,
} from "@/config/environment";

export function useEnvironment() {
  return useSyncExternalStore(
    subscribeToEnvironmentChanges,
    getActiveEnvironmentConfig,
    getActiveEnvironmentConfig,
  );
}
