import React, { createContext, useContext } from "react";
import { themes } from "./theme";

export type ThemeMode = "light" | "dark";
export type NexChatTheme = (typeof themes)[ThemeMode];

const Ctx = createContext<NexChatTheme>(themes.light);

export function ThemeProvider({
  mode,
  children,
}: {
  mode: ThemeMode;
  children: React.ReactNode;
}) {
  return (
    <Ctx.Provider value={themes[mode]}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): NexChatTheme {
  return useContext(Ctx);
}
