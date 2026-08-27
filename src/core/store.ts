import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";

export type Message = {
  id?: string;
  peer: string;
  text: string;
  status: string;
  createdAt?: string;
  attachmentUri?: string;
  attachmentType?: "image" | "video";
};

export type Story = {
  id: string;
  authorId: string;
  caption?: string;
  mediaUri: string;
  mediaType: "image" | "video";
  createdAt: string;
  expiresAt: string;
  seen?: boolean;
};

export type FeedPost = {
  id: string;
  authorId: string;
  caption?: string;
  mediaUris: string[];
  mediaTypes: ("image" | "video")[];
  createdAt: string;
  likes: number;
  comments: number;
};

export type NexContact = {
  id: string;
  displayName: string;
  avatarUri?: string;
  online?: boolean;
};

type State = {
  messages: Message[];
  stories: Story[];
  feed: FeedPost[];
  contacts: NexContact[];
  vaultBytes: number;
};

const initialContacts: NexContact[] = [
  { id: "N-4827-9153-64", displayName: "NexChat Demo", online: true },
];

let state: State = {
  messages: [],
  stories: [],
  feed: [],
  contacts: initialContacts,
  vaultBytes: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

async function persist(next: Partial<State>) {
  state = { ...state, ...next };

  await saveVault({
    messages: state.messages,
    stories: state.stories,
    feed: state.feed,
  });

  state = {
    ...state,
    vaultBytes: JSON.stringify({
      messages: state.messages,
      stories: state.stories,
      feed: state.feed,
    }).length,
  };

  emit();
}

export const useNexChatStore = () => {
  const snap = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state
  );

  return {
    ...snap,

    hydrate: async () => {
      const data = await readVault<{
        messages?: Message[];
        stories?: Story[];
        feed?: FeedPost[];
      }>();

      state = {
        ...state,
        messages: data?.messages || [],
        stories: data?.stories || [],
        feed: data?.feed || [],
        vaultBytes: JSON.stringify(data || {}).length,
      };

      emit();
    },

    addMessage: async (message: Message) =>
      persist({
        messages: [
          ...state.messages,
          {
            ...message,
            id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: message.createdAt || new Date().toISOString(),
          },
        ],
      }),

    addStory: async (story: Omit<Story, "id" | "createdAt" | "expiresAt">) => {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

      await persist({
        stories: [
          ...state.stories,
          {
            ...story,
            id: `story-${Date.now()}`,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        ],
      });
    },

    removeStory: async (id: string) =>
      persist({
        stories: state.stories.filter((story) => story.id !== id),
      }),

    addFeedPost: async (
      post: Omit<FeedPost, "id" | "createdAt" | "likes" | "comments">
    ) =>
      persist({
        feed: [
          {
            ...post,
            id: `post-${Date.now()}`,
            createdAt: new Date().toISOString(),
            likes: 0,
            comments: 0,
          },
          ...state.feed,
        ],
      }),

    likeFeedPost: async (id: string) =>
      persist({
        feed: state.feed.map((post) =>
          post.id === id ? { ...post, likes: post.likes + 1 } : post
        ),
      }),

    reset: async () => {
      await clearVault();

      state = {
        messages: [],
        stories: [],
        feed: [],
        contacts: initialContacts,
        vaultBytes: 0,
      };

      emit();
    },
  };
};
