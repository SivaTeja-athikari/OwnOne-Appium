import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { AppIcon } from "@/components/ui/workspace-ui";
import { useTheme } from "@/hooks/use-theme";

export function AuthField({
  label,
  password = false,
  error,
  errorTestID,
  ...props
}: TextInputProps & { label: string; password?: boolean; error?: string; errorTestID?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text accessible testID={props.testID ? `${props.testID}_label` : undefined} accessibilityLabel={label} style={[styles.label, { color: error ? theme.danger : theme.text }]}>
        {label.replace(/\s\*$/, '')}
        {label.trimEnd().endsWith('*') && <Text style={{ color: theme.danger }}> *</Text>}
      </Text>
      <View
        style={[
          styles.wrapper,
          {
            borderColor: error ? theme.danger : focused ? theme.accent : theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={password && !show}
          autoCapitalize={password ? "none" : props.autoCapitalize}
          autoCorrect={password ? false : props.autoCorrect}
          placeholderTextColor={theme.textSecondary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: theme.text }, props.multiline && { minHeight: 140, textAlignVertical: "top" }]}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? "Hide password" : "Show password"}
            onPress={() => setShow(!show)}
            style={styles.toggle}
          >
            <AppIcon name={show ? "eyeOff" : "eye"} size={19} />
          </Pressable>
        )}
      </View>
      {!!error && <Text accessible testID={errorTestID} accessibilityRole="alert" accessibilityLabel={error} style={{ color: theme.danger, fontSize: 12, lineHeight: 17 }}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600" },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 13,
    minHeight: 54,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 15,
  },
  toggle: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
});
