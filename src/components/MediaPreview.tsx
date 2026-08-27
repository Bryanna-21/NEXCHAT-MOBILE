import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Attachment } from "../core/store";

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
  });

  return (
    <VideoView
      player={player}
      style={styles.media}
      nativeControls
      contentFit="cover"
    />
  );
}

export function MediaPreview({
  media,
  onRemove,
}: {
  media: Attachment;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      {media.type === "video" ? (
        <VideoPreview uri={media.uri} />
      ) : (
        <Image
          source={{ uri: media.uri }}
          style={styles.media}
        />
      )}

      {onRemove && (
        <TouchableOpacity
          style={styles.remove}
          onPress={onRemove}
        >
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      )}

      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {media.type === "video" ? "VIDEO" : "PHOTO"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 150,
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  remove: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 24,
  },
  badge: {
    position: "absolute",
    bottom: 7,
    left: 7,
    backgroundColor: "rgba(0,0,0,.65)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
});
