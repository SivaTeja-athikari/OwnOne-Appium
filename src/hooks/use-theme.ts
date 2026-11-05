import { Colors } from "@/constants/theme";
import { ENVIRONMENT_PRESENTATION } from "@/config/environment/presentation";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useEnvironment } from "@/hooks/use-environment";

export function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const colors = Colors[dark ? "dark" : "light"];
  const { environment } = useEnvironment();
  const identity = ENVIRONMENT_PRESENTATION[environment];
  const darkAccents = {
    development: "#75AAFF",
    qa: "#F5B85D",
    staging: "#BE9AFF",
    production: "#64D5BD",
  };
  return {
    ...colors,
    accent: dark ? darkAccents[environment] : identity.color,
    accentSolid: identity.color,
    backgroundSelected: dark ? identity.darkTint : identity.tint,
  };
}
