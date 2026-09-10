import React from "react";
import {
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Attachment } from "../core/store";

type Props = {
  media: Attachment;
  onRemove?: () => void;
};

function typeLabel(type: Attachment["type"]): string {
  switch (type) {
    case "video":
      return "▶ VIDEO";
    case "audio":
      return "♫ AUDIO";
    case "file":
      return "📄 FILE";
    default:
      return "IMAGE";
  }
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreview({
  media,
  onRemove,
}: Props) {
  const isImage = media.type === "image";

  return (
    <View
      style={{
        width: 112,
        height: 112,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#D9E2EC",
        marginRight: 8,
        borderWidth: 1,
        borderColor: "#B8C5D0",
      }}
    >
      {isImage ? (
        <Image
          source={{ uri: media.uri }}
          style={{
            width: "100%",
            height: "100%",
          }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              marginBottom: 5,
            }}
          >
            {media.type === "video"
              ? "▶"
              : media.type === "audio"
              ? "♫"
              : "📄"}
          </Text>

          <Text
            style={{
              fontWeight: "900",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            {typeLabel(media.type)}
          </Text>

          <Text
            numberOfLines={2}
            style={{
              fontSize: 10,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {media.name || "Attachment"}
          </Text>

          {!!media.size && (
            <Text
              style={{
                fontSize: 9,
                marginTop: 3,
              }}
            >
              {formatSize(media.size)}
            </Text>
          )}
        </View>
      )}

      {onRemove && (
        <TouchableOpacity
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          style={{
            position: "absolute",
            right: 5,
            top: 5,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: "#0008",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: "900",
            }}
          >
            ×
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
