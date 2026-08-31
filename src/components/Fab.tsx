import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function Fab({
  label = "+",
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.fab,
        {
          backgroundColor: theme.brand,
          shadowColor: theme.ink,
        },
      ]}
    >
      <Text style={[styles.text, { color: theme.inverse }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: {
    fontSize: 30,
    lineHeight: 30,
    fontWeight: "500",
  },
});
