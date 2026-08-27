import * as ImagePicker from "expo-image-picker";
import { Attachment, MediaType } from "./store";

export async function pickMedia(
  multiple = false
): Promise<Attachment[]> {
  const permission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      "NexChat needs photo/video library permission to attach media."
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 10 : 1,
    quality: 1,
    videoMaxDuration: 120,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    type: asset.type === "video" ? "video" : "image",
    name: asset.fileName || undefined,
    mimeType: asset.mimeType || undefined,
    width: asset.width,
    height: asset.height,
    duration: asset.duration || undefined,
  })) as Attachment[];
}

export async function takePhoto(): Promise<Attachment | null> {
  const permission =
    await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      "NexChat needs camera permission to take a photo."
    );
  }

  const result =
    await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
    });

  if (result.canceled) return null;

  const asset = result.assets[0];

  return {
    uri: asset.uri,
    type: "image",
    name: asset.fileName || undefined,
    mimeType: asset.mimeType || undefined,
    width: asset.width,
    height: asset.height,
  };
}
