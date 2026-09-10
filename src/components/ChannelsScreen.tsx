import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Identity } from "../core/identity";
import { capturePhoto, captureVideo, pickMedia, pickProfilePhoto } from "../core/media";
import {
  Channel,
  ChannelComment,
  ChannelPost,
  addChannelPost,
  addComment,
  createChannel,
  deleteChannelPost,
  deleteComment,
  ensureDefaultChannel,
  getChannels,
  getCommentsForPost,
  getPostsForChannel,
  subscribeToChannel,
  toggleLikePost,
  unsubscribeFromChannel,
  updateChannel,
} from "../core/channels";
import { ActionSheet, ActionSheetOption } from "./ActionSheet";

type ChannelsScreenProps = {
  theme: any;
  identity: Identity | null;
};

export function ChannelsScreen({ theme, identity }: ChannelsScreenProps) {
  const myId = identity?.id;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;

    setLoading(true);

    try {
      await ensureDefaultChannel(myId);
      const list = await getChannels();
      setChannels(list);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickNewAvatar = async () => {
    try {
      const uri = await pickProfilePhoto();
      if (uri) setNewAvatarUri(uri);
    } catch (e) {
      Alert.alert(
        "Couldn't set image",
        e instanceof Error ? e.message : "Something went wrong."
      );
    }
  };

  const submitCreate = async () => {
    if (!myId) return;

    try {
      await createChannel(newName, myId, newDescription, newAvatarUri || undefined);
      setNewName("");
      setNewDescription("");
      setNewAvatarUri(null);
      setCreateVisible(false);
      await load();
    } catch (e) {
      Alert.alert(
        "Couldn't create channel",
        e instanceof Error ? e.message : "Something went wrong."
      );
    }
  };

  return (
    <View style={s.flex}>
      <View
        style={[
          s.header,
          { backgroundColor: theme.card, borderBottomColor: theme.line },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.headTitle, { color: theme.ink }]}>Channels</Text>
          <Text style={[s.headSub, { color: theme.muted }]}>
            Follow updates and post to your own broadcast channel
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setCreateVisible(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 26, color: theme.brand }}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={channels}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ color: theme.muted }}>
              {loading ? "Loading channels…" : "No channels yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setOpenChannel(item)}
            style={[s.row, { backgroundColor: theme.card, borderColor: theme.line }]}
          >
            {item.avatarUri ? (
              <Image source={{ uri: item.avatarUri }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>
                  {item.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 15 }}>
                {item.name}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                {item.description || `${item.subscriberIds.length} subscriber(s)`}
              </Text>
            </View>

            <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>
              New channel
            </Text>

            <TouchableOpacity onPress={pickNewAvatar} style={{ alignSelf: "center", marginBottom: 12 }}>
              {newAvatarUri ? (
                <Image source={{ uri: newAvatarUri }} style={s.avatarLarge} />
              ) : (
                <View style={[s.avatarLarge, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.line }]}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Channel name"
              placeholderTextColor={theme.muted}
              style={[s.input, { color: theme.ink, borderColor: theme.line }]}
            />

            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.muted}
              style={[s.input, { color: theme.ink, borderColor: theme.line, marginTop: 8 }]}
            />

            <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
              <TouchableOpacity
                onPress={() => setCreateVisible(false)}
                style={[s.button, { borderColor: theme.line, borderWidth: 1 }]}
              >
                <Text style={{ color: theme.ink }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={submitCreate}
                style={[s.button, { backgroundColor: theme.brand }]}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {openChannel && myId && (
        <ChannelDetail
          theme={theme}
          channel={openChannel}
          myId={myId}
          onClose={() => {
            setOpenChannel(null);
            load();
          }}
        />
      )}
    </View>
  );
}

function ChannelDetail({
  theme,
  channel,
  myId,
  onClose,
}: {
  theme: any;
  channel: Channel;
  myId: string;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [mediaMenuVisible, setMediaMenuVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [postActionsFor, setPostActionsFor] = useState<ChannelPost | null>(null);
  const [commentsFor, setCommentsFor] = useState<ChannelPost | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const subscribed = channel.subscriberIds.includes(myId);
  const isOwner = channel.ownerId === myId;
  const isAdmin = channel.adminIds.includes(myId);
  const canPost = subscribed;
  const canModerate = isOwner || isAdmin;

  const loadPosts = useCallback(async () => {
    const result = await getPostsForChannel(channel.id);
    setPosts(result);

    const counts: Record<string, number> = {};
    for (const post of result) {
      const comments = await getCommentsForPost(post.id);
      counts[post.id] = comments.length;
    }
    setCommentCounts(counts);
  }, [channel.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const join = async () => {
    await subscribeToChannel(channel.id, myId);
    onClose();
  };

  const postText = async () => {
    const text = draft.trim();
    if (!text) return;

    await addChannelPost(channel.id, myId, { type: "text", text });
    setDraft("");
    await loadPosts();
  };

  const postMedia = async (
    getMedia: () => Promise<{ uri: string; type: "image" | "video" } | null>
  ) => {
    setPosting(true);

    try {
      const media = await getMedia();
      if (!media) return;

      await addChannelPost(channel.id, myId, {
        type: media.type,
        uri: media.uri,
      });

      await loadPosts();
    } catch (e) {
      Alert.alert(
        "Couldn't post",
        e instanceof Error ? e.message : "Something went wrong."
      );
    } finally {
      setPosting(false);
    }
  };

  const mediaMenuOptions: ActionSheetOption[] = [
    {
      text: "Camera photo",
      onPress: () =>
        postMedia(async () => {
          const a = await capturePhoto();
          return a ? { uri: a.uri, type: "image" } : null;
        }),
    },
    {
      text: "Camera video",
      onPress: () =>
        postMedia(async () => {
          const a = await captureVideo();
          return a ? { uri: a.uri, type: "video" } : null;
        }),
    },
    {
      text: "Gallery",
      onPress: () =>
        postMedia(async () => {
          const picked = await pickMedia(false);
          const a = picked[0];
          if (!a) return null;
          if (a.type !== "image" && a.type !== "video") {
            throw new Error("Only photos and videos can be posted here.");
          }
          return { uri: a.uri, type: a.type };
        }),
    },
    { text: "Cancel", style: "cancel" },
  ];

  const canDeletePost = (post: ChannelPost) =>
    post.authorId === myId || canModerate;

  const postActionsOptions: ActionSheetOption[] = postActionsFor
    ? [
        {
          text: "Delete post",
          style: "destructive",
          onPress: async () => {
            if (!postActionsFor) return;
            await deleteChannelPost(postActionsFor.id);
            await loadPosts();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    : [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.flex, { backgroundColor: theme.bg }]}>
        <View
          style={[
            s.header,
            { backgroundColor: theme.card, borderBottomColor: theme.line },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={{ paddingRight: 10 }}>
            <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setInfoVisible(true)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            {channel.avatarUri ? (
              <Image source={{ uri: channel.avatarUri }} style={s.headerAvatar} />
            ) : (
              <View style={[s.headerAvatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>
                  {channel.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={[s.headTitle, { color: theme.ink }]}>{channel.name}</Text>
              <Text style={[s.headSub, { color: theme.muted }]}>
                {channel.subscriberIds.length} subscriber(s) · tap for info
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ color: theme.muted }}>No posts yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const liked = (item.likedBy ?? []).includes(myId);
            const likeCount = (item.likedBy ?? []).length;

            return (
              <View
                style={[
                  s.postCard,
                  { backgroundColor: theme.card, borderColor: theme.line },
                ]}
              >
                {item.type === "image" && item.uri && (
                  <Image source={{ uri: item.uri }} style={s.postImage} resizeMode="cover" />
                )}
                {item.type === "video" && item.uri && (
                  <View style={[s.postImage, { alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 30, color: theme.ink }}>▶</Text>
                    <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                      Video post
                    </Text>
                  </View>
                )}
                {item.text && (
                  <Text style={{ color: theme.ink, marginTop: item.uri ? 8 : 0 }}>
                    {item.text}
                  </Text>
                )}
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 6 }}>
                  {new Date(item.createdAt).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                <View style={s.postActionsRow}>
                  <TouchableOpacity
                    onPress={async () => {
                      await toggleLikePost(item.id, myId);
                      await loadPosts();
                    }}
                    style={s.postActionBtn}
                  >
                    <Text style={{ fontSize: 15 }}>{liked ? "❤️" : "🤍"}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{likeCount || ""}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setCommentsFor(item)}
                    style={s.postActionBtn}
                  >
                    <Text style={{ fontSize: 15 }}>💬</Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{commentCounts[item.id] || ""}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() =>
                      Share.share({
                        message: item.text
                          ? `${item.text}\n\nShared from NexChat · ${channel.name}`
                          : `Shared from NexChat · ${channel.name}`,
                        url: item.uri,
                      }).catch(() => {})
                    }
                    style={s.postActionBtn}
                  >
                    <Text style={{ fontSize: 15 }}>↗️</Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1 }} />

                  {canDeletePost(item) && (
                    <TouchableOpacity
                      onPress={() => setPostActionsFor(item)}
                      style={s.postActionBtn}
                    >
                      <Text style={{ fontSize: 18, color: theme.muted }}>⋮</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />

        {canPost ? (
          <View
            style={[
              s.composer,
              { backgroundColor: theme.card, borderTopColor: theme.line },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <TouchableOpacity onPress={() => setMediaMenuVisible(true)} disabled={posting}>
                <Text style={{ fontSize: 24, color: theme.ink }}>{posting ? "…" : "＋"}</Text>
              </TouchableOpacity>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Post an update…"
                placeholderTextColor={theme.muted}
                style={[s.input, { flex: 1, color: theme.ink, borderColor: theme.line }]}
                multiline
              />

              <TouchableOpacity
                onPress={postText}
                style={{
                  backgroundColor: theme.brand,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ padding: 14 }}>
            <TouchableOpacity
              onPress={join}
              style={[s.button, { backgroundColor: theme.brand }]}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                Join channel to post
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ActionSheet
          visible={mediaMenuVisible}
          title="Add media"
          message="Choose what to post"
          options={mediaMenuOptions}
          onRequestClose={() => setMediaMenuVisible(false)}
          theme={theme}
        />

        <ActionSheet
          visible={!!postActionsFor}
          title="Post"
          options={postActionsOptions}
          onRequestClose={() => setPostActionsFor(null)}
          theme={theme}
        />

        {infoVisible && (
          <ChannelInfo
            theme={theme}
            channel={channel}
            myId={myId}
            posts={posts}
            isOwner={isOwner}
            onLeave={
              subscribed && !isOwner
                ? async () => {
                    await unsubscribeFromChannel(channel.id, myId);
                    setInfoVisible(false);
                    onClose();
                  }
                : undefined
            }
            onUpdated={async (patch) => {
              await updateChannel(channel.id, patch);
            }}
            onClose={() => setInfoVisible(false)}
          />
        )}

        {commentsFor && (
          <CommentsModal
            theme={theme}
            post={commentsFor}
            myId={myId}
            canModerate={canModerate}
            onClose={() => {
              setCommentsFor(null);
              loadPosts();
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function CommentsModal({
  theme,
  post,
  myId,
  canModerate,
  onClose,
}: {
  theme: any;
  post: ChannelPost;
  myId: string;
  canModerate: boolean;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<ChannelComment[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const result = await getCommentsForPost(post.id);
    setComments(result);
  }, [post.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;

    try {
      await addComment(post.id, myId, text);
      setDraft("");
      await load();
    } catch (e) {
      Alert.alert("Couldn't comment", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.flex, { backgroundColor: theme.bg }]}>
        <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
          <TouchableOpacity onPress={onClose} style={{ paddingRight: 10 }}>
            <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.headTitle, { color: theme.ink }]}>Comments</Text>
        </View>

        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ color: theme.muted }}>No comments yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onLongPress={() => {
                if (item.authorId === myId || canModerate) {
                  Alert.alert("Comment", "Choose an action", [
                    {
                      text: "Delete comment",
                      style: "destructive",
                      onPress: async () => {
                        await deleteComment(item.id);
                        await load();
                      },
                    },
                    { text: "Cancel", style: "cancel" },
                  ]);
                }
              }}
              style={{ marginBottom: 12 }}
            >
              <Text style={{ color: theme.brand, fontWeight: "700", fontSize: 12 }}>
                {item.authorId === myId ? "You" : item.authorId}
              </Text>
              <Text style={{ color: theme.ink }}>{item.text}</Text>
              <Text style={{ color: theme.muted, fontSize: 10 }}>
                {new Date(item.createdAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </TouchableOpacity>
          )}
        />

        <View style={[s.composer, { backgroundColor: theme.card, borderTopColor: theme.line }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={theme.muted}
              style={[s.input, { flex: 1, color: theme.ink, borderColor: theme.line }]}
              multiline
            />
            <TouchableOpacity
              onPress={submit}
              style={{
                backgroundColor: theme.brand,
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChannelInfo({
  theme,
  channel,
  myId,
  posts,
  isOwner,
  onLeave,
  onUpdated,
  onClose,
}: {
  theme: any;
  channel: Channel;
  myId: string;
  posts: ChannelPost[];
  isOwner: boolean;
  onLeave?: () => void;
  onUpdated: (patch: { name?: string; description?: string; avatarUri?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const filePosts = posts.filter((p) => p.type === "image" || p.type === "video");

  const roleFor = (userId: string) => {
    if (userId === channel.ownerId) return "Owner";
    if (channel.adminIds.includes(userId)) return "Admin";
    return "Member";
  };

  const changeAvatar = async () => {
    if (!isOwner) return;

    try {
      const uri = await pickProfilePhoto();
      if (uri) {
        await onUpdated({ avatarUri: uri });
      }
    } catch (e) {
      Alert.alert(
        "Couldn't set image",
        e instanceof Error ? e.message : "Something went wrong."
      );
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.flex, { backgroundColor: theme.bg }]}>
        <View
          style={[
            s.header,
            { backgroundColor: theme.card, borderBottomColor: theme.line },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={{ paddingRight: 10 }}>
            <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.headTitle, { color: theme.ink }]}>Channel info</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <TouchableOpacity onPress={changeAvatar} disabled={!isOwner}>
              {channel.avatarUri ? (
                <Image source={{ uri: channel.avatarUri }} style={s.infoAvatar} />
              ) : (
                <View style={[s.infoAvatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: "white", fontSize: 32, fontWeight: "900" }}>
                    {channel.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              {isOwner && (
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 6, textAlign: "center" }}>
                  Tap to change
                </Text>
              )}
            </TouchableOpacity>

            <Text style={{ color: theme.ink, fontWeight: "900", fontSize: 20, marginTop: 12 }}>
              {channel.name}
            </Text>

            {channel.description && (
              <Text style={{ color: theme.muted, textAlign: "center", marginTop: 6 }}>
                {channel.description}
              </Text>
            )}
          </View>

          <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 14, marginBottom: 8 }}>
            {channel.subscriberIds.length} member(s)
          </Text>

          {channel.subscriberIds.map((id) => (
            <View
              key={id}
              style={[s.row, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 6 }]}
            >
              <View style={[s.avatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>
                  {id.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={{ flex: 1, color: theme.ink }} numberOfLines={1}>
                {id === myId ? "You" : id}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>
                {roleFor(id)}
              </Text>
            </View>
          ))}

          <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 14, marginTop: 20, marginBottom: 8 }}>
            Files ({filePosts.length})
          </Text>

          {filePosts.length === 0 ? (
            <Text style={{ color: theme.muted }}>No photos or videos posted yet.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {filePosts.map((p) => (
                <View key={p.id} style={s.fileThumb}>
                  {p.type === "image" && p.uri ? (
                    <Image source={{ uri: p.uri }} style={s.fileThumb} />
                  ) : (
                    <View style={[s.fileThumb, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ fontSize: 20, color: theme.ink }}>▶</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {onLeave && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Leave channel?", "You can rejoin later.", [
                  { text: "Leave", style: "destructive", onPress: onLeave },
                  { text: "Cancel", style: "cancel" },
                ])
              }
              style={[s.button, { backgroundColor: theme.danger, marginTop: 24 }]}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Leave channel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },

  headTitle: { fontSize: 20, fontWeight: "800" },
  headSub: { fontSize: 12, marginTop: 2 },

  empty: {
    padding: 30,
    alignItems: "center",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 8,
    gap: 12,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },

  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  infoAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },

  fileThumb: {
    width: 100,
    height: 100,
    borderRadius: 10,
  },

  overlay: {
    flex: 1,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    maxHeight: 100,
  },

  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },

  postCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    backgroundColor: "#0002",
  },

  postActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 4,
  },

  postActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  composer: {
    padding: 10,
    borderTopWidth: 1,
  },
});
