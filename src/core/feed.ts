import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeedPostType = "text" | "media" | "file" | "link";

export type FeedPostAudience =
  | "everyone"
  | "connections"
  | "only_me";

export type FeedPostReaction =
  | "like"
  | "love"
  | "laugh"
  | "wow"
  | "sad"
  | "angry";

export type FeedMediaKind = "image" | "video" | "file" | "tiktok";

export type FeedCreator = {
  id: string;
  name: string;
  username?: string;
  avatarUri?: string;
  bio?: string;
  website?: string;
  location?: string;
  pronouns?: string;
  joinedAt?: string;
};

export type FeedAttachment = {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  kind?: FeedMediaKind;
  overlayText?: string;
  overlayX?: number;
  overlayY?: number;
  provider?: string;
  videoId?: string;

};

export type FeedComment = {
  id: string;
  postId: string;
  author: FeedCreator;
  text: string;
  createdAt: string;

  /**
   * Parent comment ID for nested replies.
   * Undefined means this is a top-level comment.
   */
  parentId?: string;

  /**
   * IDs of users who currently like this comment.
   */
  likedBy?: string[];

  /**
   * Reaction counts keyed by emoji.
   */
  reactions?: Record<string, number>;
};

export type FeedPost = {
  id: string;
  type: FeedPostType;
  creator: FeedCreator;
  text: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUri?: string;
  linkProvider?: string;

  /**
   * Primary attachment kept for backward compatibility.
   */
  attachment?: FeedAttachment;

  /**
   * Additional media/files attached to the post.
   */
  attachments?: FeedAttachment[];

  /**
   * IDs of users who currently like this post.
   */
  likedBy?: string[];

  /**
   * Counts for non-like post reactions.
   */
  reactions?: Record<string, number>;

  /**
   * Whether other users may download this post's content.
   * Defaults to true for backward compatibility.
   */
  allowDownloads?: boolean;

  /**
   * Number of feed views.
   */
  viewCount?: number;

  /**
   * Number of successful native share actions.
   */
  shareCount?: number;

  /**
   * Whether other users may reshare this post.
   */
  allowReshare?: boolean;

  /**
   * IDs of users who have reshared this post.
   */
  resharedBy?: string[];

  /**
   * Cached comment count. The actual comments are stored separately.
   */
  commentCount?: number;

  /**
   * Post management state.
   */
  pinned?: boolean;
  notificationsEnabled?: boolean;
  archived?: boolean;
  audience?: FeedPostAudience;

  createdAt: string;
  updatedAt?: string;
};

const STORAGE_KEY = "@nexchat/feed/posts/v2";
const COMMENTS_STORAGE_KEY = "@nexchat/feed/comments/v1";

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAttachment(
  attachment?: FeedAttachment,
): FeedAttachment | undefined {
  if (!attachment?.uri) return undefined;

  return {
    uri: attachment.uri,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind:
      attachment.kind ??
      (attachment.mimeType?.startsWith("image/")
        ? "image"
        : attachment.mimeType?.startsWith("video/")
          ? "video"
          : "file"),
    overlayText: attachment.overlayText?.trim() || undefined,
    overlayX:
      typeof attachment.overlayX === "number"
        ? Math.max(0.08, Math.min(0.92, attachment.overlayX))
        : undefined,
    overlayY:
      typeof attachment.overlayY === "number"
        ? Math.max(0.08, Math.min(0.92, attachment.overlayY))
        : undefined,
    provider: attachment.provider,
    videoId: attachment.videoId,
  };
}

function normalizePost(raw: FeedPost): FeedPost {
  const primary = normalizeAttachment(raw.attachment);

  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .map(normalizeAttachment)
        .filter(Boolean) as FeedAttachment[]
    : primary
      ? [primary]
      : [];

  return {
    ...raw,
    text: typeof raw.text === "string" ? raw.text : "",
    attachment: primary,
    attachments,
    likedBy: Array.isArray(raw.likedBy) ? raw.likedBy : [],
    reactions: (() => {
      const normalized =
        raw.reactions &&
        typeof raw.reactions === "object" &&
        !Array.isArray(raw.reactions)
          ? Object.fromEntries(
              Object.entries(raw.reactions).filter(
                ([emoji, count]) =>
                  typeof emoji === "string" &&
                  typeof count === "number" &&
                  count > 0,
              ),
            )
          : {};

      const legacyLikeCount = Array.isArray(raw.likedBy)
        ? raw.likedBy.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          ).length
        : 0;

      if (
        legacyLikeCount > 0 &&
        (!normalized.like ||
          typeof normalized.like !== "number" ||
          normalized.like < legacyLikeCount)
      ) {
        return {
          ...normalized,
          like: legacyLikeCount,
        };
      }

      return normalized;
    })(),
    allowDownloads: raw.allowDownloads !== false,
    viewCount:
      typeof raw.viewCount === "number" && raw.viewCount >= 0
        ? raw.viewCount
        : 0,
    shareCount:
      typeof raw.shareCount === "number" && raw.shareCount >= 0
        ? raw.shareCount
        : 0,
    allowReshare: raw.allowReshare !== false,
    resharedBy: Array.isArray(raw.resharedBy) ? raw.resharedBy : [],
    commentCount:
      typeof raw.commentCount === "number" && raw.commentCount >= 0
        ? raw.commentCount
        : 0,
    updatedAt: raw.updatedAt,
  };
}

export async function loadFeedPosts(): Promise<FeedPost[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);

    if (!raw) {
      // Read the old storage key once so existing posts are not lost.
      const legacyRaw = await AsyncStorage.getItem(
        "@nexchat/feed/posts/v1",
      );

      if (!legacyRaw) return [];

      const legacyParsed = JSON.parse(legacyRaw);

      if (!Array.isArray(legacyParsed)) return [];

      const migrated = legacyParsed
        .filter(Boolean)
        .map((post: FeedPost) => normalizePost(post))
        .sort(
          (a: FeedPost, b: FeedPost) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );

      await saveFeedPosts(migrated);

      return migrated;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(Boolean)
      .map((post: FeedPost) => normalizePost(post))
      .sort(
        (a: FeedPost, b: FeedPost) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      );
  } catch {
    return [];
  }
}

async function saveFeedPosts(posts: FeedPost[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

export async function incrementFeedPostView(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index < 0) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    viewCount: (posts[index].viewCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  posts[index] = updatedPost;
  await saveFeedPosts(posts);

  return updatedPost;
}

export async function setFeedPostReshareAllowed(
  postId: string,
  allowed: boolean,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index < 0) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    allowReshare: allowed,
    updatedAt: new Date().toISOString(),
  };

  posts[index] = updatedPost;
  await saveFeedPosts(posts);

  return updatedPost;
}

export async function toggleFeedPostReshare(
  postId: string,
  userId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index < 0) return null;

  const post = posts[index];

  if (post.allowReshare === false) {
    return post;
  }

  const resharedBy = new Set(post.resharedBy ?? []);

  if (resharedBy.has(userId)) {
    resharedBy.delete(userId);
  } else {
    resharedBy.add(userId);
  }

  const updatedPost: FeedPost = {
    ...post,
    resharedBy: Array.from(resharedBy),
    updatedAt: new Date().toISOString(),
  };

  posts[index] = updatedPost;
  await saveFeedPosts(posts);

  return updatedPost;
}

async function loadComments(): Promise<FeedComment[]> {
  try {
    const raw = await AsyncStorage.getItem(COMMENTS_STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(Boolean)
      .map((comment: FeedComment) => ({
        ...comment,
        text: typeof comment.text === "string" ? comment.text : "",
        likedBy: Array.isArray(comment.likedBy)
          ? comment.likedBy.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : [],
        reactions:
          comment.reactions &&
          typeof comment.reactions === "object" &&
          !Array.isArray(comment.reactions)
            ? Object.fromEntries(
                Object.entries(comment.reactions).filter(
                  ([emoji, count]) =>
                    typeof emoji === "string" &&
                    typeof count === "number" &&
                    count > 0,
                ),
              )
            : {},
      }));
  } catch {
    return [];
  }
}

async function saveComments(comments: FeedComment[]): Promise<void> {
  await AsyncStorage.setItem(
    COMMENTS_STORAGE_KEY,
    JSON.stringify(comments),
  );
}

export async function createFeedPost(input: {
  type: FeedPostType;
  creator: FeedCreator;
  text?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUri?: string;
  linkProvider?: string;
  attachment?: FeedAttachment;
  attachments?: FeedAttachment[];
}): Promise<FeedPost> {
  const existing = await loadFeedPosts();

  const primaryAttachment = normalizeAttachment(input.attachment);

  const additionalAttachments = (input.attachments ?? [])
    .map(normalizeAttachment)
    .filter(Boolean) as FeedAttachment[];

  const allAttachments = primaryAttachment
    ? [
        primaryAttachment,
        ...additionalAttachments.filter(
          (item) => item.uri !== primaryAttachment.uri,
        ),
      ]
    : additionalAttachments;

  const hasMedia =
    allAttachments.length > 0 &&
    (input.type === "media" || input.type === "file");

  const post: FeedPost = {
    id: createId("feed"),
    type: input.type,
    creator: input.creator,
    text: input.text?.trim() ?? "",
    linkUrl:
      hasMedia
        ? undefined
        : input.linkUrl?.trim() || undefined,
    linkTitle:
      hasMedia
        ? undefined
        : input.linkTitle?.trim() || undefined,
    linkDescription:
      hasMedia
        ? undefined
        : input.linkDescription?.trim() || undefined,
    linkImageUri:
      hasMedia
        ? undefined
        : input.linkImageUri?.trim() || undefined,
    linkProvider:
      hasMedia
        ? undefined
        : input.linkProvider?.trim() || undefined,
    attachment: allAttachments[0],
    attachments: allAttachments,
    audience: "everyone",
    likedBy: [],
    reactions: {},
    allowDownloads: true,
    shareCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
  };

  await saveFeedPosts([post, ...existing]);

  return post;
}

export async function updateFeedPost(
  id: string,
  patch: {
    type?: FeedPostType;
    text?: string;
    linkUrl?: string;
    linkTitle?: string;
    linkDescription?: string;
    linkImageUri?: string;
    linkProvider?: string;
    attachment?: FeedAttachment;
    attachments?: FeedAttachment[];
  },
): Promise<FeedPost | null> {
  const existing = await loadFeedPosts();
  const index = existing.findIndex((post) => post.id === id);

  if (index === -1) return null;

  const current = existing[index];

  const nextPrimary =
    patch.attachment !== undefined
      ? normalizeAttachment(patch.attachment)
      : current.attachment;

  const nextAttachments =
    patch.attachments !== undefined
      ? patch.attachments
          .map(normalizeAttachment)
          .filter(Boolean) as FeedAttachment[]
      : current.attachments ?? (nextPrimary ? [nextPrimary] : []);

  const nextType = patch.type ?? current.type;

  const hasMedia =
    nextAttachments.length > 0 &&
    (nextType === "media" || nextType === "file");

  const nextPost: FeedPost = {
    ...current,
    type: nextType,
    text:
      patch.text !== undefined
        ? patch.text.trim()
        : current.text,
    linkUrl:
      hasMedia
        ? undefined
        : patch.linkUrl !== undefined
          ? patch.linkUrl.trim() || undefined
          : current.linkUrl,
    linkTitle:
      hasMedia
        ? undefined
        : patch.linkTitle !== undefined
          ? patch.linkTitle.trim() || undefined
          : current.linkTitle,
    linkDescription:
      hasMedia
        ? undefined
        : patch.linkDescription !== undefined
          ? patch.linkDescription.trim() || undefined
          : current.linkDescription,
    linkImageUri:
      hasMedia
        ? undefined
        : patch.linkImageUri !== undefined
          ? patch.linkImageUri.trim() || undefined
          : current.linkImageUri,
    linkProvider:
      hasMedia
        ? undefined
        : patch.linkProvider !== undefined
          ? patch.linkProvider.trim() || undefined
          : current.linkProvider,
    attachment: nextPrimary,
    attachments: nextAttachments,
    updatedAt: new Date().toISOString(),
  };

  const updated = [...existing];
  updated[index] = nextPost;

  await saveFeedPosts(updated);

  return nextPost;
}

export async function deleteFeedPost(id: string): Promise<void> {
  const existing = await loadFeedPosts();

  await saveFeedPosts(existing.filter((post) => post.id !== id));

  const comments = await loadComments();

  await saveComments(
    comments.filter((comment) => comment.postId !== id),
  );
}

export async function toggleFeedPostPinned(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    pinned: !posts[index].pinned,
    updatedAt: new Date().toISOString(),
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function setFeedPostAudience(
  postId: string,
  audience: FeedPostAudience,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    audience,
    updatedAt: new Date().toISOString(),
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function toggleFeedPostNotifications(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    notificationsEnabled: !posts[index].notificationsEnabled,
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function toggleFeedPostDownloads(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    allowDownloads:
      posts[index].allowDownloads === false ? true : false,
    updatedAt: new Date().toISOString(),
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function archiveFeedPost(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    archived: true,
    updatedAt: new Date().toISOString(),
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function toggleFeedLike(
  postId: string,
  userId: string,
): Promise<{ liked: boolean; post: FeedPost | null }> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) {
    return { liked: false, post: null };
  }

  const post = posts[index];
  const likedBy = [...(post.likedBy ?? [])];
  const existingIndex = likedBy.indexOf(userId);

  let liked: boolean;

  if (existingIndex >= 0) {
    likedBy.splice(existingIndex, 1);
    liked = false;
  } else {
    likedBy.push(userId);
    liked = true;
  }

  const updatedPost: FeedPost = {
    ...post,
    likedBy,
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return {
    liked,
    post: updatedPost,
  };
}

export async function incrementFeedShare(
  postId: string,
): Promise<FeedPost | null> {
  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  const updatedPost: FeedPost = {
    ...posts[index],
    shareCount: (posts[index].shareCount ?? 0) + 1,
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function getFeedComments(
  postId: string,
): Promise<FeedComment[]> {
  const comments = await loadComments();

  return comments
    .filter((comment) => comment.postId === postId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime(),
    );
}

export async function addFeedComment(input: {
  postId: string;
  author: FeedCreator;
  text: string;
  parentId?: string;
}): Promise<FeedComment | null> {
  const text = input.text.trim();

  if (!text) return null;

  const posts = await loadFeedPosts();
  const postIndex = posts.findIndex(
    (post) => post.id === input.postId,
  );

  if (postIndex === -1) return null;

  const comments = await loadComments();

  const comment: FeedComment = {
    id: createId("comment"),
    postId: input.postId,
    author: input.author,
    text,
    createdAt: new Date().toISOString(),
    parentId: input.parentId,
    likedBy: [],
    reactions: {},
  };

  await saveComments([...comments, comment]);

  const updatedPost: FeedPost = {
    ...posts[postIndex],
    commentCount: (posts[postIndex].commentCount ?? 0) + 1,
  };

  const updatedPosts = [...posts];
  updatedPosts[postIndex] = updatedPost;

  await saveFeedPosts(updatedPosts);

  return comment;
}

export async function toggleFeedCommentLike(
  commentId: string,
  userId: string,
): Promise<FeedComment | null> {
  if (!commentId || !userId) return null;

  const comments = await loadComments();
  const index = comments.findIndex((comment) => comment.id === commentId);

  if (index === -1) return null;

  const current = new Set(comments[index].likedBy ?? []);

  if (current.has(userId)) {
    current.delete(userId);
  } else {
    current.add(userId);
  }

  const updatedComment: FeedComment = {
    ...comments[index],
    likedBy: Array.from(current),
  };

  const updated = [...comments];
  updated[index] = updatedComment;

  await saveComments(updated);

  return updatedComment;
}

const POST_REACTIONS_STORAGE_KEY =
  "@nexchat/feed/post-reactions/v1";

const FEED_HIDDEN_POSTS_STORAGE_KEY =
  "@nexchat/feed/hidden-posts/v1";

export async function getFeedPostReaction(
  postId: string,
  userId: string,
): Promise<FeedPostReaction | undefined> {
  if (!postId || !userId) return undefined;

  try {
    const raw = await AsyncStorage.getItem(
      POST_REACTIONS_STORAGE_KEY,
    );

    if (!raw) return undefined;

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const value = (parsed as Record<string, unknown>)[
      `${userId}:${postId}`
    ];

    if (
      value === "like" ||
      value === "love" ||
      value === "laugh" ||
      value === "wow" ||
      value === "sad" ||
      value === "angry"
    ) {
      return value;
    }

    const posts = await loadFeedPosts();
    const post = posts.find((item) => item.id === postId);

    if (post?.likedBy?.includes(userId)) {
      return "like";
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function toggleFeedPostReaction(
  postId: string,
  userId: string,
  reaction: FeedPostReaction,
): Promise<FeedPost | null> {
  if (!postId || !userId || !reaction) return null;

  const posts = await loadFeedPosts();
  const index = posts.findIndex((post) => post.id === postId);

  if (index === -1) return null;

  let userReactions: Record<string, string> = {};

  try {
    const raw = await AsyncStorage.getItem(
      POST_REACTIONS_STORAGE_KEY,
    );

    if (raw) {
      const parsed = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        userReactions = parsed as Record<string, string>;
      }
    }
  } catch {
    userReactions = {};
  }

  const userReactionKey = `${userId}:${postId}`;
  const storedReaction = userReactions[userReactionKey];

  const legacyLiked =
    posts[index].likedBy?.includes(userId) ?? false;

  const existingReaction =
    storedReaction ??
    (legacyLiked ? "like" : undefined);

  const nextCounts = {
    ...(posts[index].reactions ?? {}),
  };

  const nextLikedBy = [...(posts[index].likedBy ?? [])];
  const likedByIndex = nextLikedBy.indexOf(userId);

  if (existingReaction === reaction) {
    delete userReactions[userReactionKey];

    nextCounts[reaction] = Math.max(
      0,
      (nextCounts[reaction] ?? 0) - 1,
    );

    if (likedByIndex >= 0) {
      nextLikedBy.splice(likedByIndex, 1);
    }
  } else {
    if (existingReaction) {
      nextCounts[existingReaction] = Math.max(
        0,
        (nextCounts[existingReaction] ?? 0) - 1,
      );
    }

    nextCounts[reaction] =
      (nextCounts[reaction] ?? 0) + 1;

    userReactions[userReactionKey] = reaction;

    if (reaction === "like") {
      if (likedByIndex < 0) {
        nextLikedBy.push(userId);
      }
    } else if (likedByIndex >= 0) {
      nextLikedBy.splice(likedByIndex, 1);
    }
  }

  await AsyncStorage.setItem(
    POST_REACTIONS_STORAGE_KEY,
    JSON.stringify(userReactions),
  );

  const updatedPost: FeedPost = {
    ...posts[index],
    likedBy: nextLikedBy,
    reactions: Object.fromEntries(
      Object.entries(nextCounts).filter(
        ([, count]) =>
          typeof count === "number" && count > 0,
      ),
    ),
  };

  const updated = [...posts];
  updated[index] = updatedPost;

  await saveFeedPosts(updated);

  return updatedPost;
}

export async function loadHiddenFeedPostIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(
      FEED_HIDDEN_POSTS_STORAGE_KEY,
    );

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
  } catch {
    return [];
  }
}

export async function setFeedPostHidden(
  postId: string,
  hidden: boolean,
): Promise<string[]> {
  const current = await loadHiddenFeedPostIds();

  const next = new Set(current);

  if (hidden) {
    next.add(postId);
  } else {
    next.delete(postId);
  }

  const result = Array.from(next);

  await AsyncStorage.setItem(
    FEED_HIDDEN_POSTS_STORAGE_KEY,
    JSON.stringify(result),
  );

  return result;
}

export async function getFeedCommentReaction(
  commentId: string,
  userId: string,
): Promise<string | undefined> {
  if (!commentId || !userId) return undefined;

  const reactionsKey = `${COMMENTS_STORAGE_KEY}:reactions`;

  try {
    const raw = await AsyncStorage.getItem(reactionsKey);

    if (!raw) return undefined;

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const key = `${userId}:${commentId}`;
    const reaction = (parsed as Record<string, unknown>)[key];

    return typeof reaction === "string" && reaction.trim()
      ? reaction
      : undefined;
  } catch {
    return undefined;
  }
}

export async function toggleFeedCommentReaction(
  commentId: string,
  userId: string,
  emoji: string,
): Promise<FeedComment | null> {
  if (!commentId || !userId || !emoji.trim()) return null;

  const comments = await loadComments();
  const index = comments.findIndex((comment) => comment.id === commentId);

  if (index === -1) return null;

  const reactionsKey = `${COMMENTS_STORAGE_KEY}:reactions`;
  let userReactions: Record<string, string> = {};

  try {
    const rawUserReactions = await AsyncStorage.getItem(reactionsKey);

    if (rawUserReactions) {
      const parsed = JSON.parse(rawUserReactions);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        userReactions = parsed as Record<string, string>;
      }
    }
  } catch {
    userReactions = {};
  }

  const reactionUserKey = `${userId}:${commentId}`;
  const existingUserReaction = userReactions[reactionUserKey];

  const nextReactions = {
    ...(comments[index].reactions ?? {}),
  };

  if (existingUserReaction === emoji) {
    delete userReactions[reactionUserKey];

    nextReactions[emoji] = Math.max(
      0,
      (nextReactions[emoji] ?? 0) - 1,
    );
  } else {
    if (existingUserReaction) {
      nextReactions[existingUserReaction] = Math.max(
        0,
        (nextReactions[existingUserReaction] ?? 0) - 1,
      );
    }

    nextReactions[emoji] = (nextReactions[emoji] ?? 0) + 1;
    userReactions[reactionUserKey] = emoji;
  }

  await AsyncStorage.setItem(
    reactionsKey,
    JSON.stringify(userReactions),
  );

  const updatedComment: FeedComment = {
    ...comments[index],
    reactions: Object.fromEntries(
      Object.entries(nextReactions).filter(
        ([, count]) => typeof count === "number" && count > 0,
      ),
    ),
  };

  const updated = [...comments];
  updated[index] = updatedComment;

  await saveComments(updated);

  return updatedComment;
}

const FOLLOWS_STORAGE_KEY = "@nexchat/feed/follows/v1";

export type FeedFollowMap = Record<string, string[]>;

async function loadFeedFollowMap(): Promise<FeedFollowMap> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOWS_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalized: FeedFollowMap = {};

    for (const [userId, followedIds] of Object.entries(parsed)) {
      if (!Array.isArray(followedIds)) {
        continue;
      }

      normalized[userId] = Array.from(
        new Set(
          followedIds.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          ),
        ),
      );
    }

    return normalized;
  } catch {
    return {};
  }
}

async function saveFeedFollowMap(map: FeedFollowMap): Promise<void> {
  await AsyncStorage.setItem(
    FOLLOWS_STORAGE_KEY,
    JSON.stringify(map),
  );
}

export async function isFollowingFeedCreator(
  followerId: string,
  creatorId: string,
): Promise<boolean> {
  if (!followerId || !creatorId || followerId === creatorId) {
    return false;
  }

  const map = await loadFeedFollowMap();

  return (map[followerId] ?? []).includes(creatorId);
}

export async function getFeedFollowCounts(
  creatorId: string,
): Promise<{
  followers: number;
  following: number;
}> {
  if (!creatorId) {
    return {
      followers: 0,
      following: 0,
    };
  }

  const map = await loadFeedFollowMap();

  const following = (map[creatorId] ?? []).length;

  let followers = 0;

  for (const followedIds of Object.values(map)) {
    if (followedIds.includes(creatorId)) {
      followers += 1;
    }
  }

  return {
    followers,
    following,
  };
}

export async function toggleFeedFollow(
  followerId: string,
  creatorId: string,
): Promise<{
  following: boolean;
  followers: number;
  followingCount: number;
}> {
  if (!followerId || !creatorId || followerId === creatorId) {
    const counts = await getFeedFollowCounts(creatorId);

    return {
      following: false,
      followers: counts.followers,
      followingCount: counts.following,
    };
  }

  const map = await loadFeedFollowMap();
  const current = new Set(map[followerId] ?? []);

  if (current.has(creatorId)) {
    current.delete(creatorId);
  } else {
    current.add(creatorId);
  }

  map[followerId] = Array.from(current);

  await saveFeedFollowMap(map);

  const counts = await getFeedFollowCounts(creatorId);

  return {
    following: current.has(creatorId),
    followers: counts.followers,
    followingCount: counts.following,
  };
}
