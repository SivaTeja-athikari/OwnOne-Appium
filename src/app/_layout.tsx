import { useEffect, useRef } from "react";
import { restoreEnvironmentSelection, subscribeToEnvironmentChanges } from "@/config/environment";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAppNetworkState } from "@/hooks/use-app-network";
import { QueryClientProvider } from "@tanstack/react-query";
import { appQueryClient } from "@/state/query-client";
import { EnvironmentBanner } from "@/components/ui/environment-banner";
import { OfflineStatusBanner } from "@/components/ui/offline-status-banner";
import { Brand } from "@/components/ui/workspace-ui";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { useTheme } from "@/hooks/use-theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/state/auth-store";
import { SubmissionSync } from "@/features/submissions/submission-sync";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  useEffect(() => {
    void restoreEnvironmentSelection().finally(() => initialize());
    return subscribeToEnvironmentChanges(() => {
      void initialize();
    });
  }, [initialize]);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authToken = useAuthStore((state) => state.authToken);
  const network = useAppNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const wasOffline = useRef(false);
  useEffect(() => {
    // Revalidate persisted credentials without unmounting the active form.
    if (wasOffline.current && !offline && isAuthenticated && authToken)
      void initialize(true);
    wasOffline.current = offline;
    if (!offline && isAuthenticated && !authToken) {
      void initialize(true);
      const retry = setInterval(() => void initialize(true), 30000);
      return () => clearInterval(retry);
    }
  }, [offline, initialize, isAuthenticated, authToken]);
  const scheme = useColorScheme();
  const theme = useTheme();
  const navigationTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <QueryClientProvider client={appQueryClient}>
      <ThemeProvider
        value={{
          ...navigationTheme,
          colors: {
            ...navigationTheme.colors,
            primary: theme.accent,
            background: theme.background,
            card: theme.surface,
            text: theme.text,
            border: theme.border,
          },
        }}
      >
        <SafeAreaView
          edges={["top"]}
          style={[styles.root, { backgroundColor: theme.background }]}
        >
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <EnvironmentBanner />
          <OfflineStatusBanner />
          <SubmissionSync />
          <AnimatedSplashOverlay />
          {!isHydrated ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
              }}
            >
              <Brand />
              <ActivityIndicator color={theme.accent} />
              <Text style={{ color: theme.textSecondary }}>
                Getting your reports ready…
              </Text>
            </View>
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background },
              }}
            >
              <Stack.Protected guard={!isAuthenticated}>
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
              </Stack.Protected>
              <Stack.Protected guard={isAuthenticated}>
                <Stack.Screen name="(tabs)" />
              </Stack.Protected>
            </Stack>
          )}
        </SafeAreaView>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
});
