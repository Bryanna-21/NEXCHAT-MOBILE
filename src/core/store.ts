import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";

export type MediaType = "image" | "video";

export type Attachment = {
  uri: string;
  type: MediaType;
  name?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
};

export type Message = {
  id: string;
  peer: string;
  text: string;
  status: string;
  createdAt: string;
  attachment?: Attachment;
};

export type Story = {
  id: string;
  authorId: string;
  caption: string;
  media?: Attachment;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
};

export type FeedPost = {
  id: string;
  authorId: string;
  caption: string;
  media?: Attachment[];
  createdAt: string;
  likes: number;
  liked: boolean;
};

export type NexContact = {
  id: string;
  displayName: string;
  avatarUri?: string;
  online?: boolean;
};

type PersistedState = {
  messages: Message[];
  stories: Story[];
  feed: FeedPost[];
};

type State = PersistedState & {
  contacts: NexContact[];
  vaultBytes: number;
};

const initialContacts: NexContact[] = [
  {
    id: "N-4827-9153-64",
    displayName: "NexChat Demo",
    online: true,
  },
];

let state: State = {
  messages: [],
  stories: [],
  feed: [],
  contacts: initialContacts,
  vaultBytes: 0,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function persist(next: Partial<PersistedState>) {
  state = { ...state, ...next };

  const payload: PersistedState = {
    messages: state.messages,
    stories: state.stories.filter(
      (story) => new Date(story.expiresAt).getTime() > Date.now()
    ),
    feed: state.feed,
  };

  await saveVault(payload);

  state = {
    ...state,
    ...payload,
    vaultBytes: JSON.stringify(payload).length,
  };

  emit();
}

export const useNexChatStore = () => {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state
  );

  return {
    ...snapshot,

    hydrate: async () => {
      const data = await readVault<PersistedState>();

      const stories = (data?.stories || []).filter(
        (story) => new Date(story.expiresAt).getTime() > Date.now()
      );

      state = {
        ...state,
        messages: data?.messages || [],
        stories,
        feed: data?.feed || [],
        vaultBytes: JSON.stringify(data || {}).length,
      };

      emit();
    },

    addMessage: async (
      input: Omit<Message, "id" | "createdAt">
    ) => {
      await persist({
        messages: [
          ...state.messages,
          {
            ...input,
            id: `msg-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    },

    addStory: async (
      input: Omit<Story, "id" | "createdAt" | "expiresAt" | "viewed">
    ) => {
      const createdAt = new Date();
      const expiresAt = new Date(
        createdAt.getTime() + 24 * 60 * 60 * 1000
      );

      await persist({
        stories: [
          {
            ...input,
            id: `story-${Date.now()}`,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            viewed: false,
          },
          ...state.stories,
        ],
      });
    },

    viewStory: async (id: string) => {
      await persist({
        stories: state.stories.map((story) =>
          story.id === id ? { ...story, viewed: true } : story
        ),
      });
    },

    addFeedPost: async (
      input: Omit<FeedPost, "id" | "createdAt" | "likes" | "liked">
    ) => {
      await persist({
        feed: [
          {
            ...input,
            id: `post-${Date.now()}`,
            createdAt: new Date().toISOString(),
            likes: 0,
            liked: false,
          },
          ...state.feed,
        ],
      });
    },

    toggleLike: async (id: string) => {
      await persist({
        feed: state.feed.map((post) =>
          post.id === id
            ? {
                ...post,
                liked: !post.liked,
                likes: Math.max(
                  0,
                  post.likes + (post.liked ? -1 : 1)
                ),
              }
            : post
        ),
      });
    },

    addContact: async (contact: NexContact) => {
      if (state.contacts.some((item) => item.id === contact.id)) return;

      state = {
        ...state,
        contacts: [...state.contacts, contact],
      };

      emit();
    },

    removeContact: async (id: string) => {
      state = {
        ...state,
        contacts: state.contacts.filter((contact) => contact.id !== id),
      };

      emit();
    },

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
