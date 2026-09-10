import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import {
  createFeedPost,
  FeedAttachment,
  FeedCreator,
  FeedPost,
  FeedPostType,
  loadFeedPosts,
} from "../core/feed";

type FeedTheme = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
};

type FeedScreenProps = {
  theme: FeedTheme;
  identity?: unknown;
};

function identityValue(
  identity: unknown,
  keys: string[],
): string | undefined {
  if (!identity || typeof identity !== "object") return undefined;

  const source = identity as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getCreator(identity: unknown): FeedCreator {
  const id =
    identityValue(identity, ["id", "userId", "identityId"]) ??
    "local-user";

  const name =
    identityValue(identity, ["displayName", "name", "fullName"]) ??
    "NEXCHAT User";

  const username = identityValue(identity, [
    "username",
    "handle",
    "userName",
  ]);

  const avatarUri = identityValue(identity, [
    "avatarUri",
    "avatar",
    "photoUri",
    "photoURL",
    "photoUrl",
  ]);

  return {
    id,
    name,
    username,
    avatarUri,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PostCard({
  post,
  theme,
}: {
  post: FeedPost;
  theme: FeedTheme;
}) {
  const initials = post.creator.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const openLink = async () => {
    if (!post.linkUrl) return;

    try {
      await Linking.openURL(post.linkUrl);
    } catch {
      // Batch 2 will add richer link/error handling.
    }
  };

  return (
    <View
      style={[
        styles.post,
        {
          backgroundColor: theme.card,
          borderColor: theme.line,
        },
      ]}
    >
      <View style={styles.creatorRow}>
        {post.creator.avatarUri ? (
          <Image source={{ uri: post.creator.avatarUri }} style={styles.avatar} />
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

        <View style={styles.creatorInfo}>
          <Text style={[styles.creatorName, { color: theme.ink }]}>
            {post.creator.name}
          </Text>

          <Text style={[styles.postMeta, { color: theme.muted }]}>
            {post.creator.username
              ? `@${post.creator.username} · `
              : ""}
            {formatDate(post.createdAt)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post options"
          hitSlop={10}
          style={styles.moreButton}
        >
          <Text style={[styles.moreText, { color: theme.muted }]}>•••</Text>
        </Pressable>
      </View>

      {!!post.text && (
        <Text style={[styles.postText, { color: theme.ink }]}>
          {post.text}
        </Text>
      )}

      {post.type === "link" && post.linkUrl && (
        <Pressable
          onPress={openLink}
          style={[
            styles.linkCard,
            {
              backgroundColor: theme.bg,
              borderColor: theme.line,
            },
          ]}
        >
          <Text style={[styles.linkLabel, { color: theme.brand }]}>
            LINK
          </Text>

          <Text
            style={[styles.linkText, { color: theme.ink }]}
            numberOfLines={3}
          >
            {post.linkUrl}
          </Text>
        </Pressable>
      )}

      {post.attachment && (
        <View
          style={[
            styles.attachmentCard,
            {
              backgroundColor: theme.bg,
              borderColor: theme.line,
            },
          ]}
        >
          <Text style={styles.attachmentIcon}>
            {post.type === "media" ? "▣" : "📎"}
          </Text>

          <View style={styles.attachmentInfo}>
            <Text
              style={[styles.attachmentName, { color: theme.ink }]}
              numberOfLines={2}
            >
              {post.attachment.name || "Attached file"}
            </Text>

            <Text style={[styles.attachmentType, { color: theme.muted }]}>
              {post.attachment.mimeType || "Attachment"}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.actionBar, { borderTopColor: theme.line }]}>
        <Pressable style={styles.actionButton}>
          <Text style={[styles.actionText, { color: theme.muted }]}>
            ♡ Like
          </Text>
        </Pressable>

        <Pressable style={styles.actionButton}>
          <Text style={[styles.actionText, { color: theme.muted }]}>
            ◯ Comment
          </Text>
        </Pressable>

        <Pressable style={styles.actionButton}>
          <Text style={[styles.actionText, { color: theme.muted }]}>
            ↗ Share
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function FeedScreen({
  theme,
  identity,
}: FeedScreenProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [attachment, setAttachment] = useState<FeedAttachment | undefined>();

  const creator = useMemo(
    () => getCreator(identity),
    [identity],
  );

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      setPosts(await loadFeedPosts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetComposer = () => {
    setText("");
    setLinkUrl("");
    setAttachment(undefined);
  };

  const closeComposer = () => {
    if (publishing) return;

    resetComposer();
    setComposerOpen(false);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      setAttachment({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });
    } catch {
      // Composer remains usable if the picker is unavailable.
    }
  };

  const publish = async (type: FeedPostType) => {
    const cleanText = text.trim();
    const cleanLink = linkUrl.trim();

    if (
      !cleanText &&
      !attachment &&
      !(type === "link" && cleanLink)
    ) {
      return;
    }

    setPublishing(true);

    try {
      await createFeedPost({
        type,
        creator,
        text: cleanText,
        linkUrl: type === "link" ? cleanLink : undefined,
        attachment,
      });

      await refresh();
      resetComposer();
      setComposerOpen(false);
    } finally {
      setPublishing(false);
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
        <View>
          <Text style={[styles.title, { color: theme.ink }]}>Feed</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Your social space
          </Text>
        </View>

        <Pressable
          onPress={() => setComposerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Create post"
          style={[styles.addButton, { backgroundColor: theme.brand }]}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.stateText, { color: theme.muted }]}>
            Loading feed…
          </Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyIcon, { color: theme.brand }]}>▦</Text>

          <Text style={[styles.emptyTitle, { color: theme.ink }]}>
            Your feed is empty
          </Text>

          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Start the conversation. Share a thought, file, photo, or link.
          </Text>

          <Pressable
            onPress={() => setComposerOpen(true)}
            style={[styles.emptyButton, { backgroundColor: theme.brand }]}
          >
            <Text style={styles.emptyButtonText}>Create your first post</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.feed}
          showsVerticalScrollIndicator={false}
        >
          {posts.map((post) => (
            <PostCard key={post.id} post={post} theme={theme} />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={composerOpen}
        animationType="slide"
        transparent
        onRequestClose={closeComposer}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.composer,
              { backgroundColor: theme.card },
            ]}
          >
            <View style={styles.composerHeader}>
              <View>
                <Text style={[styles.composerTitle, { color: theme.ink }]}>
                  Create post
                </Text>
                <Text style={[styles.composerSubtitle, { color: theme.muted }]}>
                  Share something with your feed
                </Text>
              </View>

              <Pressable onPress={closeComposer} disabled={publishing}>
                <Text style={[styles.closeText, { color: theme.muted }]}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.composerCreator}>
                <View
                  style={[
                    styles.smallAvatar,
                    { backgroundColor: theme.brand },
                  ]}
                >
                  <Text style={styles.initials}>
                    {creator.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </Text>
                </View>

                <View>
                  <Text style={[styles.creatorName, { color: theme.ink }]}>
                    {creator.name}
                  </Text>
                  <Text style={[styles.postMeta, { color: theme.muted }]}>
                    Posting to Feed
                  </Text>
                </View>
              </View>

              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="What do you want to share?"
                placeholderTextColor={theme.muted}
                multiline
                textAlignVertical="top"
                style={[
                  styles.textInput,
                  {
                    color: theme.ink,
                    borderColor: theme.line,
                    backgroundColor: theme.bg,
                  },
                ]}
              />

              <TextInput
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="Paste a link (optional)"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[
                  styles.linkInput,
                  {
                    color: theme.ink,
                    borderColor: theme.line,
                    backgroundColor: theme.bg,
                  },
                ]}
              />

              {attachment && (
                <View
                  style={[
                    styles.selectedAttachment,
                    {
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  <Text style={[styles.selectedName, { color: theme.ink }]}>
                    📎 {attachment.name || "Selected file"}
                  </Text>

                  <Pressable onPress={() => setAttachment(undefined)}>
                    <Text style={{ color: theme.brand }}>Remove</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.composerTools}>
                <Pressable
                  onPress={pickFile}
                  style={[
                    styles.toolButton,
                    {
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  <Text style={[styles.toolText, { color: theme.ink }]}>
                    ＋ File
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setLinkUrl(linkUrl || "https://")}
                  style={[
                    styles.toolButton,
                    {
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  <Text style={[styles.toolText, { color: theme.ink }]}>
                    🔗 Link
                  </Text>
                </Pressable>
              </View>

              <View style={styles.publishRow}>
                <Pressable
                  onPress={closeComposer}
                  disabled={publishing}
                  style={[
                    styles.cancelButton,
                    { borderColor: theme.line },
                  ]}
                >
                  <Text style={[styles.cancelText, { color: theme.ink }]}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    publish(
                      attachment
                        ? "file"
                        : linkUrl.trim()
                          ? "link"
                          : "text",
                    )
                  }
                  disabled={
                    publishing ||
                    (!text.trim() &&
                      !attachment &&
                      !linkUrl.trim())
                  }
                  style={[
                    styles.publishButton,
                    {
                      backgroundColor:
                        publishing ||
                        (!text.trim() &&
                          !attachment &&
                          !linkUrl.trim())
                          ? theme.muted
                          : theme.brand,
                    },
                  ]}
                >
                  {publishing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.publishText}>Post</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
  },

  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },

  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  addButtonText: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "400",
  },

  feed: {
    padding: 12,
    paddingBottom: 110,
    gap: 12,
  },

  post: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
  },

  creatorRow: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  initialAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },

  initials: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  creatorInfo: {
    flex: 1,
    marginLeft: 11,
  },

  creatorName: {
    fontSize: 15,
    fontWeight: "800",
  },

  postMeta: {
    fontSize: 12,
    marginTop: 3,
  },

  moreButton: {
    paddingLeft: 10,
  },

  moreText: {
    fontSize: 16,
    letterSpacing: 2,
  },

  postText: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 16,
    lineHeight: 24,
  },

  linkCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },

  linkLabel: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 6,
  },

  linkText: {
    fontSize: 14,
    lineHeight: 20,
  },

  attachmentCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },

  attachmentIcon: {
    fontSize: 27,
    marginRight: 12,
  },

  attachmentInfo: {
    flex: 1,
  },

  attachmentName: {
    fontSize: 14,
    fontWeight: "800",
  },

  attachmentType: {
    fontSize: 12,
    marginTop: 3,
  },

  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
  },

  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },

  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  stateText: {
    marginTop: 10,
    fontSize: 13,
  },

  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
  },

  emptyText: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontSize: 14,
  },

  emptyButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },

  emptyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  composer: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },

  composerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },

  composerTitle: {
    fontSize: 23,
    fontWeight: "900",
  },

  composerSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },

  closeText: {
    fontSize: 22,
    padding: 4,
  },

  composerCreator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  smallAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  textInput: {
    minHeight: 150,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    padding: 14,
    fontSize: 16,
    lineHeight: 23,
  },

  linkInput: {
    minHeight: 48,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 14,
  },

  selectedAttachment: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectedName: {
    flex: 1,
    marginRight: 10,
    fontSize: 13,
    fontWeight: "700",
  },

  composerTools: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  toolButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },

  toolText: {
    fontWeight: "800",
    fontSize: 13,
  },

  publishRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },

  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    fontWeight: "800",
  },

  publishButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  publishText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },
});
