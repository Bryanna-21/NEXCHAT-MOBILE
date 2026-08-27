import React, { createContext, useContext, useMemo, useState } from "react";
import { AppTheme, getTheme, ThemeMode, useSystemTheme } from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useSystemTheme();
  const [mode, setMode] = useState<ThemeMode>(systemTheme);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    theme: getTheme(mode),
    toggle: () =>
      setMode((current: ThemeMode) =>
        current === "dark" ? "light" : "dark"
      ),
  }), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
