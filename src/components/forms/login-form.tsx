import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuthStore } from "@/state/auth-store";
import { Button, Card, ui } from "@/components/ui/workspace-ui";
import { AuthField } from "./auth-field";
import { useTheme } from "@/hooks/use-theme";

export function LoginForm({
  initialEmail = "",
  registered = false,
}: {
  initialEmail?: string;
  registered?: boolean;
}) {
  const { login, isLoading, error, clearError } = useAuthStore();
  const theme = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const submit = async () => {
    if (isLoading) return;
    setValidation(null);
    clearError();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setValidation("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setValidation("Please enter your password.");
      return;
    }
    try {
      await login(email, password);
    } catch {
      /* The store exposes the server error. */
    }
  };
  return (
    <Card testID="login_card" style={authStyles.card}>
      <View style={authStyles.heading}>
        <Text
          accessibilityRole="header"
          style={[ui.title, { color: theme.text }]}
        >
          Welcome back.
        </Text>
        <Text style={[ui.body, { color: theme.textSecondary }]}>
          Sign in to capture and submit your field reports.
        </Text>
      </View>
      {registered && (
        <View
          testID="signup_success_message"
          accessible
          accessibilityLabel="Account created. Sign in to start capturing reports."
          accessibilityLiveRegion="polite"
          style={[
            authStyles.error,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Text style={[ui.small, { color: theme.success }]}>
            Account created. Sign in to start capturing reports.
          </Text>
        </View>
      )}
      <AuthField
        label="Email address"
        testID="login_email_input"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setValidation(null);
          clearError();
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />
      <AuthField
        label="Password"
        password
        testID="login_password_input"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setValidation(null);
          clearError();
        }}
        placeholder="Enter your password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!isLoading}
      />
      {(validation || error) && (
        <View
          testID="login_error_message"
          accessible
          accessibilityLabel={validation || error || undefined}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            authStyles.error,
            { backgroundColor: theme.dangerBackground },
          ]}
        >
          <Text style={[ui.small, { color: theme.danger }]}>
            {validation || error}
          </Text>
        </View>
      )}
      <Button
        testID="login_submit_btn"
        accessibilityLabel="Sign in"
        disabled={isLoading}
        onPress={submit}
        icon={isLoading ? undefined : "arrow"}
      >
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>
      <View
        style={[
          authStyles.separator,
          {
            borderColor: theme.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 5,
          },
        ]}
      >
        <Text style={[ui.body, { color: theme.textSecondary }]}>
          New to OwnOne?
        </Text>
        <Link href="/signup" onPress={clearError} asChild>
          <Pressable
            testID="login_signup_link"
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[ui.body, { color: theme.accent, fontWeight: "700" }]}>
              Create an account
            </Text>
          </Pressable>
        </Link>
      </View>
    </Card>
  );
}
export const authStyles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 470,
    padding: 26,
    gap: 22,
    alignSelf: "center",
  },
  heading: { gap: 10 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  error: { padding: 13, borderRadius: 12 },
  separator: { borderTopWidth: 1, paddingTop: 20 },
});
