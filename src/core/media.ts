import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import {
  Attachment,
  AttachmentType,
} from "./store";

import {
  ingestAttachment,
  ingestAttachments,
} from "./attachmentIngestion";

function getAttachmentType(
  mimeType?: string | null,
  assetType?: string | null,
): AttachmentType {
  const normalized =
    mimeType
      ?.split(";")[0]
      .trim()
      .toLowerCase();

  if (
    normalized?.startsWith("image/") ||
    assetType === "image"
  ) {
    return "image";
  }

  if (
    normalized?.startsWith("video/") ||
    assetType === "video"
  ) {
    return "video";
  }

  if (
    normalized?.startsWith("audio/") ||
    assetType === "audio"
  ) {
    return "audio";
  }

  return "file";
}

/**
 * Pick photos/videos from the device gallery.
 *
 * Selected assets are immediately moved into the
 * NexChat durable attachment store.
 */
export async function pickMedia(
  multiple = true,
): Promise<Attachment[]> {
  const permission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      "Media permission is required to choose photos and videos.",
    );
  }

  const result =
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: multiple,
      quality: 1,
      selectionLimit:
        multiple ? 10 : 1,
    });

  if (result.canceled) {
    return [];
  }

  return ingestAttachments(
    result.assets.map(asset => ({
      uri: asset.uri,
      type: getAttachmentType(
        asset.mimeType,
        asset.type,
      ),
      name:
        asset.fileName ||
        `media-${Date.now()}`,
      mimeType:
        asset.mimeType ||
        undefined,
      size:
        asset.fileSize ||
        undefined,
      duration:
        asset.duration ||
        undefined,
      width:
        asset.width ||
        undefined,
      height:
        asset.height ||
        undefined,
    })),
  );
}

/**
 * Pick arbitrary files from the device.
 *
 * The selected file is copied into durable
 * NexChat attachment storage before being returned.
 */
export async function pickFiles(
  multiple = true,
): Promise<Attachment[]> {
  const result =
    await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple,
      copyToCacheDirectory: true,
    });

  if (result.canceled) {
    return [];
  }

  return ingestAttachments(
    result.assets.map(asset => ({
      uri: asset.uri,
      type: getAttachmentType(
        asset.mimeType,
      ),
      name:
        asset.name ||
        `file-${Date.now()}`,
      mimeType:
        asset.mimeType ||
        undefined,
      size:
        asset.size ||
        undefined,
    })),
  );
}

/**
 * Pick an image for the user's profile.
 *
 * Profile images are deliberately NOT placed in the
 * message attachment store because profile storage
 * has a different lifecycle.
 */
export async function pickProfilePhoto(): Promise<
  string | null
> {
  const permission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      "Media permission is required to choose a profile picture.",
    );
  }

  const result =
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.9,
      selectionLimit: 1,
    });

  if (
    result.canceled ||
    !result.assets.length
  ) {
    return null;
  }

  return result.assets[0].uri;
}
