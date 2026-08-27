import { useColorScheme } from "react-native";

export type ThemeMode = "light" | "dark";

export type AppTheme = {
  mode: ThemeMode;
  bg: string;
  card: string;
  surface: string;
  ink: string;
  muted: string;
  brand: string;
  brand2: string;
  line: string;
  danger: string;
  good: string;
  inverse: string;
  overlay: string;
};

export const lightTheme: AppTheme = {
  mode: "light",
  bg: "#F5F8FB",
  card: "#FFFFFF",
  surface: "#EEF4F8",
  ink: "#102A43",
  muted: "#66788A",
  brand: "#0C5A8D",
  brand2: "#167DB7",
  line: "#D9E2EC",
  danger: "#B42318",
  good: "#087443",
  inverse: "#FFFFFF",
  overlay: "rgba(0,0,0,0.55)",
};

export const darkTheme: AppTheme = {
  mode: "dark",
  bg: "#07131D",
  card: "#0D1D29",
  surface: "#132936",
  ink: "#F4F8FB",
  muted: "#9DB0BF",
  brand: "#55B8F0",
  brand2: "#79C9F5",
  line: "#284150",
  danger: "#FF8B82",
  good: "#55D69A",
  inverse: "#07131D",
  overlay: "rgba(0,0,0,0.72)",
};

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === "dark" ? darkTheme : lightTheme;
}

export function useSystemTheme(): ThemeMode {
  return useColorScheme() === "dark" ? "dark" : "light";
}
