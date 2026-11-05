import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { selectEnvironment, type AppEnvironment } from "@/config/environment";
import { ENVIRONMENT_PRESENTATION } from "@/config/environment/presentation";
import { useEnvironment } from "@/hooks/use-environment";
import { useTheme } from "@/hooks/use-theme";
import { AppIcon, Button, ui } from "./workspace-ui";

export function EnvironmentBanner() {
  const config = useEnvironment();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const identity = ENVIRONMENT_PRESENTATION[config.environment];
  if (config.environment === "production") return null;
  const select = async (env: AppEnvironment) => {
    try {
      await selectEnvironment(env);
      setError(null);
      setVisible(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to switch environment.",
      );
    }
  };
  return (
    <>
      <Pressable
        testID="env_indicator_banner"
        accessibilityRole="button"
        accessibilityLabel={`Active Environment: ${config.environmentLabel}`}
        onPress={() => setVisible(true)}
        style={[
          styles.banner,
          {
            backgroundColor: theme.backgroundSelected,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.bannerInner}>
          <View style={ui.row}>
            <View
              style={[styles.envBadge, { backgroundColor: identity.color }]}
            >
              <Text style={styles.envBadgeText}>{identity.shortLabel}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={[styles.environmentName, { color: theme.text }]}>
                {identity.label}
              </Text>
              <Text style={[styles.dataset, { color: theme.textSecondary }]}>
                {identity.dataset} · Sample data
              </Text>
            </View>
          </View>
          <View style={[ui.row, { gap: 6 }]}>
            <Text style={[styles.switchText, { color: theme.accent }]}>
              Switch
            </Text>
            <AppIcon name="switch" size={17} color={theme.accent} />
          </View>
        </View>
      </Pressable>
      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close environment selector"
            onPress={() => setVisible(false)}
          />
          <View
            accessibilityViewIsModal
            style={[styles.modal, { backgroundColor: theme.surface }]}
          >
            <ScrollView
              contentContainerStyle={{ gap: 18 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ gap: 9 }}>
                <Text style={[ui.eyebrow, { color: theme.accent }]}>
                  A SPACE FOR EVERY STAGE
                </Text>
                <Text style={[ui.title, { color: theme.text }]}>
                  Set the scene.
                </Text>
                <Text style={[ui.body, { color: theme.textSecondary }]}>
                  Each environment has its own look, accounts, and sample
                  dataset. Switching restores the account saved in that
                  environment.
                </Text>
              </View>
              {error && (
                <Text accessibilityRole="alert" style={{ color: theme.danger }}>
                  {error}
                </Text>
              )}
              {(["development", "qa", "staging"] as AppEnvironment[]).map(
                (env) => {
                  const option = ENVIRONMENT_PRESENTATION[env];
                  const selected = config.environment === env;
                  return (
                    <Pressable
                      key={env}
                      testID={`env_switch_${env}_btn`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => select(env)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.background,
                          borderColor: selected ? theme.accent : theme.border,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: option.color },
                        ]}
                      >
                        <Text style={styles.envBadgeText}>
                          {option.shortLabel}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text
                          style={[styles.optionName, { color: theme.text }]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[ui.small, { color: theme.textSecondary }]}
                        >
                          {option.description}
                        </Text>
                        <Text
                          style={[
                            styles.datasetTag,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {option.dataset}
                        </Text>
                      </View>
                      {selected && (
                        <AppIcon name="check" color={theme.accent} size={21} />
                      )}
                    </Pressable>
                  );
                },
              )}
              <View style={[ui.row, { gap: 8 }]}>
                <AppIcon name="lock" size={15} />
                <Text
                  style={[ui.small, { color: theme.textSecondary, flex: 1 }]}
                >
                  Reports in each environment are kept separate. Production
                  is managed separately.
                </Text>
              </View>
              <Button
                secondary
                testID="env_modal_close_btn"
                onPress={() => setVisible(false)}
              >
                Back to reports
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  banner: { paddingHorizontal: 24, paddingVertical: 11, borderBottomWidth: 1 },
  bannerInner: {
    width: "100%",
    maxWidth: 1072,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  envBadge: {
    borderRadius: 8,
    minWidth: 40,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  envBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: "800",
  },
  environmentName: { fontSize: 12, fontWeight: "700" },
  dataset: { fontSize: 10 },
  switchText: { fontSize: 11, fontWeight: "700" },
  overlay: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0C2029A6",
  },
  modal: {
    width: "100%",
    maxWidth: 490,
    maxHeight: "90%",
    padding: 26,
    borderRadius: 28,
  },
  option: {
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  swatch: {
    width: 44,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  optionName: { fontSize: 15, fontWeight: "700" },
  datasetTag: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },
});
