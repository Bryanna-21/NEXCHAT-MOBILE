import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FeedCreator, FeedPost } from "../core/feed";

type FeedProfileTheme = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
};

type FeedProfileScreenProps = {
  theme: FeedProfileTheme;
  creator: FeedCreator;
  posts: FeedPost[];
  currentUserId: string;
  onBack: () => void;
};

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function FeedProfileScreen({

  theme,
  creator,
  posts,
  currentUserId,
  onBack,
}: FeedProfileScreenProps) {
  const creatorPosts = posts.filter(
    (post) => post.creator.id === creator.id,
  );

  const isOwnProfile = creator.id === currentUserId;
  const initials = initialsFor(creator.name);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.line,
          },
        ]}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to feed"
          style={styles.backButton}
        >
          <Text style={[styles.backText, { color: theme.ink }]}>‹</Text>
        </Pressable>

        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerTitle, { color: theme.ink }]}
            numberOfLines={1}
          >
            Profile
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.line,
            },
          ]}
        >
          {creator.avatarUri ? (
            <Image
              source={{ uri: creator.avatarUri }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.initialAvatar,
                { backgroundColor: theme.brand },
              ]}
            >
              <Text style={styles.initials}>{initials || "N"}</Text>
            </View>
          )}

          <Text style={[styles.name, { color: theme.ink }]}>
            {creator.name}
          </Text>

          {creator.username ? (
            <Text style={[styles.username, { color: theme.muted }]}>
              @{creator.username}
            </Text>
          ) : null}

          <Text style={[styles.nexId, { color: theme.muted }]}>
            NexChat ID: {creator.id}
          </Text>

          {isOwnProfile ? (
            <View
              style={[
                styles.youBadge,
                {
                  backgroundColor: theme.bg,
                  borderColor: theme.line,
                },
              ]}
            >
              <Text style={[styles.youText, { color: theme.brand }]}>
                Your profile
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.ink }]}>
            Posts
          </Text>

          <Text style={[styles.sectionCount, { color: theme.muted }]}>
            {creatorPosts.length}
          </Text>
        </View>

        {creatorPosts.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.line,
              },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>
              No posts yet
            </Text>
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              Posts from this profile will appear here.
            </Text>
          </View>
        ) : (
          creatorPosts.map((post) => (
            <View
              key={post.id}
              style={[
                styles.postCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.line,
                },
              ]}
            >
              {!!post.text && (
                <Text style={[styles.postText, { color: theme.ink }]}>
                  {post.text}
                </Text>
              )}

              <Text style={[styles.postDate, { color: theme.muted }]}>
                {new Date(post.createdAt).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  backButton: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 34,
    lineHeight: 40,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  content: {
    padding: 14,
    paddingBottom: 32,
  },
  profileCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 22,
    padding: 24,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  initialAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 30,
  },
  name: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  username: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
  },
  nexId: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center",
  },
  youBadge: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 999,
  },
  youText: {
    fontSize: 12,
    fontWeight: "900",
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "900",
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 5,
    textAlign: "center",
    fontSize: 13,
  },
  postCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
  },
  postText: {
    fontSize: 15,
    lineHeight: 22,
  },
  postDate: {
    marginTop: 10,
    fontSize: 11,
  },
});
