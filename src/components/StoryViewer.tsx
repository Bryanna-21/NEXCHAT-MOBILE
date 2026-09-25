import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";

import {
  getStoriesForUser,
  markStoryViewed,
  updateStory,
  Story,
} from "../core/stories";
import { useNexChatStore } from "../core/store";

type StoryViewerProps = {
  visible: boolean;
  ownerId: string | null;
  ownerName: string;
  viewerId?: string;
  viewerContactIds?: string[];
  onClose: () => void;
};

function StoryVideo({
  uri,
  onEnd,
}: {
  uri: string;
  onEnd: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  useEventListener(player, "playToEnd", onEnd);

  return (
    <VideoView
      style={styles.image}
      player={player}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

export function StoryViewer({
  visible,
  ownerId,
  ownerName,
  viewerId,
  viewerContactIds = [],
  onClose,
}: StoryViewerProps) {
  const st = useNexChatStore();

  const [stories, setStories] = useState<Story[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const textExportRef = useRef<View>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible || !ownerId) {
      setLoading(false);
      setStories([]);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);

      try {
        if (!ownerId) {
          if (active) {
            setStories([]);
          }
          return;
        }

        const result = await getStoriesForUser(
          ownerId,
          viewerId,
          viewerContactIds,
        );

        if (!active) {
          return;
        }

        setStories(result);
        setIndex(0);

        if (result.length > 0) {
          await markStoryViewed(result[0].id);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [
    visible,
    ownerId,
    viewerId,
    viewerContactIds.join("|"),
  ]);

  if (!visible || !ownerId) {
    return null;
  }

  if (loading) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading story…</Text>
        </View>
      </Modal>
    );
  }

  if (!stories.length) {
    return null;
  }

  const story = stories[index];
  const isOwner = Boolean(viewerId && viewerId === ownerId);

  async function saveCaption() {
    if (!isOwner || savingCaption) {
      return;
    }

    setSavingCaption(true);

    try {
      const updated = await updateStory(story.id, {
        caption: captionText.trim() || undefined,
      });

      if (!updated) {
        throw new Error("The story could not be found.");
      }

      setStories((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setEditingCaption(false);
    } catch (error) {
      Alert.alert(
        "Couldn't save caption",
        error instanceof Error
          ? error.message
          : "The caption could not be saved.",
      );
    } finally {
      setSavingCaption(false);
    }
  }

  function beginCaptionEdit() {
    setCaptionText(story.caption || "");
    setEditingCaption(true);
  }

  async function nextStory() {
    if (index >= stories.length - 1) {
      onClose();
      return;
    }

    const nextIndex = index + 1;

    setIndex(nextIndex);
    await markStoryViewed(stories[nextIndex].id);
  }

  async function previousStory() {
    if (index === 0) {
      return;
    }

    const previousIndex = index - 1;

    setIndex(previousIndex);
    await markStoryViewed(stories[previousIndex].id);
  }

  async function downloadStory() {
    if (!story || downloading) {
      return;
    }

    setDownloading(true);

    try {
      const permission =
        await MediaLibrary.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow media access to save this story to your gallery.",
        );
        return;
      }

      if (story.type === "text") {
        if (!textExportRef.current) {
          throw new Error("Text story export is not ready.");
        }

        const uri = await captureRef(textExportRef.current, {
          format: "png",
          quality: 1,
          width: 1080,
          height: 1920,
        });

        await MediaLibrary.createAssetAsync(uri);

        Alert.alert(
          "Saved",
          "The branded story image was saved to your device gallery.",
        );
        return;
      }

      if (!story.uri) {
        throw new Error("Story media is unavailable.");
      }

      /*
       * Story media comes from the durable NexChat attachment store.
       * Those files intentionally have generated IDs without media
       * extensions and live inside the app's private storage.
       *
       * MediaLibrary needs a gallery-saveable local file with a
       * recognizable image/video extension, so copy the attachment
       * into the cache with the correct extension first.
       */
      const extension =
        story.type === "video"
          ? "mp4"
          : "jpg";

      const exportUri =
        `${FileSystem.cacheDirectory || ""}nexchat-story-${Date.now()}.${extension}`;

      if (!FileSystem.cacheDirectory) {
        throw new Error(
          "Temporary media storage is unavailable.",
        );
      }

      const sourceInfo =
        await FileSystem.getInfoAsync(story.uri);

      if (!sourceInfo.exists) {
        throw new Error(
          "The original story media is no longer available.",
        );
      }

      await FileSystem.copyAsync({
        from: story.uri,
        to: exportUri,
      });

      const exportedInfo =
        await FileSystem.getInfoAsync(exportUri);

      if (!exportedInfo.exists) {
        throw new Error(
          "The story media could not be prepared for saving.",
        );
      }

      try {
        await MediaLibrary.createAssetAsync(exportUri);
      } finally {
        await FileSystem.deleteAsync(
          exportUri,
          { idempotent: true },
        ).catch(() => undefined);
      }

      Alert.alert(
        "Saved",
        story.type === "video"
          ? "The story video was saved to your device gallery."
          : "The story photo was saved to your device gallery.",
      );
    } catch (error) {
      Alert.alert(
        "Download failed",
        error instanceof Error
          ? error.message
          : "The story could not be saved.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function sendStoryReply() {
    const text = replyText.trim();

    if (!text || !ownerId || replying) {
      return;
    }

    setReplying(true);
    setReplyText("");

    try {
      await st.sendMessage(
        ownerId,
        `Story reply: ${text}`,
        undefined,
        {
          replyToId: story.id,
        },
      );

      Alert.alert("Sent", "Your story reply was sent.");
    } catch (error) {
      setReplyText(text);

      Alert.alert(
        "Couldn't send reply",
        error instanceof Error
          ? error.message
          : "The reply could not be sent.",
      );
    } finally {
      setReplying(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {story.type === "text" && (
    <View
      ref={textExportRef}
      collapsable={false}
      style={[
        styles.textExport,
        {
          backgroundColor:
            story.background || "#102A43",
        },
      ]}
    >
      <Image
        source={require("../../assets/icon.png")}
        resizeMode="contain"
        style={styles.exportLogo}
      />

      <Text style={styles.exportBrand}>EXILE</Text>

      <Text style={styles.exportStoryText}>
        {story.text || ""}
      </Text>

      <Text style={styles.exportWatermark}>
        NEXCHAT • EXILE
      </Text>
    </View>
  )}

  <View style={styles.container}>
        {story.type === "image" && story.uri ? (
          <Image
            source={{ uri: story.uri }}
            resizeMode="contain"
            style={styles.image}
          />
        ) : story.type === "video" && story.uri ? (
          <StoryVideo
            key={story.id}
            uri={story.uri}
            onEnd={nextStory}
          />
        ) : (
          <View
            style={[
              styles.textStory,
              {
                backgroundColor:
                  story.background || "#102A43",
              },
            ]}
          >
            <Text style={styles.storyText}>
              {story.text || ""}
            </Text>
          </View>
        )}

        <View style={styles.top}>
          <View style={styles.progressRow}>
            {stories.map((item, itemIndex) => (
              <View
                key={item.id}
                style={[
                  styles.progress,
                  itemIndex <= index &&
                    styles.progressActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              style={styles.backButton}
              accessibilityLabel="Close story"
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>

            <View style={styles.headerIdentity}>
              <View>
                <Text style={styles.ownerName}>
                  {ownerName}
                </Text>

                <Text style={styles.timestamp}>
                  {new Date(
                    story.createdAt
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>

              <Pressable
                onPress={downloadStory}
                disabled={downloading}
                style={[
                  styles.downloadButton,
                  downloading && styles.downloadButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  downloading
                    ? "Saving story"
                    : "Download story"
                }
              >
                <Text style={styles.downloadIcon}>
                  {downloading ? "…" : "⇩"}
                </Text>

                <Text style={styles.downloadLabel}>
                  {downloading ? "Saving" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {isOwner ? (
          <View style={styles.captionBar}>
            {editingCaption ? (
              <>
                <TextInput
                  value={captionText}
                  onChangeText={setCaptionText}
                  placeholder="Add a caption…"
                  placeholderTextColor="#AAAAAA"
                  style={styles.captionInput}
                  autoFocus
                  maxLength={500}
                />

                <Pressable
                  onPress={() => {
                    setCaptionText(story.caption || "");
                    setEditingCaption(false);
                  }}
                  disabled={savingCaption}
                  style={styles.captionAction}
                  accessibilityLabel="Cancel caption edit"
                >
                  <Text style={styles.captionActionText}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={saveCaption}
                  disabled={savingCaption}
                  style={styles.captionAction}
                  accessibilityLabel="Save caption"
                >
                  <Text style={styles.captionActionText}>
                    {savingCaption ? "…" : "Save"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={beginCaptionEdit}
                style={styles.editCaptionButton}
                accessibilityLabel="Edit story caption"
              >
                <Text style={styles.editCaptionText}>
                  {story.caption ? story.caption : "Edit caption"}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.replyBar}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Reply to this story…"
              placeholderTextColor="#AAAAAA"
              style={styles.replyInput}
              returnKeyType="send"
              onSubmitEditing={sendStoryReply}
            />

            <Pressable
              onPress={sendStoryReply}
              disabled={!replyText.trim() || replying}
              style={[
                styles.replyButton,
                (!replyText.trim() || replying) &&
                  styles.replyButtonDisabled,
              ]}
              accessibilityLabel="Send story reply"
            >
              <Text style={styles.replyButtonText}>
                {replying ? "…" : "Send"}
              </Text>
            </Pressable>
          </View>
        )}

        <View pointerEvents="box-none" style={styles.controls}>
          <Pressable
            style={styles.leftZone}
            onPress={previousStory}
            accessibilityLabel="Previous story"
          />

          <Pressable
            style={styles.rightZone}
            onPress={nextStory}
            accessibilityLabel="Next story"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  textExport: {
    position: "absolute",
    left: -10000,
    top: 0,
    width: 360,
    height: 640,
    paddingHorizontal: 32,
    paddingTop: 42,
    paddingBottom: 28,
    alignItems: "center",
    justifyContent: "space-between",
  },

  exportLogo: {
    width: 58,
    height: 58,
  },

  exportBrand: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
  },

  exportStoryText: {
    flex: 1,
    width: "100%",
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 38,
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
    paddingVertical: 36,
  },

  exportWatermark: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  textStory: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
  },

  storyText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
  },

  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    paddingHorizontal: 12,
  },

  progressRow: {
    flexDirection: "row",
    gap: 4,
  },

  progress: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF66",
  },

  progressActive: {
    backgroundColor: "#FFFFFF",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    zIndex: 30,
    elevation: 30,
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },

  backText: {
    color: "#fff",
    fontSize: 38,
    lineHeight: 38,
  },

  ownerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  timestamp: {
    color: "#ddd",
    fontSize: 12,
    marginTop: 2,
  },

  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  downloadButton: {
    minWidth: 78,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    backgroundColor: "#000000AA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "#FFFFFF33",
  },

  downloadButtonDisabled: {
    opacity: 0.65,
  },

  downloadIcon: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24,
  },

  downloadLabel: {
    marginLeft: 5,
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  replyBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },

  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 90,
    borderRadius: 22,
    backgroundColor: "#FFFFFFEE",
    color: "#111",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  replyButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0C5A8D",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  replyButtonDisabled: {
    opacity: 0.5,
  },

  replyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },

  captionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 18,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },

  editCaptionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: "#000000AA",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  editCaptionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  captionInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 90,
    borderRadius: 22,
    backgroundColor: "#FFFFFFEE",
    color: "#111",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  captionAction: {
    minHeight: 44,
    marginLeft: 6,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "#000000AA",
    alignItems: "center",
    justifyContent: "center",
  },

  captionActionText: {
    color: "#fff",
    fontWeight: "800",
  },

  controls: {
    position: "absolute",
    top: 82,
    bottom: 82,
    left: 0,
    right: 0,
    flexDirection: "row",
    zIndex: 5,
  },

  leftZone: {
    flex: 1,
  },

  rightZone: {
    flex: 1,
  },
});
