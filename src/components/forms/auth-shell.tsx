import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand, ui } from "@/components/ui/workspace-ui";
import { useTheme } from "@/hooks/use-theme";

export function AuthShell({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView testID="auth_scroll_view" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 28, width: "100%", maxWidth: 560, alignSelf: "center" }}>
          <View style={{ gap: 16 }}>
            <Brand />
            <Text style={[ui.heading, { color: theme.text }]}>Capture now. Send when connected.</Text>
            <Text style={[ui.body, { color: theme.textSecondary }]}>Sign in online to get started. Your field reports stay with you when the connection drops.</Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
