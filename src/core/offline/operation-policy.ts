/** Offline behavior for workflows that exist in the current application. */
export const OFFLINE_OPERATION_POLICY = {
  signIn: { offline: "blocked", replay: "never" },
  signUp: { offline: "save-draft-only", replay: "never" },
  workspaceRead: { offline: "cached-read-only", replay: "not-applicable" },
  workspaceSwitch: { offline: "blocked", replay: "never" },
  fieldReportCreate: { offline: "sqlite-outbox", replay: "foreground-authenticated-idempotent" },
  transactionCreate: { offline: "not-implemented", replay: "not-implemented" },
  reportExport: { offline: "not-implemented", replay: "not-implemented" },
  fileUpload: { offline: "not-implemented", replay: "not-implemented" },
  fileDownload: { offline: "not-implemented", replay: "not-implemented" },
} as const;

export type OfflineOperation = keyof typeof OFFLINE_OPERATION_POLICY;

export function offlineOperationMessage(operation: OfflineOperation): string {
  switch (operation) {
    case "signIn":
      return "Connect to the internet to verify your account. Sign-in is not available offline.";
    case "signUp":
      return "Your details are saved as a draft on this device. Connect to the internet to create your account.";
    case "workspaceSwitch":
      return "Connect to the internet and sign in to change workspaces.";
    default:
      return "This action is not available offline.";
  }
}
