import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * NexChat typing indicator.
 *
 * Three dots pulse sequentially so the animation communicates
 * human typing rather than generic loading activity.
 *
 * The component is intentionally presentation-only. The actual
 * typing state comes from the realtime typing event system.
 */
export function TypingDots({
  color,
  size = 7,
}: {
  color: string;
  size?: number;
}) {
  const values = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 130),

          Animated.timing(value, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),

          Animated.timing(value, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),

          Animated.delay(260),
        ])
      )
    );

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [values]);

  return (
    <View
      style={[
        styles.row,
        {
          minHeight: size + 8,
        },
      ]}
      accessibilityLabel="Contact is typing"
      accessibilityRole="progressbar"
    >
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,

              opacity: value.interpolate({
                inputRange: [0, 1],
                outputRange: [0.25, 1],
              }),

              transform: [
                {
                  translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, -4],
                  }),
                },
                {
                  scale: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1.12],
                  }),
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
