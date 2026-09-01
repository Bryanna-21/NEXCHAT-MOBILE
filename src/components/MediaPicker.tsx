import React from "react";
import {
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  capturePhoto,
  pickFiles,
  pickMedia,
} from "../core/media";
import { Attachment } from "../core/store";

type Props = {
  onSelected: (items: Attachment[]) => void;
};

export function MediaPicker({
  onSelected,
}: Props) {
  const chooseMedia = async () => {
    try {
      const items = await pickMedia(true);

      if (items.length) {
        onSelected(items);
      }
    } catch (e) {
      Alert.alert(
        "Media unavailable",
        e instanceof Error
          ? e.message
          : "Unable to access media."
      );
    }
  };

  const takePhoto = async () => {
    try {
      const item = await capturePhoto();

      if (item) {
        onSelected([item]);
      }
    } catch (e) {
      Alert.alert(
        "Camera unavailable",
        e instanceof Error
          ? e.message
          : "Unable to access the camera.",
      );
    }
  };

  const chooseFiles = async () => {
    try {
      const items = await pickFiles(true);

      if (items.length) {
        onSelected(items);
      }
    } catch (e) {
      Alert.alert(
        "Files unavailable",
        e instanceof Error
          ? e.message
          : "Unable to access files."
      );
    }
  };

  const openPicker = () => {
    Alert.alert(
      "Add attachment",
      "Choose what you want to send.",
      [
        {
          text: "Camera",
          onPress: takePhoto,
        },
        {
          text: "Camera",
          onPress: takePhoto,
        },
        {
          text: "Photos / Videos",
          onPress: chooseMedia,
        },
        {
          text: "Files",
          onPress: chooseFiles,
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <TouchableOpacity
        onPress={openPicker}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#78909C",
        }}
      >
        <Text style={{ fontWeight: "800" }}>
          ＋ Attachment
        </Text>
      </TouchableOpacity>
    </View>
  );
}
