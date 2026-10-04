import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addFeedComment,
  FeedComment,
  FeedPost,
  getFeedComments,
  toggleFeedCommentLike,
  toggleFeedCommentReaction,
  toggleFeedLike,
  toggleFeedPostReshare,
  setFeedPostHidden,
} from "../core/feed";
import { FeedMedia, FeedTheme } from "./FeedScreen";
import { FeedCreator } from "../core/feed";

type Props = {
  post: FeedPost;
  theme: FeedTheme;
  userId: string;
  creator: FeedCreator;
  onClose: () => void;
  onPostUpdated?: (post: FeedPost) => void;
  isHidden?: boolean;
  onPostUnhidden?: (postId: string) => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function getPostMedia(post: FeedPost) {
  return post.attachments?.length
    ? post.attachments
    : post.attachment
      ? [post.attachment]
      : [];
}

export default function MyPostViewer({
  post,
  theme,
  userId,
  onClose,
  onPostUpdated,
  isHidden = false,
  onPostUnhidden,
}: Props) {
  const [currentPost, setCurrentPost] = useState(post);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrentPost(post);
  }, [post]);

  useEffect(() => {
    let mounted = true;

    setLoadingComments(true);

    getFeedComments(currentPost.id)
      .then(result => {
        if (mounted) setComments(result);
      })
      .finally(() => {
        if (mounted) setLoadingComments(false);
      });

    return () => {
      mounted = false;
    };
  }, [currentPost.id]);

  const media = useMemo(
    () => getPostMedia(currentPost),
    [currentPost],
  );

  const liked = currentPost.likedBy?.includes(userId) ?? false;
  const reshared = currentPost.resharedBy?.includes(userId) ?? false;
  const isOwner = currentPost.creator.id === userId;

  const updatePost = (updated: FeedPost | null) => {
    if (!updated) return;
    setCurrentPost(updated);
    onPostUpdated?.(updated);
  };

  const handleLike = async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await toggleFeedLike(currentPost.id, userId);
      updatePost(result.post);
    } finally {
      setBusy(false);
    }
  };

  const handleReshare = async () => {
    if (busy || currentPost.allowReshare === false) return;

    setBusy(true);
    try {
      const updated = await toggleFeedPostReshare(
        currentPost.id,
        userId,
      );
      updatePost(updated);
    } finally {
      setBusy(false);
    }
  };

  const handleUnhide = async () => {
    if (busy || !isHidden) return;

    setBusy(true);

    try {
      await setFeedPostHidden(currentPost.id, false);
      onPostUnhidden?.(currentPost.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async () => {
    const text = commentText.trim();
    if (!text || submittingComment) return;

    setSubmittingComment(true);

    try {
      const comment = await addFeedComment({
        postId: currentPost.id,
        author: currentPost.creator,
        text,
      });

      if (comment) {
        setComments(previous => [...previous, comment]);
        setCommentText("");
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (comment: FeedComment) => {
    const updated = await toggleFeedCommentLike(
      comment.id,
      userId,
    );

    if (!updated) return;

    setComments(previous =>
      previous.map(item =>
        item.id === updated.id ? updated : item,
      ),
    );
  };

  const handleCommentReaction = async (
    comment: FeedComment,
    reaction: string,
  ) => {
    const updated = await toggleFeedCommentReaction(
      comment.id,
      userId,
      reaction,
    );

    if (!updated) return;

    setComments(previous =>
      previous.map(item =>
        item.id === updated.id ? updated : item,
      ),
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bg },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.line,
            backgroundColor: theme.card,
          },
        ]}
      >
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[styles.back, { color: theme.ink }]}>
            ‹
          </Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: theme.ink }]}
          >
            {currentPost.creator.name}
          </Text>

          <Text
            numberOfLines={1}
            style={[styles.headerSubtitle, { color: theme.muted }]}
          >
            {formatDate(currentPost.createdAt)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {media.map((attachment, index) => (
          <View
            key={`${currentPost.id}-${index}`}
            style={styles.media}
          >
            <FeedMedia
              attachment={attachment}
              theme={theme}
              isActive
            />
          </View>
        ))}

        <View style={styles.details}>
          {!!currentPost.text && (
            <Text
              style={[styles.postText, { color: theme.ink }]}
            >
              {currentPost.text}
            </Text>
          )}

          <View style={styles.stats}>
            <Text style={[styles.stat, { color: theme.muted }]}>
              ♥ {currentPost.likedBy?.length ?? 0} likes
            </Text>

            <Text style={[styles.stat, { color: theme.muted }]}>
              💬 {currentPost.commentCount ?? comments.length} comments
            </Text>

            <Text style={[styles.stat, { color: theme.muted }]}>
              ↗ {currentPost.resharedBy?.length ?? 0} reshares
            </Text>

            {isOwner && (
              <Text style={[styles.stat, { color: theme.muted }]}>
                ◉ {currentPost.viewCount ?? 0} views
              </Text>
            )}
          </View>

          {isHidden && (
            <Pressable
              style={[
                styles.unhideButton,
                {
                  backgroundColor: theme.brand,
                },
              ]}
              onPress={handleUnhide}
              disabled={busy}
            >
              <Text style={styles.unhideText}>
                {busy ? "Unhiding…" : "Unhide post"}
              </Text>
            </Pressable>
          )}

          <View
            style={[
              styles.actions,
              {
                borderTopColor: theme.line,
                borderBottomColor: theme.line,
              },
            ]}
          >
            <Pressable
              style={styles.action}
              onPress={handleLike}
              disabled={busy}
            >
              <Text
                style={[
                  styles.actionText,
                  {
                    color: liked ? theme.brand : theme.ink,
                  },
                ]}
              >
                {liked ? "♥ Liked" : "♡ Like"}
              </Text>
            </Pressable>

            {currentPost.allowReshare !== false && (
              <Pressable
                style={styles.action}
                onPress={handleReshare}
                disabled={busy}
              >
                <Text
                  style={[
                    styles.actionText,
                    {
                      color: reshared
                        ? theme.brand
                        : theme.ink,
                    },
                  ]}
                >
                  {reshared ? "↗ Reshared" : "↗ Reshare"}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.commentsHeader}>
            <Text
              style={[styles.commentsTitle, { color: theme.ink }]}
            >
              Comments
            </Text>
          </View>

          {loadingComments ? (
            <ActivityIndicator color={theme.brand} />
          ) : comments.length === 0 ? (
            <Text
              style={[styles.empty, { color: theme.muted }]}
            >
              No comments yet.
            </Text>
          ) : (
            comments.map(comment => (
              <View
                key={comment.id}
                style={[
                  styles.comment,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.commentAuthor,
                    { color: theme.ink },
                  ]}
                >
                  {comment.author.name || comment.author.id}
                </Text>

                <Text
                  style={[
                    styles.commentText,
                    { color: theme.ink },
                  ]}
                >
                  {comment.text}
                </Text>

                <View style={styles.commentActions}>
                  <Pressable
                    onPress={() => handleCommentLike(comment)}
                  >
                    <Text style={{ color: theme.muted }}>
                      ♥ {comment.likedBy?.length ?? 0}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      handleCommentReaction(comment, "love")
                    }
                  >
                    <Text style={{ color: theme.muted }}>
                      Love
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      handleCommentReaction(comment, "laugh")
                    }
                  >
                    <Text style={{ color: theme.muted }}>
                      Laugh
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.commentComposer,
          {
            backgroundColor: theme.card,
            borderTopColor: theme.line,
          },
        ]}
      >
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Write a comment..."
          placeholderTextColor={theme.muted}
          style={[
            styles.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
          multiline
        />

        <Pressable
          onPress={handleComment}
          disabled={submittingComment || !commentText.trim()}
          style={[
            styles.send,
            {
              backgroundColor: commentText.trim()
                ? theme.brand
                : theme.line,
            },
          ]}
        >
          <Text style={styles.sendText}>
            {submittingComment ? "…" : "Send"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  back: {
    fontSize: 38,
    lineHeight: 40,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    paddingBottom: 24,
  },
  media: {
    width: "100%",
    backgroundColor: "#000",
    marginBottom: 1,
  },
  details: {
    padding: 16,
  },
  postText: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 14,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 14,
  },
  stat: {
    fontSize: 13,
  },
  unhideButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    marginBottom: 10,
    borderRadius: 10,
  },
  unhideText: {
    color: "#fff",
    fontWeight: "900",
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  action: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  actionText: {
    fontWeight: "800",
  },
  commentsHeader: {
    paddingTop: 18,
    paddingBottom: 10,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  empty: {
    paddingVertical: 12,
  },
  comment: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  commentAuthor: {
    fontWeight: "800",
    marginBottom: 5,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
  },
  commentComposer: {
    borderTopWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  send: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 12,
    justifyContent: "center",
  },
  sendText: {
    color: "#fff",
    fontWeight: "800",
  },
});
