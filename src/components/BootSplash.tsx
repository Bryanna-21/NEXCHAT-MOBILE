import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

type BootSplashProps = {
  /**
   * Called once after a fixed minimum duration so the splash
   * always shows for at least a beat, even on a fast device.
   * The visual animation itself keeps looping regardless — the
   * parent decides when to actually unmount this component,
   * based on combining this with real app-readiness.
   */
  onMinimumDurationElapsed?: () => void;
};

const DOT_COLOR = "#3FA9E8";

function useLoopingPulse(delay: number) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [value, delay]);

  return value;
}

function Dot({ delay }: { delay: number }) {
  const pulse = useLoopingPulse(delay);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });

  return (
    <View style={styles.dotWrap}>
      <Animated.View
        style={[
          styles.dotGlow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />
      <Animated.View
        style={[styles.dot, { opacity, transform: [{ scale }] }]}
      />
    </View>
  );
}

export function BootSplash({ onMinimumDurationElapsed }: BootSplashProps) {
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.85)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    const timer = setTimeout(() => {
      onMinimumDurationElapsed?.();
    }, 2200);

    return () => {
      loop.stop();
      clearTimeout(timer);
    };
  }, []);

  const iconGlowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const iconGlowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });

  return (
    <View style={styles.container}>
      <View style={styles.iconArea}>
        <Animated.View
          style={[
            styles.iconGlow,
            { opacity: iconGlowOpacity, transform: [{ scale: iconGlowScale }] },
          ]}
        />
        <Animated.Image
          source={require("../../assets/splash/nexchat-icon.png")}
          style={[
            styles.icon,
            { opacity: iconOpacity, transform: [{ scale: iconScale }] },
          ]}
          resizeMode="contain"
        />
      </View>

      <View style={styles.dotsRow}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>

      <View style={styles.watermark}>
        <MaskedView
          maskElement={
            <Text style={[styles.watermarkX, { backgroundColor: "transparent" }]}>✕</Text>
          }
        >
          <LinearGradient
            colors={["#4ADE80", "#3FA9E8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.watermarkXGradientFill}
          />
        </MaskedView>
        <Text style={styles.watermarkText}>by  E X I L E</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },

  iconArea: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },

  iconGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 46,
    backgroundColor: "#3FA9E8",
  },

  icon: {
    width: 170,
    height: 170,
  },

  dotsRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 56,
  },

  dotWrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  dotGlow: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: DOT_COLOR,
  },

  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: DOT_COLOR,
  },

  watermark: {
    position: "absolute",
    bottom: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  watermarkX: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },

  watermarkXGradientFill: {
    width: 16,
    height: 19,
  },

  watermarkText: {
    color: "#FFFFFFCC",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
