import { AuthShell } from "@/components/forms/auth-shell";
import { SignupForm } from "@/components/forms/signup-form";

export default function SignupScreen() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
