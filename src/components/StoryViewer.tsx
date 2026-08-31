import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getStoriesForUser,
  markStoryViewed,
  Story,
} from "../core/stories";

type StoryViewerProps = {
  visible: boolean;
  ownerId: string | null;
  ownerName: string;
  onClose: () => void;
};

export function StoryViewer({
  visible,
  ownerId,
  ownerName,
  onClose,
}: StoryViewerProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
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

        const result = await getStoriesForUser(ownerId);

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
  }, [visible, ownerId]);

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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {story.type === "image" && story.uri ? (
          <Image
            source={{ uri: story.uri }}
            resizeMode="contain"
            style={styles.image}
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
              <Text style={styles.backText}>â€¹</Text>
            </Pressable>

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
          </View>
        </View>

        <View style={styles.controls}>
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

  controls: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },

  leftZone: {
    flex: 1,
  },

  rightZone: {
    flex: 1,
  },
});
