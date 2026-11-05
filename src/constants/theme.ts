/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#192E35",
    background: "#F5F7F8",
    surface: "#FFFFFF",
    backgroundElement: "#EDF2F3",
    backgroundSelected: "#E0F2ED",
    textSecondary: "#61757D",
    accent: "#087F72",
    border: "#E1E8EA",
    success: "#16745D",
    danger: "#B83C49",
    dangerBackground: "#FFF0F1",
  },
  dark: {
    text: "#ECF4F4",
    background: "#101A20",
    surface: "#18272E",
    backgroundElement: "#21343C",
    backgroundSelected: "#21463F",
    textSecondary: "#A4B9C0",
    accent: "#219D8D",
    border: "#30434B",
    success: "#73D7B5",
    danger: "#FFABB3",
    dangerBackground: "#422A32",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 1120;
