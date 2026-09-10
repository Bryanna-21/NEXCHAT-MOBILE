import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type ActionSheetOption = {
  text: string;
  onPress?: () => void;
  style?: "default" | "destructive" | "cancel";
};

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onRequestClose: () => void;
  theme: any;
};

/**
 * A custom bottom-sheet style menu, used anywhere a menu needs
 * more than ~2 options.
 *
 * React Native's built-in Alert.alert silently fails to display
 * ANYTHING on Android when given more than 3 buttons — this is a
 * real platform limitation, not a bug in the calling code. Any
 * menu that can grow past 3 options (message actions, attachment
 * pickers, etc.) must use this instead of Alert.alert.
 */
export function ActionSheet({
  visible,
  title,
  message,
  options,
  onRequestClose,
  theme,
}: ActionSheetProps) {
  const nonCancel = options.filter((o) => o.style !== "cancel");
  const cancelOption = options.find((o) => o.style === "cancel");

  const handlePress = (option: ActionSheetOption) => {
    onRequestClose();
    option.onPress?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            {(title || message) && (
              <View style={styles.header}>
                {title && (
                  <Text style={[styles.title, { color: theme.ink }]}>
                    {title}
                  </Text>
                )}
                {message && (
                  <Text style={[styles.message, { color: theme.muted }]}>
                    {message}
                  </Text>
                )}
              </View>
            )}

            <ScrollView bounces={false}>
              {nonCancel.map((option, i) => (
                <Pressable
                  key={`${option.text}-${i}`}
                  onPress={() => handlePress(option)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderTopColor: theme.line },
                    pressed && { backgroundColor: theme.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.rowText,
                      {
                        color:
                          option.style === "destructive"
                            ? theme.danger
                            : theme.ink,
                      },
                    ]}
                  >
                    {option.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {cancelOption && (
            <Pressable
              onPress={() => handlePress(cancelOption)}
              style={[styles.cancelSheet, { backgroundColor: theme.card }]}
            >
              <Text style={[styles.rowText, { color: theme.ink, fontWeight: "700" }]}>
                {cancelOption.text}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "flex-end",
  },

  sheetWrap: {
    padding: 10,
    gap: 8,
  },

  sheet: {
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: 420,
  },

  header: {
    padding: 16,
    alignItems: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: "800",
  },

  message: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },

  row: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },

  rowText: {
    fontSize: 16,
    fontWeight: "600",
  },

  cancelSheet: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
});
