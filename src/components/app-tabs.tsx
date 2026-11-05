import { NativeTabs } from "expo-router/native-tabs";
import { useTheme } from "@/hooks/use-theme";

export default function AppTabs() {
  const theme = useTheme();
  return (
    <NativeTabs
      backgroundColor={theme.surface}
      tintColor={theme.accent}
      indicatorColor={theme.backgroundSelected}
      iconColor={{ default: theme.textSecondary, selected: theme.accent }}
      labelStyle={{
        default: { color: theme.textSecondary, fontSize: 11 },
        selected: { color: theme.accent, fontWeight: "600" },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "doc.text", selected: "doc.text.fill" }}
          md="description"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
