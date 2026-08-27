import { useColorScheme } from "react-native";

export type ThemeMode = "light" | "dark";

export const lightTheme = {
  mode: "light" as const,
  bg: "#F5F8FB",
  card: "#FFFFFF",
  surface: "#E8F3FA",
  ink: "#102A43",
  muted: "#66788A",
  brand: "#0C5A8D",
  brand2: "#167DB7",
  line: "#D9E2EC",
  danger: "#B42318",
  good: "#087443",
  inverse: "#FFFFFF",
};

export const darkTheme = {
  mode: "dark" as const,
  bg: "#07131D",
  card: "#0D202D",
  surface: "#123246",
  ink: "#F1F7FB",
  muted: "#9FB2C1",
  brand: "#5CB8EE",
  brand2: "#79C8F4",
  line: "#234354",
  danger: "#FF8A80",
  good: "#62D49A",
  inverse: "#07131D",
};

export type AppTheme = typeof lightTheme;

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === "dark" ? darkTheme : lightTheme;
}

export function useSystemTheme(): ThemeMode {
  return useColorScheme() === "dark" ? "dark" : "light";
}
