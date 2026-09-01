import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";
import { deleteAttachmentIfUnreferenced } from "./attachmentLifecycle";
import { attachmentExists } from "./attachmentStore";
import {
  createTransportEnvelope,
} from "./transport/protocol";
import { LocalTransport } from "./transport/local";
import { TransportRouter } from "./transport/router";
import {
  transition,
  messageStatusFromDelivery,
} from "./transport/delivery";

/* =========================================================
   NEXCHAT STORE
   Local-first state model.
   ========================================================= */

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type AttachmentType =
  | "image"
  | "video"
  | "audio"
  | "file";

export type Attachment = {
  id: string;
  type: AttachmentType;
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  expiresAt?: string;
};

export type Message = {
  id: string;

  senderId: string;
  sender: string;

  recipientId: string;

  text: string;
  createdAt: string;
  editedAt?: string;

  status: MessageStatus;

  transportQueueId?: string;

  attachment?: Attachment;

  /* Reply / forwarding */
  replyToId?: string;
  forwarded?: boolean;

  /* Saved/starred */
  starred?: boolean;

  /* View once */
  viewOnce?: boolean;
  viewedAt?: string;

  /* Expiration */
  expiresAt?: string;

  /* Deletion */
  deletedForEveryone?: boolean;
  deletedForMe?: boolean;
};

export type NexContact = {
  id: string;
  displayName: string;
  username?: string;

  avatar?: string;
  avatarUri?: string;

  phoneNumber?: string;
  bio?: string;

  online?: boolean;
  blocked?: boolean;
};

export type Conversation = {
  id: string;
  peerId: string;

  messages: Message[];

  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  locked?: boolean;

  theme?: "system" | "light" | "dark";

  disappearingSeconds?: number;
};

export type AppSettings = {
  theme: "system" | "light" | "dark";

  chatBackground:
    | "system"
    | "white"
    | "black"
    | "custom";

  backupEnabled: boolean;

  backupSchedule:
    | "daily"
    | "weekly"
    | "monthly"
    | "off";

  backupDestination:
    | "device"
    | "trusted-device"
    | "cloud";

  lastBackupRunAt?: string;
  lastBackupAttemptAt?: string;
  lastBackupError?: string;

  readReceipts: boolean;
  lastSeen: boolean;
  onlineStatus: boolean;

  autoDownload: boolean;
  linkPreviews: boolean;

  defaultDisappearingSeconds: number;
  defaultViewOnce: boolean;

  biometricLock: boolean;

  p2pRoute:
    | "automatic"
    | "relay"
    | "wifi-direct"
    | "bluetooth";

  allowDirectP2P: boolean;
  hideDirectAddress: boolean;
};

export type PersistedState = {
  conversations: Conversation[];
  contacts: NexContact[];
  settings: AppSettings;
  blockedIds: string[];
};

const demo: NexContact = {
  id: "N-4827-9153-64",
  displayName: "NexChat Demo",
  username: "demo",
  avatar: undefined,
  avatarUri: undefined,
  online: true,
  bio: "Local NexChat demo contact",
};

const defaults: AppSettings = {
  theme: "system",
  chatBackground: "system",

  backupEnabled: false,
  backupSchedule: "off",
  backupDestination: "device",

  readReceipts: true,
  lastSeen: true,
  onlineStatus: true,

  autoDownload: true,
  linkPreviews: true,

  defaultDisappearingSeconds: 0,
  defaultViewOnce: false,

  biometricLock: false,

  p2pRoute: "automatic",
  allowDirectP2P: false,
  hideDirectAddress: true,
};

let state: {
  conversations: Conversation[];
  contacts: NexContact[];
  settings: AppSettings;
  blockedIds: string[];
  vaultBytes: number;
} = {
  conversations: [],
  contacts: [demo],
  settings: defaults,
  blockedIds: [],
  vaultBytes: 0,
};

const listeners = new Set<() => void>();

function getTransportRouter(): TransportRouter {
  return new TransportRouter({
    transports: [
      new LocalTransport(),
    ],
    settings: {
      preferredRoute:
        state.settings.p2pRoute,
      allowDirect:
        state.settings.allowDirectP2P,
    },
  });
}

let writeChain: Promise<void> = Promise.resolve();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function findConversation(
  peerId: string
): Conversation | undefined {
  return state.conversations.find(
    (conversation) =>
      conversation.peerId === peerId
  );
}

/**
 * Read the current persisted settings directly, without going
 * through the React hook.
 *
 * Used for startup logic (like checking whether a scheduled
 * backup is due) that runs before/outside a component render
 * and cannot wait for a hook snapshot to catch up.
 */
export function getPersistedSettingsSnapshot(): AppSettings {
  return state.settings;
}

function encodeTransportPayload(
  message: Message,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(message),
  );
}

function makeMessage(
  peerId: string,
  text: string,
  attachment?: Attachment,
  options?: {
    viewOnce?: boolean;
    disappearingSeconds?: number;
    replyToId?: string;
    forwarded?: boolean;
  }
): Message {
  const now = new Date().toISOString();

  const disappearingSeconds =
    options?.disappearingSeconds ??
    findConversation(peerId)
      ?.disappearingSeconds ??
    state.settings.defaultDisappearingSeconds;

  const expiresAt =
    disappearingSeconds > 0
      ? new Date(
          Date.now() +
            disappearingSeconds * 1000
        ).toISOString()
      : undefined;

  return {
    id:
      `msg-${Date.now()}-` +
      Math.random()
        .toString(36)
        .slice(2, 10),

    senderId: "me",
    sender: "me",

    recipientId: peerId,

    text,

    createdAt: now,

    status: "sent",

    attachment,

    replyToId:
      options?.replyToId,

    forwarded:
      options?.forwarded,

    viewOnce:
      options?.viewOnce ??
      state.settings.defaultViewOnce,

    expiresAt,
  };
}

/**
 * Most recent persistence failure, if any. Exposed so the UI
 * layer can show a banner/warning without needing every single
 * call site to individually catch and display errors.
 */
let lastPersistError: Error | null = null;

export function getLastPersistError(): Error | null {
  return lastPersistError;
}

function queuePersist(
  next: Partial<PersistedState>
): Promise<void> {
  const task = writeChain.then(
    async () => {
      const current: PersistedState = {
        conversations:
          state.conversations,
        contacts: state.contacts,
        settings: state.settings,
        blockedIds: state.blockedIds,
      };

      const merged: PersistedState = {
        ...current,
        ...next,
      };

      state = {
        ...state,
        ...merged,
        vaultBytes:
          JSON.stringify(merged).length,
      };

      /*
       * Reflect the change in the UI immediately.
       *
       * This app is local-first: the in-memory state is the
       * source of truth for what the user sees right now.
       * Waiting on the encrypted disk write before updating the
       * UI would make every toggle/message feel unresponsive,
       * and — worse — a single persistence failure would make
       * the UI look permanently frozen even though the action
       * genuinely happened in memory.
       */
      emit();

      try {
        await saveVault(merged);
        lastPersistError = null;
      } catch (error) {
        lastPersistError =
          error instanceof Error
            ? error
            : new Error(
                "Failed to save NexChat data.",
              );

        throw lastPersistError;
      }
    }
  );

  /*
   * Critical: the write chain itself must never stay rejected.
   *
   * writeChain exists only to SERIALIZE writes (so two saves
   * never race each other) — it must not become a permanent
   * failure gate. Previously, one failed saveVault() call left
   * writeChain rejected forever; every subsequent queuePersist
   * silently chained onto that rejection and never ran again,
   * which made the entire app (messages, settings, theme,
   * toggles — everything routes through here) appear frozen
   * after a single transient storage error, with no way to
   * recover short of restarting the app.
   *
   * The caller-facing `task` promise still rejects on failure,
   * so individual callers (sendMessage, updateSettings, etc.)
   * can still detect and report a specific failure if they
   * choose to.
   */
  writeChain = task.catch(() => {});

  return task;
}

export function useNexChatStore() {
  const snapshot =
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
      () => state,
      () => state
    );

  return {
    ...snapshot,

    hydrate: async (): Promise<void> => {
      const data =
        await readVault<PersistedState>();

      if (!data) {
        return;
      }

      state = {
        ...state,

        conversations:
          data.conversations ?? [],

        contacts:
          data.contacts?.length
            ? data.contacts
            : [demo],

        settings: {
          ...defaults,
          ...(data.settings ?? {}),
        },

        blockedIds:
          data.blockedIds ?? [],

        vaultBytes:
          JSON.stringify(data).length,
      };

      emit();
    },

    ensureConversation: async (
      peerId: string
    ): Promise<Conversation> => {
      const existing =
        findConversation(peerId);

      if (existing) {
        return existing;
      }

      const conversation: Conversation = {
        id:
          `conv-${Date.now()}-${peerId}`,

        peerId,

        messages: [],

        disappearingSeconds:
          state.settings
            .defaultDisappearingSeconds,
      };

      await queuePersist({
        conversations: [
          conversation,
          ...state.conversations,
        ],
      });

      return conversation;
    },

    sendMessage: async (
      peerId: string,
      text: string,
      attachment?: Attachment,
      options?: {
        viewOnce?: boolean;
        disappearingSeconds?: number;
        replyToId?: string;
        forwarded?: boolean;
      }
    ): Promise<void> => {
      if (
        state.blockedIds.includes(peerId)
      ) {
        throw new Error(
          "This contact is blocked."
        );
      }

      /*
       * Attachment integrity boundary.
       *
       * Every message attachment must already exist in the
       * durable attachment store before the message reference
       * is persisted.
       *
       * Forwarded messages intentionally reuse the same
       * attachment ID, so this verification also protects
       * forwarded references without duplicating the file.
       */
      if (attachment?.id) {
        const exists =
          await attachmentExists(
            attachment.id,
          );

        if (!exists) {
          throw new Error(
            "Attachment is no longer available.",
          );
        }
      }

      let conversation =
        findConversation(peerId);

      if (!conversation) {
        conversation = {
          id:
            `conv-${Date.now()}-${peerId}`,

          peerId,

          messages: [],

          disappearingSeconds:
            state.settings
              .defaultDisappearingSeconds,
        };
      }

      const message =
        makeMessage(
          peerId,
          text,
          attachment,
          options
        );

      let deliveryState =
        transition(
          "created",
          "sending",
        );

      const sendingMessage: Message = {
        ...message,
        status: "sending",
      };

      const envelope =
        createTransportEnvelope(
          "me",
          peerId,
          encodeTransportPayload(
            sendingMessage,
          ),
          sendingMessage.id,
        );

      envelope.ttl = 7 * 24 * 60 * 60 * 1000;

      let transportResult;

      try {
        transportResult =
          await getTransportRouter().send(
            envelope,
          );
      } catch (error) {
        transition(
          deliveryState,
          "failed",
        );

        throw error;
      }

      if (transportResult.delivered) {
        deliveryState =
          transition(
            deliveryState,
            "sent",
          );

        deliveryState =
          transition(
            deliveryState,
            "delivered",
          );
      } else if (transportResult.queued) {
        deliveryState =
          transition(
            deliveryState,
            "queued",
          );
      } else {
        deliveryState =
          transition(
            deliveryState,
            "failed",
          );
      }

      const finalMessage: Message = {
        ...sendingMessage,
        status:
          messageStatusFromDelivery(
            deliveryState,
          ),
        transportQueueId:
          transportResult.queueId,
      };

      const updatedConversation: Conversation =
        {
          ...conversation,

          messages: [
            ...conversation.messages,
            finalMessage,
          ],
        };

      const exists =
        state.conversations.some(
          (c) =>
            c.peerId === peerId
        );

      const conversations = exists
        ? state.conversations.map(
            (c) =>
              c.peerId === peerId
                ? updatedConversation
                : c
          )
        : [
            updatedConversation,
            ...state.conversations,
          ];

      await queuePersist({
        conversations,
      });
    },

    editMessage: async (
      id: string,
      text: string
    ): Promise<void> => {
      const cleaned = text.trim();

      if (!cleaned) {
        throw new Error(
          "Message cannot be empty."
        );
      }

      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) => ({
              ...conversation,

              messages:
                conversation.messages.map(
                  (message) =>
                    message.id === id
                      ? {
                          ...message,
                          text: cleaned,
                          editedAt:
                            new Date()
                              .toISOString(),
                        }
                      : message
                ),
            })
          ),
      });
    },

    deleteMessage: async (
      id: string,
      forEveryone = false
    ): Promise<void> => {
      const currentConversations =
        state.conversations;

      const targetMessage =
        currentConversations
          .flatMap(
            conversation =>
              conversation.messages
          )
          .find(
            message =>
              message.id === id
          );

      const removedAttachmentId =
        targetMessage?.attachment?.id;

      const nextConversations =
        currentConversations.map(
          conversation => ({
            ...conversation,

            messages:
              conversation.messages.map(
                message =>
                  message.id === id
                    ? {
                        ...message,

                        text:
                          forEveryone
                            ? "This message was deleted"
                            : message.text,

                        attachment:
                          undefined,

                        ...(forEveryone
                          ? {
                              deletedForEveryone:
                                true,
                            }
                          : {
                              deletedForMe:
                                true,
                            }),
                      }
                    : message
              ),
          })
        );

      await queuePersist({
        conversations:
          nextConversations,
      });

      /*
       * The new state has been persisted successfully.
       * Only now is the removed attachment eligible for
       * physical deletion.
       *
       * Reference-aware cleanup protects forwarded messages
       * and any other message sharing the same attachment ID.
       */
      if (removedAttachmentId) {
        try {
          await deleteAttachmentIfUnreferenced(
            removedAttachmentId,
            nextConversations
          );
        } catch {
          /*
           * Physical cleanup is best-effort.
           *
           * The message deletion itself has already succeeded.
           * A later reconciliation pass can remove the orphan.
           */
        }
      }
    },

    markViewOnce: async (
      id: string
    ): Promise<void> => {
      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) => ({
              ...conversation,

              messages:
                conversation.messages.map(
                  (message) =>
                    message.id === id
                      ? {
                          ...message,
                          viewedAt:
                            new Date()
                              .toISOString(),
                        }
                      : message
                ),
            })
          ),
      });
    },

    toggleStarMessage: async (
      id: string
    ): Promise<void> => {
      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) => ({
              ...conversation,

              messages:
                conversation.messages.map(
                  (message) =>
                    message.id === id
                      ? {
                          ...message,
                          starred:
                            !message.starred,
                        }
                      : message
                ),
            })
          ),
      });
    },

    replyToMessage: async (
      peerId: string,
      replyToId: string,
      text: string
    ): Promise<void> => {
      await (
        useNexChatStore as any
      );

      const cleaned = text.trim();

      if (!cleaned) {
        throw new Error(
          "Message cannot be empty."
        );
      }

      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) => {
              if (
                conversation.peerId !==
                peerId
              ) {
                return conversation;
              }

              const message =
                makeMessage(
                  peerId,
                  cleaned,
                  undefined,
                  {
                    replyToId,
                  }
                );

              return {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  message,
                ],
              };
            }
          ),
      });
    },

    forwardMessage: async (
      sourceMessage: Message,
      peerId: string
    ): Promise<void> => {
      if (
        state.blockedIds.includes(peerId)
      ) {
        throw new Error(
          "This contact is blocked."
        );
      }

      /*
       * Forwarding reuses the original attachment ID.
       * Verify the physical attachment still exists before
       * persisting another message reference to it.
       */
      if (sourceMessage.attachment?.id) {
        const exists =
          await attachmentExists(
            sourceMessage.attachment.id,
          );

        if (!exists) {
          throw new Error(
            "The attachment being forwarded is no longer available.",
          );
        }
      }

      let conversation =
        findConversation(peerId);

      if (!conversation) {
        conversation = {
          id:
            `conv-${Date.now()}-${peerId}`,

          peerId,

          messages: [],

          disappearingSeconds:
            state.settings
              .defaultDisappearingSeconds,
        };
      }

      const forwarded =
        makeMessage(
          peerId,
          sourceMessage.text,
          sourceMessage.attachment,
          {
            forwarded: true,
          }
        );

      const updatedConversation = {
        ...conversation,

        messages: [
          ...conversation.messages,
          forwarded,
        ],
      };

      const exists =
        state.conversations.some(
          (c) =>
            c.peerId === peerId
        );

      const conversations = exists
        ? state.conversations.map(
            (c) =>
              c.peerId === peerId
                ? updatedConversation
                : c
          )
        : [
            updatedConversation,
            ...state.conversations,
          ];

      await queuePersist({
        conversations,
      });
    },

    pinConversation: async (
      peerId: string,
      pinned = true
    ): Promise<void> => {
      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) =>
              conversation.peerId ===
              peerId
                ? {
                    ...conversation,
                    pinned,
                  }
                : conversation
          ),
      });
    },

    archiveConversation: async (
      peerId: string,
      archived = true
    ): Promise<void> => {
      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) =>
              conversation.peerId ===
              peerId
                ? {
                    ...conversation,
                    archived,
                  }
                : conversation
          ),
      });
    },

    setConversation: async (
      peerId: string,
      patch: Partial<Conversation>
    ): Promise<void> => {
      await queuePersist({
        conversations:
          state.conversations.map(
            (conversation) =>
              conversation.peerId ===
              peerId
                ? {
                    ...conversation,
                    ...patch,
                  }
                : conversation
          ),
      });
    },

    clearConversation: async (
      peerId: string
    ): Promise<void> => {
      const conversation =
        findConversation(peerId);

      if (!conversation) {
        return;
      }

      const attachmentIds =
        new Set<string>();

      for (
        const message
        of conversation.messages
      ) {
        const attachment =
          message.attachment;

        if (attachment?.id) {
          attachmentIds.add(
            attachment.id
          );
        }
      }

      const nextConversations =
        state.conversations.map(
          current =>
            current.peerId === peerId
              ? {
                  ...current,
                  messages: [],
                }
              : current
        );

      /*
       * Persist the destructive state change first.
       *
       * If persistence fails, no physical attachment is
       * removed and the previous conversation remains intact.
       */
      await queuePersist({
        conversations:
          nextConversations,
      });

      /*
       * Physical deletion happens only after the new state
       * has been persisted.
       *
       * The reference-aware lifecycle layer protects files
       * that are still used by another message.
       */
      for (const attachmentId of attachmentIds) {
        try {
          await deleteAttachmentIfUnreferenced(
            attachmentId,
            nextConversations
          );
        } catch {
          /*
           * Best-effort physical cleanup.
           *
           * The chat itself has already been cleared.
           * A future reconciliation pass can remove any
           * attachment whose cleanup failed here.
           */
        }
      }
    },

    updateSettings: async (
      patch: Partial<AppSettings>
    ): Promise<void> => {
      await queuePersist({
        settings: {
          ...state.settings,
          ...patch,
        },
      });
    },

    block: async (
      id: string
    ): Promise<void> => {
      await queuePersist({
        blockedIds:
          Array.from(
            new Set([
              ...state.blockedIds,
              id,
            ])
          ),

        contacts:
          state.contacts.map(
            (contact) =>
              contact.id === id
                ? {
                    ...contact,
                    blocked: true,
                  }
                : contact
          ),
      });
    },

    unblock: async (
      id: string
    ): Promise<void> => {
      await queuePersist({
        blockedIds:
          state.blockedIds.filter(
            (blockedId) =>
              blockedId !== id
          ),

        contacts:
          state.contacts.map(
            (contact) =>
              contact.id === id
                ? {
                    ...contact,
                    blocked: false,
                  }
                : contact
          ),
      });
    },

    addContact: async (
      contact: NexContact
    ): Promise<void> => {
      if (
        state.contacts.some(
          (existing) =>
            existing.id === contact.id
        )
      ) {
        return;
      }

      const normalized: NexContact = {
        ...contact,

        avatar:
          contact.avatar ??
          contact.avatarUri,

        avatarUri:
          contact.avatarUri ??
          contact.avatar,
      };

      await queuePersist({
        contacts: [
          normalized,
          ...state.contacts,
        ],
      });
    },

    reset: async (): Promise<void> => {
      await clearVault();

      state = {
        conversations: [],
        contacts: [demo],
        settings: defaults,
        blockedIds: [],
        vaultBytes: 0,
      };

      emit();
    },
  };
}
