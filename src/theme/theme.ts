export type Palette = {
  bg: string;
  card: string;
  surface: string;
  ink: string;
  muted: string;
  brand: string;
  line: string;
  danger: string;
  good: string;
  inverse: string;
  bubbleMe: string;
  bubbleThem: string;
};

export const themes: Record<"light" | "dark" | "black", Palette> = {
  light: {
    bg: "#F5F8FB",
    card: "#FFFFFF",
    surface: "#EEF3F7",
    ink: "#102A43",
    muted: "#66788A",
    brand: "#0C5A8D",
    line: "#D9E2EC",
    danger: "#B42318",
    good: "#16803C",
    inverse: "#FFFFFF",
    bubbleMe: "#D9F0FF",
    bubbleThem: "#FFFFFF",
  },

  dark: {
    bg: "#08111A",
    card: "#101C27",
    surface: "#172530",
    ink: "#F2F7FA",
    muted: "#9BAEBD",
    brand: "#42A5E5",
    line: "#263847",
    danger: "#FF8A80",
    good: "#4ADE80",
    inverse: "#000000",
    bubbleMe: "#0C4C70",
    bubbleThem: "#172530",
  },

  black: {
    bg: "#000000",
    card: "#0A0A0A",
    surface: "#111111",
    ink: "#FFFFFF",
    muted: "#A0A0A0",
    brand: "#3FA9E8",
    line: "#222222",
    danger: "#FF6B6B",
    good: "#4ADE80",
    inverse: "#000000",
    bubbleMe: "#123E57",
    bubbleThem: "#111111",
  },
};
