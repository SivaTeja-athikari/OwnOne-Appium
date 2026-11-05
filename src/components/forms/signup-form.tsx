import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuthStore } from "@/state/auth-store";
import { validateSignup } from "@/core/auth/local-auth-api";
import { Button, Card, ui } from "@/components/ui/workspace-ui";
import { AuthField } from "./auth-field";
import { authStyles } from "./login-form";
import { useTheme } from "@/hooks/use-theme";
import { useEnvironment } from "@/hooks/use-environment";
import { clearSignupDraft, readSignupDraft, saveSignupDraft } from "@/core/auth/offline-profile-cache";

export function SignupForm() {
  const { signup, isLoading, error, clearError } = useAuthStore();
  const theme = useTheme();
  const { environment } = useEnvironment();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const tenants = ["acme-corp"];
  const [validation, setValidation] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void readSignupDraft(environment).then((draft) => {
      if (!active) return;
      if (draft) {
        setFullName(draft.fullName);
        setEmail(draft.email);
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) setDraftReady(true);
    });
    return () => { active = false; };
  }, [environment]);
  useEffect(() => {
    if (!draftReady) return;
    void saveSignupDraft(environment, { fullName, email, tenantIds: ["acme-corp"] })
      .then(() => setDraftSaved(true))
      .catch(() => setDraftSaved(false));
  }, [draftReady, email, environment, fullName]);
  const clear = () => {
    setValidation(null);
    clearError();
  };
  const submit = async () => {
    if (isLoading) return;
    clear();
    const input = { fullName, email, password, tenantIds: tenants };
    const problem = validateSignup(input);
    if (problem) {
      setValidation(problem);
      return;
    }
    if (password !== confirmation) {
      setValidation("Your passwords do not match. Please try again.");
      return;
    }
    try {
      await signup(input);
      await clearSignupDraft(environment);
      router.dismissTo({
        pathname: "/login",
        params: { registered: "1", email: email.trim().toLowerCase() },
      });
    } catch {
      /* The store exposes the server error. */
    }
  };
  return (
    <Card testID="signup_card" style={authStyles.card}>
      <View style={authStyles.heading}>
        <Text style={[ui.body, { color: theme.textSecondary }]}>
          Create an account to capture reports and send them securely.
        </Text>
      </View>
      {draftSaved && (fullName.trim() || email.trim()) && (
        <Text testID="signup_draft_saved" style={[ui.small, { color: theme.textSecondary }]}>
          Saved on this device only. Not submitted to the server. Passwords are not saved.
        </Text>
      )}
      <AuthField
        label="Full name"
        testID="signup_name_input"
        value={fullName}
        onChangeText={(value) => {
          setFullName(value);
          clear();
        }}
        placeholder="Your full name"
        autoComplete="name"
        autoCapitalize="words"
        editable={!isLoading}
      />
      <AuthField
        label="Email address"
        testID="signup_email_input"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          clear();
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />
      <View style={{ gap: 7 }}>
        <AuthField
          label="Create password"
          password
          testID="signup_password_input"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            clear();
          }}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          maxLength={128}
          editable={!isLoading}
        />
        {password.length > 0 && (
          <Text
            style={[
              ui.small,
              {
                color:
                  password.length >= 8 ? theme.success : theme.textSecondary,
              },
            ]}
          >
            {password.length >= 8
              ? "✓ Password length looks good"
              : `${8 - password.length} more characters to go`}
          </Text>
        )}
      </View>
      <AuthField
        label="Confirm password"
        password
        testID="signup_confirm_input"
        value={confirmation}
        onChangeText={(value) => {
          setConfirmation(value);
          clear();
        }}
        placeholder="Re-enter your password"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!isLoading}
      />
      {(validation || error) && (
        <View
          testID="signup_error_message"
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
        testID="signup_submit_btn"
        disabled={isLoading}
        onPress={submit}
        icon={isLoading ? undefined : "arrow"}
      >
        {isLoading ? "Creating account…" : "Create account"}
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
          Already have an account?
        </Text>
        <Link href="/login" dismissTo onPress={clearError} asChild>
          <Pressable
            testID="signup_login_link"
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[ui.body, { color: theme.accent, fontWeight: "700" }]}>
              Sign in
            </Text>
          </Pressable>
        </Link>
      </View>
    </Card>
  );
}
