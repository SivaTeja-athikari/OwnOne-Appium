import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/state/auth-store";
import { AppIcon, Button, Card, ui } from "./workspace-ui";

export function WorkspaceScreen({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  const theme = useTheme();
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  return (
    <SafeAreaView
      edges={["left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 8 }}>
          <Text
            testID="workspace_screen_title"
            accessibilityRole="header"
            style={[ui.title, { color: theme.text, fontSize: 28, lineHeight: 34 }]}
          >
            {title}
          </Text>
          <Text style={[ui.body, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
        {authenticated ? (
          children
        ) : (
          <Card>
            <AppIcon name="lock" color={theme.accent} size={30} />
            <Text style={[ui.heading, { color: theme.text }]}>
              Your reports are waiting
            </Text>
            <Text style={[ui.body, { color: theme.textSecondary }]}>
              Sign in online to capture and submit your reports.
            </Text>
            <Button icon="arrow" onPress={() => router.navigate("/")}>
              Go to sign in
            </Button>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
