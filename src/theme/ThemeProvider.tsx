import React, { createContext, useContext, useMemo, useState } from "react";
import { AppTheme, getTheme, ThemeMode, useSystemTheme } from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemMode = useSystemTheme();
  const [mode, setMode] = useState<ThemeMode>(systemMode);

  const value = useMemo(
    () => ({
      mode,
      theme: getTheme(mode),
      setMode,
      toggle: () => setMode((current) => current === "dark" ? "light" : "dark"),
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
