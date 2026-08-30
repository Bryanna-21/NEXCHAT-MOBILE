import { useSyncExternalStore } from "react";
import { readVault, saveVault } from "./vault";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "voice"
  | "audio"
  | "file"
  | "view_once";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read";

export type Attachment = {
  id: string;
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  duration?: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  attachment?: Attachment;
  status: MessageStatus;
  createdAt: string;
  expiresAt?: string;
  viewedAt?: string;
  replyTo?: string;
};

export type Conversation = {
  id: string;
  peerId: string;
  title: string;
  nickname?: string;
  avatarLetter: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  disappearingSeconds?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
};

type PersistedState = {
  conversations: Conversation[];
  messages: Message[];
};

type State = PersistedState & {
  hydrated: boolean;
  vaultBytes: number;
};

const EMPTY: State = {
  conversations: [],
  messages: [],
  hydrated: false,
  vaultBytes: 0,
};

let state: State = EMPTY;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function calculateBytes(value: PersistedState) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

async function persist(next: PersistedState) {
  await saveVault(next);

  state = {
    ...next,
    hydrated: true,
    vaultBytes: calculateBytes(next),
  };

  emit();
}

function makeConversation(peerId: string): Conversation {
  const now = new Date().toISOString();

  return {
    id: `conversation:${peerId}`,
    peerId,
    title: peerId,
    avatarLetter: peerId.charAt(0).toUpperCase() || "N",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
    muted: false,
    unreadCount: 0,
  };
}

function makeMessageId() {
  return `msg:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function useNexChatStore() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );

  return {
    ...snapshot,

    hydrate: async () => {
      try {
        const data = await readVault<PersistedState>();

        const safeData: PersistedState = {
          conversations: Array.isArray(data?.conversations)
            ? data.conversations
            : [],
          messages: Array.isArray(data?.messages) ? data.messages : [],
        };

        state = {
          ...safeData,
          hydrated: true,
          vaultBytes: calculateBytes(safeData),
        };
      } catch (error) {
        console.warn("NexChat vault hydration failed:", error);

        state = {
          ...EMPTY,
          hydrated: true,
        };
      }

      emit();
    },

    getConversation: (conversationId: string) =>
      state.conversations.find((item) => item.id === conversationId),

    getMessages: (conversationId: string) =>
      state.messages.filter((item) => item.conversationId === conversationId),

    openOrCreateConversation: async (peerId: string) => {
      const normalized = peerId.trim();

      if (!normalized) {
        throw new Error("A NexChat ID is required.");
      }

      const existing = state.conversations.find(
        (conversation) => conversation.peerId === normalized,
      );

      if (existing) {
        return existing;
      }

      const conversation = makeConversation(normalized);

      await persist({
        conversations: [...state.conversations, conversation],
        messages: state.messages,
      });

      return conversation;
    },

    sendText: async (
      peerId: string,
      text: string,
      senderId: string = "me",
    ) => {
      const normalizedPeer = peerId.trim();
      const normalizedText = text.trim();

      if (!normalizedPeer || !normalizedText) {
        throw new Error("Contact and message are required.");
      }

      let conversation = state.conversations.find(
        (item) => item.peerId === normalizedPeer,
      );

      if (!conversation) {
        conversation = makeConversation(normalizedPeer);
      }

      const now = new Date().toISOString();

      const message: Message = {
        id: makeMessageId(),
        conversationId: conversation.id,
        senderId,
        type: "text",
        text: normalizedText,
        status: "queued",
        createdAt: now,
      };

      const updatedConversation: Conversation = {
        ...conversation,
        updatedAt: now,
        lastMessage: normalizedText,
        lastMessageAt: now,
      };

      const conversations = state.conversations.some(
        (item) => item.id === conversation!.id,
      )
        ? state.conversations.map((item) =>
            item.id === conversation!.id ? updatedConversation : item,
          )
        : [...state.conversations, updatedConversation];

      await persist({
        conversations,
        messages: [...state.messages, message],
      });

      return message;
    },

    deleteMessage: async (messageId: string) => {
      const messages = state.messages.filter(
        (message) => message.id !== messageId,
      );

      await persist({
        conversations: state.conversations,
        messages,
      });
    },

    deleteConversation: async (conversationId: string) => {
      await persist({
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        ),
        messages: state.messages.filter(
          (message) => message.conversationId !== conversationId,
        ),
      });
    },

    togglePin: async (conversationId: string) => {
      await persist({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, pinned: !conversation.pinned }
            : conversation,
        ),
        messages: state.messages,
      });
    },

    toggleArchive: async (conversationId: string) => {
      await persist({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, archived: !conversation.archived }
            : conversation,
        ),
        messages: state.messages,
      });
    },

    toggleMute: async (conversationId: string) => {
      await persist({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, muted: !conversation.muted }
            : conversation,
        ),
        messages: state.messages,
      });
    },

    setDisappearing: async (
      conversationId: string,
      seconds?: number,
    ) => {
      await persist({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, disappearingSeconds: seconds }
            : conversation,
        ),
        messages: state.messages,
      });
    },

    reset: async () => {
      const { clearVault } = await import("./vault");

      await clearVault();

      state = {
        ...EMPTY,
        hydrated: true,
      };

      emit();
    },
  };
}
