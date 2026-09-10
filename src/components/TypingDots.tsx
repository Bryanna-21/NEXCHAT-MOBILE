import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * Three bouncing dots — a general-purpose "something is in
 * progress" indicator. Used wherever we honestly know an activity
 * is happening (sending a message, a call connecting) — never used
 * to imply a real contact is typing, since this app has no real
 * incoming message flow to back that claim.
 */
export function TypingDots({ color, size = 7 }: { color: string; size?: number }) {
  const values = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(value, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 350,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={styles.row}>
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                {
                  translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {},
});
