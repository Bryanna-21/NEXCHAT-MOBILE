import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeedPostType = "text" | "media" | "file" | "link";

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
};

export type FeedPost = {
  id: string;
  type: FeedPostType;
  creator: FeedCreator;
  text: string;
  linkUrl?: string;
  attachment?: FeedAttachment;
  createdAt: string;
};

const STORAGE_KEY = "@nexchat/feed/posts/v1";

function createId(): string {
  return `feed_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadFeedPosts(): Promise<FeedPost[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(Boolean)
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

export async function createFeedPost(input: {
  type: FeedPostType;
  creator: FeedCreator;
  text?: string;
  linkUrl?: string;
  attachment?: FeedAttachment;
}): Promise<FeedPost> {
  const existing = await loadFeedPosts();

  const post: FeedPost = {
    id: createId(),
    type: input.type,
    creator: input.creator,
    text: input.text?.trim() ?? "",
    linkUrl: input.linkUrl?.trim() || undefined,
    attachment: input.attachment,
    createdAt: new Date().toISOString(),
  };

  await saveFeedPosts([post, ...existing]);

  return post;
}

export async function deleteFeedPost(id: string): Promise<void> {
  const existing = await loadFeedPosts();
  await saveFeedPosts(existing.filter((post) => post.id !== id));
}
