import type { ComponentProps } from "react";
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Brand, AppIcon, type AppIconName } from "@/components/ui/workspace-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";

export default function AppTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.inner}>
          <Brand compact />
          <Text style={{ fontSize: 11, color: theme.textSecondary }}>
            Your work, connected.
          </Text>
        </View>
      </View>
      <TabSlot style={{ flex: 1, minHeight: 0 }} />
      <TabList
        style={[
          styles.bottom,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <TabTrigger name="overview" href="/" asChild>
          <TabButton icon="document" testID="tab_overview">
            Reports
          </TabButton>
        </TabTrigger>
        <TabTrigger name="account" href="/account" asChild>
          <TabButton icon="person" testID="tab_account">
            Account
          </TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}
function TabButton({
  children,
  isFocused,
  icon,
  ...props
}: Omit<TabTriggerSlotProps, "ref"> & {
  icon: AppIconName;
  ref?: ComponentProps<typeof Pressable>["ref"];
}) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.65 }]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isFocused
              ? theme.backgroundSelected
              : "transparent",
          },
        ]}
      >
        <AppIcon
          name={icon}
          size={22}
          color={isFocused ? theme.accent : theme.textSecondary}
        />
      </View>
      <Text
        style={{
          color: isFocused ? theme.accent : theme.textSecondary,
          fontSize: 11,
          fontWeight: isFocused ? "700" : "500",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, paddingHorizontal: 24, paddingVertical: 12 },
  inner: {
    width: "100%",
    maxWidth: 1072,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bottom: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tab: { minHeight: 54, flex: 1, maxWidth: 180, alignItems: "center", gap: 4 },
  icon: {
    width: 60,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
});
