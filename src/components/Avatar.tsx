import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function Avatar({
  name,
  uri,
  size = 48,
  online = false,
}: {
  name: string;
  uri?: string;
  size?: number;
  online?: boolean;
}) {
  const theme = useTheme();
  const initial = (name.trim()[0] || "?").toUpperCase();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surface,
          borderColor: theme.line,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <Text
          style={[
            styles.text,
            {
              color: theme.brand,
              fontSize: size * 0.38,
            },
          ]}
        >
          {initial}
        </Text>
      )}

      {online && (
        <View
          style={[
            styles.online,
            {
              width: size * 0.23,
              height: size * 0.23,
              borderRadius: size * 0.12,
              backgroundColor: theme.good,
              borderColor: theme.card,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
    overflow: "visible",
  },

  text: {
    fontWeight: "900",
  },

  online: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderWidth: 2,
  },
});
