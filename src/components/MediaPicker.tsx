import React from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Attachment } from "../core/store";
import { pickMedia, takePhoto } from "../core/media";

export function MediaPicker({
  multiple = false,
  onSelected,
}: {
  multiple?: boolean;
  onSelected: (items: Attachment[]) => void;
}) {
  const selectLibrary = async () => {
    try {
      const items = await pickMedia(multiple);
      if (items.length) onSelected(items);
    } catch (error) {
      Alert.alert(
        "Media unavailable",
        error instanceof Error
          ? error.message
          : "Unable to access your media."
      );
    }
  };

  const camera = async () => {
    try {
      const item = await takePhoto();
      if (item) onSelected([item]);
    } catch (error) {
      Alert.alert(
        "Camera unavailable",
        error instanceof Error
          ? error.message
          : "Unable to access the camera."
      );
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.button}
        onPress={selectLibrary}
      >
        <Text style={styles.text}>＋ Photo / Video</Text>
      </TouchableOpacity>

      {!multiple && (
        <TouchableOpacity
          style={styles.button}
          onPress={camera}
        >
          <Text style={styles.text}>Camera</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  button: {
    borderWidth: 1,
    borderColor: "#78909C",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  text: {
    fontWeight: "800",
  },
});
