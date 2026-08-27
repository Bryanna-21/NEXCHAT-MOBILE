import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";

export type Message = {
  peer: string;
  text: string;
  status: string;
  createdAt?: string;
};

export type Story = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
};

export type FeedPost = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes: number;
  liked: boolean;
};

type PersistedState = {
  messages: Message[];
  stories: Story[];
  feed: FeedPost[];
};

type State = PersistedState & {
  vaultBytes: number;
};

const starterFeed: FeedPost[] = [
  {
    id: "welcome",
    author: "NexChat",
    text: "Welcome to NexChat. Public discovery is separated from private conversations.",
    createdAt: new Date().toISOString(),
    likes: 0,
    liked: false
  },
  {
    id: "privacy",
    author: "NexChat",
    text: "Private messages belong in Chats. Feed content is a separate public surface.",
    createdAt: new Date().toISOString(),
    likes: 0,
    liked: false
  }
];

let state: State = {
  messages: [],
  stories: [],
  feed: starterFeed,
  vaultBytes: 0
};

const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

async function persist(next: PersistedState) {
  await saveVault(next);

  state = {
    ...next,
    vaultBytes: JSON.stringify(next).length
  };

  emit();
}

function removeExpiredStories(stories: Story[]) {
  const now = Date.now();

  return stories.filter(
    story => new Date(story.expiresAt).getTime() > now
  );
}

export const useNexChatStore = () => {
  const snap = useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state
  );

  return {
    ...snap,

    hydrate: async () => {
      const data = await readVault<Partial<PersistedState>>();

      const stories = removeExpiredStories(data?.stories || []);

      const messages = data?.messages || [];

      const feed =
        data?.feed && data.feed.length > 0
          ? data.feed
          : starterFeed;

      state = {
        messages,
        stories,
        feed,
        vaultBytes: JSON.stringify({
          messages,
          stories,
          feed
        }).length
      };

      emit();
    },

    addMessage: async (message: Message) => {
      await persist({
        messages: [
          ...state.messages,
          {
            ...message,
            createdAt: new Date().toISOString()
          }
        ],
        stories: state.stories,
        feed: state.feed
      });
    },

    addStory: async (author: string, text: string) => {
      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const story: Story = {
        id: `${Date.now()}-${Math.random()}`,
        author,
        text,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        viewed: false
      };

      await persist({
        messages: state.messages,
        stories: [story, ...removeExpiredStories(state.stories)],
        feed: state.feed
      });
    },

    viewStory: async (id: string) => {
      const stories = state.stories.map(story =>
        story.id === id
          ? { ...story, viewed: true }
          : story
      );

      await persist({
        messages: state.messages,
        stories,
        feed: state.feed
      });
    },

    addFeedPost: async (author: string, text: string) => {
      const post: FeedPost = {
        id: `${Date.now()}-${Math.random()}`,
        author,
        text,
        createdAt: new Date().toISOString(),
        likes: 0,
        liked: false
      };

      await persist({
        messages: state.messages,
        stories: state.stories,
        feed: [post, ...state.feed]
      });
    },

    toggleLike: async (id: string) => {
      const feed = state.feed.map(post => {
        if (post.id !== id) return post;

        return {
          ...post,
          liked: !post.liked,
          likes: post.liked
            ? Math.max(0, post.likes - 1)
            : post.likes + 1
        };
      });

      await persist({
        messages: state.messages,
        stories: state.stories,
        feed
      });
    },

    reset: async () => {
      await clearVault();

      state = {
        messages: [],
        stories: [],
        feed: starterFeed,
        vaultBytes: 0
      };

      emit();
    }
  };
};
