import { useLocalSearchParams } from "expo-router";
import { AuthShell } from "@/components/forms/auth-shell";
import { LoginForm } from "@/components/forms/login-form";

export default function LoginScreen() {
  const { email, registered } = useLocalSearchParams<{
    email?: string;
    registered?: string;
  }>();
  return (
    <AuthShell>
      <LoginForm
        key={`${registered ?? ""}:${email ?? ""}`}
        initialEmail={email}
        registered={registered === "1"}
      />
    </AuthShell>
  );
}
