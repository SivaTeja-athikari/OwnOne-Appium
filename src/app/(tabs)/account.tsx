import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/state/auth-store";
import { useTheme } from "@/hooks/use-theme";
import { AppIcon, Button, Card, ui } from "@/components/ui/workspace-ui";
import { WorkspaceScreen } from "@/components/ui/workspace-screen";

export default function AccountScreen() {
  const { currentUser, authToken, logout, isLoading } = useAuthStore();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const initials = currentUser?.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  const signOut = async () => {
    setError(null);
    try { await logout(); }
    catch { setError('Could not sign out. Please try again.'); }
  };
  return (
    <WorkspaceScreen title="Your profile" subtitle="Your account. Your work, wherever you go.">
      <View testID="profile_identity_card" style={styles.identity}>
        <View style={styles.identityTop}>
          <View accessible accessibilityLabel={`Profile initials: ${initials}`} style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.memberBadge}>
            <AppIcon name="person" size={14} color="#B9E6D4" />
            <Text style={styles.memberText}>FIELD REPORTS</Text>
          </View>
        </View>
        <Text testID="profile_name" accessibilityRole="header" style={styles.name}>{currentUser?.fullName}</Text>
        <Text selectable testID="profile_email" style={styles.email}>{currentUser?.email}</Text>
        <View style={styles.identityFooter}>
          <AppIcon name="lock" size={16} color="#B9E6D4" />
          <Text style={styles.footerText}>Your reports stay linked to this account</Text>
        </View>
      </View>

      <Card>
        <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>ACCOUNT & ACCESS</Text>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}><AppIcon name="person" color={theme.accent} /></View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Sign-in email</Text>
            <Text selectable style={[ui.small, { color: theme.textSecondary }]}>{currentUser?.email}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}><AppIcon name="lock" color={theme.accent} /></View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Session recovery</Text>
            <Text style={[ui.small, { color: theme.textSecondary }]}>{authToken ? 'Your saved session resumes after a connection loss.' : 'Using your saved profile. Your session recovers when connected.'}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}><AppIcon name="document" color={theme.accent} /></View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Your work stays with you</Text>
            <Text style={[ui.small, { color: theme.textSecondary }]}>Drafts and pending reports are saved on this device.</Text>
          </View>
        </View>
        <Text style={[ui.body, { color: theme.textSecondary }]}>Signing out keeps your saved work. Sign back into this account to pick up where you left off.</Text>
        <Button secondary icon="arrow" testID="profile_view_reports_btn" onPress={() => router.navigate('/')}>Back to my reports</Button>
      </Card>

      <View style={[styles.signOut, { borderColor: theme.border }]}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>Finished for now?</Text>
        <Text style={[ui.small, { color: theme.textSecondary }]}>Pending reports will wait until you sign in again.</Text>
        {!!error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}
        <Button secondary icon="logout" testID="account_logout_btn" disabled={isLoading} onPress={() => void signOut()}>
          {isLoading ? 'Signing out…' : 'Sign out'}
        </Button>
      </View>
      <Text style={[styles.brand, { color: theme.textSecondary }]}>OWNONE · CAPTURE NOW. SEND WHEN CONNECTED.</Text>
    </WorkspaceScreen>
  );
}

const styles = StyleSheet.create({
  identity: { backgroundColor: '#122F37', borderRadius: 24, padding: 24, gap: 10 },
  identityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#D6F1DF', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 24, fontWeight: '700', color: '#173D35' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: '#23474D' },
  memberText: { color: '#B9E6D4', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  name: { fontSize: 26, lineHeight: 33, fontWeight: '700', color: '#F3FAF7', letterSpacing: -0.5 },
  email: { fontSize: 14, lineHeight: 21, color: '#BED3D4' },
  identityFooter: { marginTop: 10, paddingTop: 16, borderTopWidth: 1, borderColor: '#35535A', flexDirection: 'row', gap: 8, alignItems: 'center' },
  footerText: { color: '#BED3D4', fontSize: 11, lineHeight: 17, flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowContent: { flex: 1, gap: 5 },
  rowTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  signOut: { gap: 12, padding: 20, borderRadius: 20, borderWidth: 1 },
  brand: { textAlign: 'center', fontSize: 9, letterSpacing: 1, lineHeight: 16, marginVertical: 6 },
});
