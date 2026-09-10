import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function SectionCard({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body?: string;
  action?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.line,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: theme.muted }]}>{body}</Text> : null}
      {action && onPress ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.action, { borderColor: theme.brand }]}
          onPress={onPress}
        >
          <Text style={[styles.actionText, { color: theme.brand }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  action: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
  },
  actionText: {
    fontWeight: "800",
    fontSize: 12,
  },
});
