import type { AppEnvironment } from "./types";

/** Visual identities are presentation-only; endpoint and security config stay in environments.ts. */
export const ENVIRONMENT_PRESENTATION = {
  development: {
    label: "Development",
    shortLabel: "DEV",
    color: "#2563EB",
    tint: "#EDF4FF",
    darkTint: "#1C3152",
    description: "Build, experiment, and explore.",
    dataset: "Sandbox dataset",
    icon: "code",
  },
  qa: {
    label: "Quality assurance",
    shortLabel: "QA",
    color: "#A65A08",
    tint: "#FFF5E6",
    darkTint: "#3D3020",
    description: "Validate the details. Test every scenario.",
    dataset: "Validation dataset",
    icon: "check",
  },
  staging: {
    label: "Staging",
    shortLabel: "STG",
    color: "#7C3AED",
    tint: "#F3EEFF",
    darkTint: "#33234E",
    description: "Rehearse the experience before release.",
    dataset: "Release preview dataset",
    icon: "sparkles",
  },
  production: {
    label: "Production",
    shortLabel: "LIVE",
    color: "#087F72",
    tint: "#E4F3EE",
    darkTint: "#203C36",
    description: "Your live workspace.",
    dataset: "Live workspace",
    icon: "lock",
  },
} as const satisfies Record<AppEnvironment, object>;
