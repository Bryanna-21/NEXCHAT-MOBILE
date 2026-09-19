import React from "react";
import type { ReactNode } from "react";

import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  FeedCreator,
  FeedPost,
  getFeedFollowCounts,
  isFollowingFeedCreator,
  toggleFeedFollow,
} from "../core/feed";

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
  renderPostMedia?: (post: FeedPost) => ReactNode;
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
  renderPostMedia,
}: FeedProfileScreenProps) {
  const creatorPosts = posts.filter(
    (post) => post.creator.id === creator.id,
  );

  const isOwnProfile = creator.id === currentUserId;
  const initials = initialsFor(creator.name);

  const [following, setFollowing] = React.useState(false);
  const [followersCount, setFollowersCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [followLoading, setFollowLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    const loadFollowState = async () => {
      const [isFollowing, counts] = await Promise.all([
        isFollowingFeedCreator(currentUserId, creator.id),
        getFeedFollowCounts(creator.id),
      ]);

      if (!mounted) {
        return;
      }

      setFollowing(isFollowing);
      setFollowersCount(counts.followers);
      setFollowingCount(counts.following);
    };

    void loadFollowState();

    return () => {
      mounted = false;
    };
  }, [creator.id, currentUserId]);

  const handleFollow = async () => {
    if (isOwnProfile || followLoading) {
      return;
    }

    setFollowLoading(true);

    try {
      const result = await toggleFeedFollow(
        currentUserId,
        creator.id,
      );

      setFollowing(result.following);
      setFollowersCount(result.followers);
      setFollowingCount(result.followingCount);
    } finally {
      setFollowLoading(false);
    }
  };

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

          {!!creator.bio && (
            <Text style={[styles.bio, { color: theme.ink }]}>
              {creator.bio}
            </Text>
          )}

          {(creator.website || creator.location || creator.pronouns) ? (
            <View
              style={[
                styles.profileDetails,
                {
                  borderColor: theme.line,
                  backgroundColor: theme.bg,
                },
              ]}
            >
              {!!creator.website && (
                <Text style={[styles.detailText, { color: theme.brand }]}>
                  {creator.website}
                </Text>
              )}

              {!!creator.location && (
                <Text style={[styles.detailText, { color: theme.muted }]}>
                  📍 {creator.location}
                </Text>
              )}

              {!!creator.pronouns && (
                <Text style={[styles.detailText, { color: theme.muted }]}>
                  {creator.pronouns}
                </Text>
              )}
            </View>
          ) : null}

          {!!creator.joinedAt && (
            <Text style={[styles.joinedText, { color: theme.muted }]}>
              Joined NexChat{" "}
              {new Date(creator.joinedAt).toLocaleDateString([], {
                month: "long",
                year: "numeric",
              })}
            </Text>
          )}

          <View
            style={[
              styles.statsRow,
              {
                borderTopColor: theme.line,
                borderBottomColor: theme.line,
              },
            ]}
          >
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: theme.ink }]}>
                {creatorPosts.length}
              </Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>
                Posts
              </Text>
            </View>

            <View
              style={[
                styles.statDivider,
                { backgroundColor: theme.line },
              ]}
            />

            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: theme.ink }]}>
                {followersCount}
              </Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>
                Followers
              </Text>
            </View>

            <View
              style={[
                styles.statDivider,
                { backgroundColor: theme.line },
              ]}
            />

            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: theme.ink }]}>
                {followingCount}
              </Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>
                Following
              </Text>
            </View>
          </View>

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
          ) : (
            <Pressable
              onPress={handleFollow}
              disabled={followLoading}
              accessibilityRole="button"
              accessibilityLabel={
                following ? "Unfollow profile" : "Follow profile"
              }
              style={[
                styles.followButton,
                {
                  backgroundColor: following
                    ? theme.bg
                    : theme.brand,
                  borderColor: theme.brand,
                  opacity: followLoading ? 0.65 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.followButtonText,
                  {
                    color: following ? theme.brand : "#FFFFFF",
                  },
                ]}
              >
                {following ? "Following" : "Follow"}
              </Text>
            </Pressable>
          )}
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

              {renderPostMedia?.(post)}

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
  bio: {
    marginTop: 14,
    maxWidth: 340,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  profileDetails: {
    width: "100%",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  joinedText: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center",
  },
  statsRow: {
    width: "100%",
    marginTop: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "700",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
  },
  followButton: {
    minWidth: 150,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: "900",
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
