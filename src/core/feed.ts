import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeedPostType = "text" | "media" | "file" | "link";

export type FeedMediaKind = "image" | "video" | "audio" | "file";

export type FeedCreator = {
  id: string;
  name: string;
  username?: string;
  avatarUri?: string;
};

export type FeedAttachment = {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  kind?: FeedMediaKind;
  durationMs?: number;
};

export type FeedComment = {
  id: string;
  postId: string;
  author: FeedCreator;
  text: string;
  createdAt: string;
};

export type FeedPost = {
  id: string;
  type: FeedPostType;
  creator: FeedCreator;
  text: string;
  linkUrl?: string;

  /**
   * Primary attachment kept for backward compatibility.
   */
  attachment?: FeedAttachment;

  /**
   * Additional media/files attached to the post.
   */
  attachments?: FeedAttachment[];

  /**
   * Optional music/audio attached to the post.
   * This is played as an audio attachment; it is not falsely
   * treated as permanently mixed into a video.
   */
  music?: FeedAttachment;

  /**
   * IDs of users who currently like this post.
   */
  likedBy?: string[];

  /**
   * Number of successful native share actions.
   */
  shareCount?: number;

  /**
   * Cached comment count. The actual comments are stored separately.
   */
  commentCount?: number;

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
          : attachment.mimeType?.startsWith("audio/")
            ? "audio"
            : "file"),
    durationMs: attachment.durationMs,
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
    shareCount:
      typeof raw.shareCount === "number" && raw.shareCount >= 0
        ? raw.shareCount
        : 0,
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

async function loadComments(): Promise<FeedComment[]> {
  try {
    const raw = await AsyncStorage.getItem(COMMENTS_STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
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
  attachment?: FeedAttachment;
  attachments?: FeedAttachment[];
  music?: FeedAttachment;
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

  const post: FeedPost = {
    id: createId("feed"),
    type: input.type,
    creator: input.creator,
    text: input.text?.trim() ?? "",
    linkUrl: input.linkUrl?.trim() || undefined,
    attachment: allAttachments[0],
    attachments: allAttachments,
    music: normalizeAttachment(input.music),
    likedBy: [],
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
    attachment?: FeedAttachment;
    attachments?: FeedAttachment[];
    music?: FeedAttachment;
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

  const nextPost: FeedPost = {
    ...current,
    type: patch.type ?? current.type,
    text:
      patch.text !== undefined
        ? patch.text.trim()
        : current.text,
    linkUrl:
      patch.linkUrl !== undefined
        ? patch.linkUrl.trim() || undefined
        : current.linkUrl,
    attachment: nextPrimary,
    attachments: nextAttachments,
    music:
      patch.music !== undefined
        ? normalizeAttachment(patch.music)
        : current.music,
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
