import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";
import { deleteAttachmentIfUnreferenced } from "./attachmentLifecycle";
import { attachmentExists } from "./attachmentStore";
import {
  createTransportEnvelope,
  TransportEventKind,
  NexTransport,
} from "./transport/protocol";
import { LocalTransport } from "./transport/local";
import { InternetRelayTransport } from "./transport/internet";
import { TransportRouter } from "./transport/router";
import {
  transition,
  messageStatusFromDelivery,
} from "./transport/delivery";
import {
  encryptMessagePayload,
  decryptMessagePayload,
} from "./messageCrypto";
import { getIdentity } from "./identity";

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

  /*
   * Present only on synthetic call-log entries inserted into a
   * conversation after a call ends. When set, the UI renders a
   * call-log row (icon, duration, outcome) instead of a normal
   * text/attachment bubble.
   */
  callInfo?: CallHistoryEntry;
};

export type CallHistoryEntry = {
  id: string;
  peerId: string;
  type: "voice" | "video";
  direction: "outgoing" | "incoming";
  status: "completed" | "failed" | "missed" | "declined";
  startedAt: string;
  connectedAt?: string;
  endedAt: string;
  durationSeconds?: number;
};

export type NexContact = {
  id: string;
  displayName: string;
  username?: string;

  /**
   * Base64-encoded X25519 public key used for end-to-end
   * message encryption.
   */
  publicKey?: string;

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
  pinnedUntil?: string;
  archived?: boolean;
  muted?: boolean;
  locked?: boolean;
  unreadCount?: number;

  theme?: "system" | "light" | "dark";

  disappearingSeconds?: number;
};

export type AppSettings = {
  theme: "system" | "light" | "dark";

  messageColorMe?: string;
  messageColorThem?: string;

  chatBackground:
    | "system"
    | "white"
    | "black"
    | "custom";

  chatBackgroundColor?: string;
  chatBackgroundImage?: string;

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

  /**
   * NexChat users explicitly marked as Best Friends.
   * IDs refer to entries in the persisted contacts list.
   */
  bestFriendIds: string[];

  autoDownload: boolean;
  linkPreviews: boolean;

  defaultDisappearingSeconds: number;
  defaultViewOnce: boolean;

  pullDownToArchive: boolean;

  biometricLock: boolean;

  p2pRoute:
    | "automatic"
    | "relay"
    | "wifi-direct"
    | "bluetooth";

  relayUrl: string;

  allowDirectP2P: boolean;
  hideDirectAddress: boolean;
};

export type PersistedState = {
  conversations: Conversation[];
  contacts: NexContact[];
  settings: AppSettings;
  blockedIds: string[];
  callHistory: CallHistoryEntry[];
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
  messageColorMe: undefined,
  messageColorThem: undefined,
  chatBackground: "system",
  chatBackgroundColor: undefined,
  chatBackgroundImage: undefined,

  backupEnabled: false,
  backupSchedule: "off",
  backupDestination: "device",

  readReceipts: true,
  lastSeen: true,
  onlineStatus: true,

  bestFriendIds: [],

  autoDownload: true,
  linkPreviews: true,

  defaultDisappearingSeconds: 0,
  defaultViewOnce: false,

  pullDownToArchive: false,

  biometricLock: false,

  p2pRoute: "automatic",
  relayUrl: "",
  allowDirectP2P: false,
  hideDirectAddress: true,
};

let state: {
  conversations: Conversation[];
  contacts: NexContact[];
  settings: AppSettings;
  blockedIds: string[];
  callHistory: CallHistoryEntry[];
  vaultBytes: number;
} = {
  conversations: [],
  contacts: [demo],
  settings: defaults,
  blockedIds: [],
  callHistory: [],
  vaultBytes: 0,
};

const listeners = new Set<() => void>();

let relayTransport: InternetRelayTransport | null = null;
let relayTransportIdentityId = "";
let relayTransportUrl = "";

async function handleIncomingRelayEnvelope(
  envelope: import("./transport/protocol").TransportEnvelope,
  offline: boolean,
): Promise<void> {
  const identity = await getIdentity();

  if (!identity?.id) return;

  /*
   * Never accept an envelope addressed to somebody else.
   */
  if (envelope.recipientId !== identity.id) {
    return;
  }

  if (envelope.senderId === identity.id) {
    return;
  }

  console.log(
    "[NexChat relay] Incoming envelope received:",
    {
      messageId: envelope.messageId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      offline,
    },
  );

  /*
   * The ciphertext is authenticated by nacl.box. Decryption
   * therefore verifies that the payload was encrypted for this
   * device's messaging key and was not modified in transit.
   */
  let decoded: Message;

  try {
    const plaintext = await decryptMessagePayload(envelope.payload);
    decoded = JSON.parse(
      new TextDecoder().decode(plaintext),
    ) as Message;
  } catch (error) {
    /*
     * Do not acknowledge a message we could not authenticate
     * and decrypt. The relay will retain it for another attempt.
     */
    console.error(
      "[NexChat relay] Incoming message decrypt failed:",
      error instanceof Error
        ? error.message
        : String(error),
      {
        messageId: envelope.messageId,
        senderId: envelope.senderId,
        recipientId: envelope.recipientId,
        offline,
      },
    );

    return;
  }

  /*
   * The transport envelope is authoritative for sender/recipient.
   * Do not trust those fields from inside the encrypted message
   * payload alone.
   */
  if (
    !decoded ||
    typeof decoded.id !== "string" ||
    !decoded.id ||
    typeof decoded.text !== "string"
  ) {
    return;
  }

  if (
    decoded.id !== envelope.messageId ||
    decoded.recipientId !== envelope.recipientId
  ) {
    return;
  }

  /*
   * Find the known contact. We use the transport sender identity
   * rather than the display name embedded in the message.
   */
  const contact = state.contacts.find(
    contact => contact.id === envelope.senderId,
  );

  /*
   * The encrypted payload contains the sender's authenticated
   * X25519 public key. Keep it on the contact after successful
   * decryption so this device can reply without requiring the
   * contact QR code to be scanned again.
   */
  let updatedContacts = state.contacts;

  try {
    const encryptedEnvelope = JSON.parse(
      new TextDecoder().decode(
        envelope.payload,
      ),
    ) as {
      senderPublicKey?: unknown;
    };

    if (
      typeof encryptedEnvelope.senderPublicKey === "string" &&
      encryptedEnvelope.senderPublicKey.length > 0
    ) {
      const senderPublicKey =
        encryptedEnvelope.senderPublicKey;

      updatedContacts = state.contacts.map(
        existingContact =>
          existingContact.id === envelope.senderId
            ? {
                ...existingContact,
                publicKey:
                  senderPublicKey as string,
              }
            : existingContact,
      );
    }
  } catch {
    /*
     * Decryption already succeeded, so never reject an otherwise
     * valid message because of this contact-key persistence step.
     */
  }

  const incomingMessage: Message = {
    ...decoded,
    senderId: envelope.senderId,
    sender:
      contact?.displayName ||
      contact?.username ||
      envelope.senderId,
    recipientId: identity.id,
    status: "delivered",
    transportQueueId: envelope.queueId,
  };

  /*
   * Idempotency: offline relay delivery may be attempted more
   * than once. Never insert the same message twice.
   */
  const existingConversation = findConversation(
    envelope.senderId,
  );

  const existingMessage = existingConversation?.messages.some(
    message => message.id === incomingMessage.id,
  );

  if (!existingMessage) {
    const conversation =
      existingConversation ??
      {
        id:
          `conv-${Date.now()}-${envelope.senderId}`,
        peerId: envelope.senderId,
        messages: [],
        disappearingSeconds:
          state.settings.defaultDisappearingSeconds,
      };

    const updatedConversation: Conversation = {
      ...conversation,
      messages: [
        ...conversation.messages,
        incomingMessage,
      ],
      unreadCount:
        (conversation.unreadCount ?? 0) + 1,
    };

    const conversations =
      existingConversation
        ? state.conversations.map(
            conversation =>
              conversation.peerId === envelope.senderId
                ? updatedConversation
                : conversation,
          )
        : [
            updatedConversation,
            ...state.conversations,
          ];

    await queuePersist({
      conversations,
      contacts: updatedContacts,
    });
  } else if (updatedContacts !== state.contacts) {
    await queuePersist({
      contacts: updatedContacts,
    });
  }

  /*
   * Only acknowledge after authentication and local persistence.
   * This is what allows the relay to remove its durable copy and
   * tells the sender that this device actually received it.
   */
  if (relayTransport) {
    await relayTransport.acknowledgeDelivery(
      incomingMessage.id,
      envelope.senderId,
    );
  }
}

async function markMessageDelivered(
  messageId: string,
  recipientId: string,
): Promise<void> {
  const conversation = findConversation(
    recipientId,
  );

  if (!conversation) return;

  let changed = false;

  const messages = conversation.messages.map(
    message => {
      if (
        message.id !== messageId ||
        message.status === "delivered" ||
        message.status === "read"
      ) {
        return message;
      }

      changed = true;

      return {
        ...message,
        status: "delivered" as MessageStatus,
      };
    },
  );

  if (!changed) return;

  const updatedConversation: Conversation = {
    ...conversation,
    messages,
  };

  await queuePersist({
    conversations:
      state.conversations.map(
        item =>
          item.peerId === recipientId
            ? updatedConversation
            : item,
      ),
  });
}

async function updateContactPresence(
  identityId: string,
  online: boolean,
): Promise<void> {
  if (!identityId) {
    return;
  }

  let changed = false;

  const updatedContacts =
    state.contacts.map(
      contact => {
        if (contact.id !== identityId) {
          return contact;
        }

        if (contact.online === online) {
          return contact;
        }

        changed = true;

        return {
          ...contact,
          online,
        };
      },
    );

  if (!changed) {
    return;
  }

  await queuePersist({
    contacts: updatedContacts,
  });
}

function configureRelayTransport(identityId: string): void {
  const relayUrl = state.settings.relayUrl.trim();

  if (
    relayTransport &&
    (
      relayTransportIdentityId !== identityId ||
      relayTransportUrl !== relayUrl
    )
  ) {
    relayTransport.close();
    relayTransport = null;
    relayTransportIdentityId = "";
    relayTransportUrl = "";
  }

  if (!relayUrl) {
    if (relayTransport) {
      relayTransport.close();
      relayTransport = null;
    }
    return;
  }

  if (relayTransport) return;

  relayTransport = new InternetRelayTransport({
    relayUrl,
    identityId,
    onlineStatus:
      state.settings.onlineStatus,

    onPresence: (
      peerId,
      online,
    ) => {
      void updateContactPresence(
        peerId,
        online,
      );
    },

    onEnvelope: async (
      envelope,
      offline,
    ) => {
      await handleIncomingRelayEnvelope(
        envelope,
        offline,
      );
    },

    onDeliveryAck: (
      messageId,
      recipientId,
    ) => {
      void markMessageDelivered(
        messageId,
        recipientId,
      );
    },
  });

  relayTransportIdentityId = identityId;
  relayTransportUrl = relayUrl;

  /*
   * Open the persistent relay connection during initialization.
   * This keeps NexChat able to receive messages even when the
   * user is not currently sending anything.
   */
  void relayTransport.connect();
}

function getTransportRouter(
  identityId: string,
): TransportRouter {
  configureRelayTransport(identityId);

  const transports: NexTransport[] = [
    new LocalTransport(),
  ];

  if (relayTransport) {
    transports.push(relayTransport);
  }

  return new TransportRouter({
    transports,
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


export async function sendTypingEvent(
  peerId: string,
  kind: TransportEventKind,
): Promise<boolean> {
  const identity = await getIdentity();

  if (!identity?.id) {
    return false;
  }

  const now = Date.now();

  return getTransportRouter(identity.id).sendEvent({
    id:
      `evt-${now}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    kind,
    senderId: identity.id,
    recipientId: peerId,
    createdAt:
      new Date(now).toISOString(),
    expiresAt:
      new Date(
        now + 5000,
      ).toISOString(),
  });
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
        callHistory: state.callHistory,
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

export async function initializeNetworkTransport(): Promise<void> {
  const identity = await getIdentity();

  if (!identity?.id) return;

  configureRelayTransport(identity.id);
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

        callHistory:
          data.callHistory ?? [],

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

      const identity =
        await getIdentity();

      const isSelfChat =
        identity?.id === peerId;

      const recipientPublicKey =
        isSelfChat
          ? identity?.publicKey
          : state.contacts.find(
              (contact) =>
                contact.id === peerId,
            )?.publicKey;

      if (!recipientPublicKey) {
        throw new Error(
          "This contact does not have a messaging public key. Ask them to share their NexChat QR code again.",
        );
      }

      const encryptedPayload =
        await encryptMessagePayload(
          new TextEncoder().encode(
            JSON.stringify(
              sendingMessage,
            ),
          ),
          recipientPublicKey,
        );

      const envelope =
        createTransportEnvelope(
          identity.id,
          peerId,
          encryptedPayload,
          sendingMessage.id,
        );

      envelope.ttl = 7 * 24 * 60 * 60 * 1000;

      let transportResult;

      try {
        transportResult =
          await getTransportRouter(identity.id).send(
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
      } else if (transportResult.accepted) {
        deliveryState =
          transition(
            deliveryState,
            "sent",
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

      /*
       * Read receipts must come from the recipient device.
       *
       * There is intentionally no local timer here. A remote
       * delivery/read acknowledgement will update this message
       * once real transport synchronization is connected.
       */
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
      pinned = true,
      pinnedUntil?: string
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
                    pinnedUntil: pinned ? pinnedUntil : undefined,
                  }
                : conversation
          ),
      });
    },

    /**
     * Unpin any conversation whose pin timer has expired.
     * Cheap to call on every chat-list render — a no-op for
     * anything not currently time-pinned or not yet expired.
     */
    clearExpiredPins: async (): Promise<void> => {
      const now = Date.now();

      const expired = state.conversations.filter(
        (c) =>
          c.pinned &&
          c.pinnedUntil &&
          new Date(c.pinnedUntil).getTime() <= now
      );

      if (!expired.length) {
        return;
      }

      await queuePersist({
        conversations: state.conversations.map((c) =>
          c.pinned && c.pinnedUntil && new Date(c.pinnedUntil).getTime() <= now
            ? { ...c, pinned: false, pinnedUntil: undefined }
            : c
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

    /**
     * Remove the conversation entirely — it disappears from the
     * chat list, not just its messages. Any attachments the
     * conversation referenced are cleaned up the same
     * reference-aware way clearConversation does.
     */
    deleteConversation: async (
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
        state.conversations.filter(
          current => current.peerId !== peerId
        );

      await queuePersist({
        conversations:
          nextConversations,
      });

      for (const attachmentId of attachmentIds) {
        try {
          await deleteAttachmentIfUnreferenced(
            attachmentId,
            nextConversations
          );
        } catch {
          // Best-effort physical cleanup, same as clearConversation.
        }
      }
    },

    /**
     * Delete several conversations at once — the "Select" bulk
     * delete flow. Same attachment-cleanup guarantee as the
     * single-conversation version, computed once across all of
     * them rather than one persist per chat.
     */
    deleteConversations: async (
      peerIds: string[]
    ): Promise<void> => {
      const peerIdSet = new Set(peerIds);

      const toDelete = state.conversations.filter((c) =>
        peerIdSet.has(c.peerId)
      );

      if (!toDelete.length) {
        return;
      }

      const attachmentIds = new Set<string>();

      for (const conversation of toDelete) {
        for (const message of conversation.messages) {
          if (message.attachment?.id) {
            attachmentIds.add(message.attachment.id);
          }
        }
      }

      const nextConversations = state.conversations.filter(
        (c) => !peerIdSet.has(c.peerId)
      );

      await queuePersist({
        conversations: nextConversations,
      });

      for (const attachmentId of attachmentIds) {
        try {
          await deleteAttachmentIfUnreferenced(
            attachmentId,
            nextConversations
          );
        } catch {
          // Best-effort physical cleanup.
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

      if (
        Object.prototype.hasOwnProperty.call(
          patch,
          "relayUrl",
        ) ||
        Object.prototype.hasOwnProperty.call(
          patch,
          "onlineStatus",
        )
      ) {
        const identity = await getIdentity();

        if (identity?.id) {
          if (
            Object.prototype.hasOwnProperty.call(
              patch,
              "onlineStatus",
            ) &&
            relayTransport
          ) {
            relayTransport.close();
            relayTransport = null;
            relayTransportIdentityId = "";
            relayTransportUrl = "";
          }

          configureRelayTransport(identity.id);
        }
      }
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

    /**
     * Record a completed/failed call in history, and insert a
     * matching synthetic message into that peer's conversation
     * so it also shows up in the chat thread itself (and in the
     * conversation list preview), the same way WhatsApp shows a
     * call as both a line in Recent Calls and a line in the chat.
     */
    logCall: async (
      entry: CallHistoryEntry
    ): Promise<void> => {
      let conversation =
        findConversation(entry.peerId);

      if (!conversation) {
        conversation = {
          id:
            `conv-${Date.now()}-${entry.peerId}`,

          peerId: entry.peerId,

          messages: [],

          disappearingSeconds:
            state.settings
              .defaultDisappearingSeconds,
        };
      }

      const callMessage: Message = {
        id: `call-msg-${entry.id}`,
        senderId: "me",
        sender: "me",
        recipientId: entry.peerId,
        text:
          entry.type === "video"
            ? "Video call"
            : "Voice call",
        createdAt: entry.endedAt,
        status: "sent",
        callInfo: entry,
      };

      const updatedConversation: Conversation =
        {
          ...conversation,

          messages: [
            ...conversation.messages,
            callMessage,
          ],
        };

      const exists =
        state.conversations.some(
          (c) => c.peerId === entry.peerId
        );

      const conversations = exists
        ? state.conversations.map(
            (c) =>
              c.peerId === entry.peerId
                ? updatedConversation
                : c
          )
        : [
            updatedConversation,
            ...state.conversations,
          ];

      await queuePersist({
        conversations,
        callHistory: [
          entry,
          ...state.callHistory,
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
        callHistory: [],
        vaultBytes: 0,
      };

      emit();
    },
  };
}
