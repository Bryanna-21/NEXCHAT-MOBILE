import AsyncStorage from "@react-native-async-storage/async-storage";

export type Channel = {
  id: string;
  name: string;
  description?: string;
  avatarUri?: string;
  ownerId: string;
  adminIds: string[];
  createdAt: string;
  subscriberIds: string[];
};

export type ChannelPostType = "text" | "image" | "video";

export type ChannelPost = {
  id: string;
  channelId: string;
  authorId: string;
  type: ChannelPostType;
  text?: string;
  uri?: string;
  createdAt: string;
  likedBy?: string[];
};

export type ChannelComment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: string;
};

const COMMENTS_KEY = "nexchat.channel_comments.v1";
const CHANNELS_KEY = "nexchat.channels.v1";
const POSTS_KEY = "nexchat.channel_posts.v1";

export const DEFAULT_CHANNEL_ID = "nexchat-official";
export const DEFAULT_CHANNEL_OWNER_ID = "nexchat-official-owner";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getChannels(): Promise<Channel[]> {
  const raw = await AsyncStorage.getItem(CHANNELS_KEY);

  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NexChat channel data is corrupted.");
  }

  /*
   * Normalize every stored channel to the current shape.
   *
   * adminIds was added to the Channel type after some channels
   * (including the seeded default "NEXCHAT" channel) had already
   * been created and persisted without it. Without this
   * normalization, any code that assumes adminIds always exists
   * (e.g. channel.adminIds.includes(...)) throws on that older
   * data — this is the single place that guarantees every caller
   * always gets a complete, current-shape Channel.
   */
  return (parsed as Channel[]).map((c) => ({
    ...c,
    subscriberIds: c.subscriberIds ?? [],
    adminIds: c.adminIds ?? [],
  }));
}

async function saveChannels(channels: Channel[]): Promise<void> {
  await AsyncStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
}

/**
 * Ensure the default "NEXCHAT" channel exists and that the
 * current user is subscribed to it. Safe to call on every app
 * launch — it's a no-op once the channel already exists and the
 * user is already a subscriber.
 */
export async function ensureDefaultChannel(myId: string): Promise<void> {
  const channels = await getChannels();
  const existing = channels.find((c) => c.id === DEFAULT_CHANNEL_ID);

  if (!existing) {
    const seeded: Channel = {
      id: DEFAULT_CHANNEL_ID,
      name: "NEXCHAT",
      description: "Official NexChat updates and announcements",
      ownerId: DEFAULT_CHANNEL_OWNER_ID,
      adminIds: [],
      createdAt: new Date().toISOString(),
      subscriberIds: [myId],
    };

    await saveChannels([seeded, ...channels]);
    return;
  }

  if (!existing.subscriberIds.includes(myId)) {
    await saveChannels(
      channels.map((c) =>
        c.id === DEFAULT_CHANNEL_ID
          ? { ...c, subscriberIds: [...c.subscriberIds, myId] }
          : c
      )
    );
  }
}

export async function createChannel(
  name: string,
  ownerId: string,
  description?: string,
  avatarUri?: string
): Promise<Channel> {
  const cleaned = name.trim();

  if (!cleaned) {
    throw new Error("Channel name cannot be empty.");
  }

  const channel: Channel = {
    id: createId("channel"),
    name: cleaned,
    description: description?.trim() || undefined,
    avatarUri,
    ownerId,
    adminIds: [],
    createdAt: new Date().toISOString(),
    subscriberIds: [ownerId],
  };

  const channels = await getChannels();
  await saveChannels([channel, ...channels]);

  return channel;
}

/**
 * Update a channel's editable profile fields (name, description,
 * avatar). Membership and roles are managed by their own
 * dedicated functions below, not through this generic update.
 */
export async function updateChannel(
  channelId: string,
  patch: Partial<Pick<Channel, "name" | "description" | "avatarUri">>
): Promise<void> {
  const channels = await getChannels();

  await saveChannels(
    channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c))
  );
}

export async function setChannelAdmin(
  channelId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const channels = await getChannels();

  await saveChannels(
    channels.map((c) => {
      if (c.id !== channelId) return c;

      const adminIds = isAdmin
        ? Array.from(new Set([...c.adminIds, userId]))
        : c.adminIds.filter((id) => id !== userId);

      return { ...c, adminIds };
    })
  );
}

export async function subscribeToChannel(
  channelId: string,
  userId: string
): Promise<void> {
  const channels = await getChannels();

  await saveChannels(
    channels.map((c) =>
      c.id === channelId && !c.subscriberIds.includes(userId)
        ? { ...c, subscriberIds: [...c.subscriberIds, userId] }
        : c
    )
  );
}

export async function unsubscribeFromChannel(
  channelId: string,
  userId: string
): Promise<void> {
  const channels = await getChannels();

  await saveChannels(
    channels.map((c) =>
      c.id === channelId
        ? {
            ...c,
            subscriberIds: c.subscriberIds.filter((id) => id !== userId),
          }
        : c
    )
  );
}

export async function getAllPosts(): Promise<ChannelPost[]> {
  const raw = await AsyncStorage.getItem(POSTS_KEY);

  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NexChat channel post data is corrupted.");
  }

  return (parsed as ChannelPost[]).map((p) => ({
    ...p,
    likedBy: p.likedBy ?? [],
  }));
}

async function savePosts(posts: ChannelPost[]): Promise<void> {
  await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

export async function getPostsForChannel(
  channelId: string
): Promise<ChannelPost[]> {
  const posts = await getAllPosts();

  return posts
    .filter((p) => p.channelId === channelId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function addChannelPost(
  channelId: string,
  authorId: string,
  data: Omit<ChannelPost, "id" | "channelId" | "authorId" | "createdAt">
): Promise<ChannelPost> {
  const post: ChannelPost = {
    id: createId("chpost"),
    channelId,
    authorId,
    createdAt: new Date().toISOString(),
    ...data,
  };

  const posts = await getAllPosts();
  await savePosts([post, ...posts]);

  return post;
}

export async function getLatestPostForChannel(
  channelId: string
): Promise<ChannelPost | null> {
  const posts = await getPostsForChannel(channelId);
  return posts[0] ?? null;
}

/**
 * Delete a single channel post. Callers are responsible for
 * checking that the requesting user is allowed to delete it
 * (the author, or a channel admin/owner) before calling this —
 * this function itself just performs the deletion.
 */
export async function deleteChannelPost(postId: string): Promise<void> {
  const posts = await getAllPosts();
  await savePosts(posts.filter((p) => p.id !== postId));

  const comments = await getAllComments();
  await saveComments(comments.filter((c) => c.postId !== postId));
}

export async function toggleLikePost(
  postId: string,
  userId: string
): Promise<void> {
  const posts = await getAllPosts();

  await savePosts(
    posts.map((p) => {
      if (p.id !== postId) return p;

      const likedBy = p.likedBy ?? [];
      const liked = likedBy.includes(userId);

      return {
        ...p,
        likedBy: liked
          ? likedBy.filter((id) => id !== userId)
          : [...likedBy, userId],
      };
    })
  );
}

export async function getAllComments(): Promise<ChannelComment[]> {
  const raw = await AsyncStorage.getItem(COMMENTS_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ChannelComment[];
  } catch {
    throw new Error("NexChat channel comment data is corrupted.");
  }
}

async function saveComments(comments: ChannelComment[]): Promise<void> {
  await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
}

export async function getCommentsForPost(
  postId: string
): Promise<ChannelComment[]> {
  const comments = await getAllComments();

  return comments
    .filter((c) => c.postId === postId)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export async function addComment(
  postId: string,
  authorId: string,
  text: string
): Promise<ChannelComment> {
  const cleaned = text.trim();

  if (!cleaned) {
    throw new Error("Comment cannot be empty.");
  }

  const comment: ChannelComment = {
    id: createId("comment"),
    postId,
    authorId,
    text: cleaned,
    createdAt: new Date().toISOString(),
  };

  const comments = await getAllComments();
  await saveComments([...comments, comment]);

  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const comments = await getAllComments();
  await saveComments(comments.filter((c) => c.id !== commentId));
}
