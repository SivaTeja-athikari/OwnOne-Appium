import type { PropsWithChildren } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTheme } from "@/hooks/use-theme";

export type AppIconName =
  | "eye"
  | "eyeOff"
  | "plus"
  | "person"
  | "grid"
  | "arrow"
  | "chevronDown"
  | "check"
  | "lock"
  | "building"
  | "chart"
  | "document"
  | "flag"
  | "scan"
  | "clock"
  | "switch"
  | "close"
  | "help"
  | "logout";
const icons: Record<AppIconName, SymbolViewProps["name"]> = {
  eye: { ios: "eye", android: "visibility", web: "visibility" },
  eyeOff: {
    ios: "eye.slash",
    android: "visibility_off",
    web: "visibility_off",
  },
  plus: { ios: "plus", android: "add", web: "add" },
  person: {
    ios: "person.crop.circle",
    android: "account_circle",
    web: "account_circle",
  },
  grid: { ios: "square.grid.2x2", android: "grid_view", web: "grid_view" },
  arrow: { ios: "arrow.right", android: "arrow_forward", web: "arrow_forward" },
  chevronDown: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  check: {
    ios: "checkmark.circle.fill",
    android: "check_circle",
    web: "check_circle",
  },
  lock: { ios: "lock.shield", android: "shield", web: "shield" },
  building: { ios: "building.2", android: "domain", web: "domain" },
  chart: { ios: "chart.bar.xaxis", android: "bar_chart", web: "bar_chart" },
  document: { ios: "doc.text", android: "description", web: "description" },
  flag: { ios: "flag.fill", android: "flag", web: "flag" },
  scan: {
    ios: "viewfinder",
    android: "document_scanner",
    web: "document_scanner",
  },
  clock: { ios: "clock", android: "schedule", web: "schedule" },
  switch: {
    ios: "arrow.left.arrow.right",
    android: "swap_horiz",
    web: "swap_horiz",
  },
  close: { ios: "xmark", android: "close", web: "close" },
  help: { ios: "questionmark.circle", android: "help", web: "help" },
  logout: {
    ios: "rectangle.portrait.and.arrow.right",
    android: "logout",
    web: "logout",
  },
};
export function AppIcon({
  name,
  color,
  size = 20,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <SymbolView
      name={icons[name]}
      size={size}
      tintColor={color ?? theme.textSecondary}
    />
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <View style={ui.row}>
      <View style={[ui.brandMark, { backgroundColor: theme.accentSolid }]}>
        <AppIcon name="grid" color="#FFFFFF" size={22} />
      </View>
      <View>
        <Text style={[ui.brandName, { color: theme.text }]}>
          OwnOne<Text style={{ color: theme.accent }}>.</Text>
        </Text>
        {!compact && (
          <Text style={[ui.caption, { color: theme.textSecondary }]}>
            YOUR WORK, CONNECTED
          </Text>
        )}
      </View>
    </View>
  );
}
export function Card({
  children,
  style,
  testID,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        ui.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  icon,
  secondary = false,
  style,
  ...props
}: PropsWithChildren<
  PressableProps & {
    icon?: AppIconName;
    secondary?: boolean;
    style?: StyleProp<ViewStyle>;
  }
>) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        ui.button,
        {
          backgroundColor: secondary
            ? theme.backgroundElement
            : theme.accentSolid,
        },
        props.disabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <Text
        style={[ui.buttonText, { color: secondary ? theme.text : "#FFFFFF" }]}
      >
        {children}
      </Text>
      {icon && (
        <AppIcon
          name={icon}
          color={secondary ? theme.text : "#FFFFFF"}
          size={18}
        />
      )}
    </Pressable>
  );
}
export const ui = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#087F72",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontSize: 23, fontWeight: "800", letterSpacing: -1 },
  caption: { fontSize: 9, fontWeight: "700", letterSpacing: 1.8, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 22, padding: 24, gap: 18 },
  button: {
    minHeight: 50,
    borderRadius: 13,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  buttonText: { fontSize: 14, fontWeight: "700" },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  title: { fontSize: 30, lineHeight: 38, fontWeight: "800", letterSpacing: -1 },
  heading: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  body: { fontSize: 14, lineHeight: 22 },
  small: { fontSize: 12, lineHeight: 18 },
});
