import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getStoriesForUser,
  Story,
} from "../core/stories";

type StoryShortcutProps = {
  ownerId: string;
  ownerName: string;
  avatarUri?: string;
  onPress: () => void;
};

export function StoryShortcut({
  ownerId,
  ownerName,
  avatarUri,
  onPress,
}: StoryShortcutProps) {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const result = await getStoriesForUser(ownerId);

      if (mounted) {
        setStories(result);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [ownerId]);

  if (!stories.length) {
    return null;
  }

  const hasUnviewed = stories.some((story) => !story.viewed);

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={"View " + ownerName + "'s stories"}
    >
      <View
        style={[
          styles.ring,
          hasUnviewed
            ? styles.ringUnread
            : styles.ringViewed,
        ]}
      >
        <View style={styles.avatar}>
          {avatarUri ? (
            <Text style={styles.avatarImage}>◉</Text>
          ) : (
            <Text style={styles.avatarText}>
              {ownerName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {ownerName}
      </Text>

      <Text style={styles.storyLabel}>Story</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 74,
    alignItems: "center",
    marginRight: 12,
  },

  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
  },

  ringUnread: {
    borderWidth: 3,
    borderColor: "#0C5A8D",
  },

  ringViewed: {
    borderWidth: 2,
    borderColor: "#9AA6B2",
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#D9E2EC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  avatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#102A43",
  },

  avatarImage: {
    fontSize: 20,
    color: "#102A43",
  },

  name: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: "700",
    color: "#102A43",
  },

  storyLabel: {
    fontSize: 10,
    color: "#66788A",
    marginTop: 1,
  },
});
