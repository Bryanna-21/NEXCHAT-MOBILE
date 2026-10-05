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
import {
  InternetRelayTransport,
  DirectoryUser,
} from "./transport/internet";
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
import {
  CallSignal,
  SignalType,
  createCallSignal,
} from "./callSignaling";
import {
  initializeQueue,
  recoverInterruptedItems,
  enqueue,
  markAccepted,
  markDelivered,
  markDeliveredByMessageId,
} from "./transport/queue";
import { initializePeerStore } from "./transport/peerStore";
import { NearbyPeerBridge } from "./transport/nearbyBridge";
import { NativeBluetoothTransport } from "./bluetooth";
import { NativeWiFiDirectTransport } from "./wifiDirect";

import {
  DeliveryWorker,
} from "./transport/worker";

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
  status:
    | "completed"
    | "failed"
    | "missed"
    | "declined"
    | "cancelled";
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
const callSignalListeners =
  new Set<(signal: CallSignal) => void>();
const incomingMessageListeners =
  new Set<(message: Message) => void>();

let relayTransport: InternetRelayTransport | null = null;
let relayTransportIdentityId = "";
let relayTransportUrl = "";

let nearbyPeerBridge: NearbyPeerBridge | null = null;
let nearbyPeerBridgeIdentityId = "";

async function handleIncomingRelayEnvelope(
  envelope: import("./transport/protocol").TransportEnvelope,
  offline: boolean,
  acknowledgeRelay = true,
): Promise<boolean> {
  const identity = await getIdentity();

  if (!identity?.id) return false;

  /*
   * Never accept an envelope addressed to somebody else.
   */
  if (envelope.recipientId !== identity.id) {
    return false;
  }

  if (envelope.senderId === identity.id) {
    return false;
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

    return false;
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
    return false;
  }

  if (
    decoded.id !== envelope.messageId ||
    decoded.recipientId !== envelope.recipientId
  ) {
    return false;
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

    for (const listener of incomingMessageListeners) {
      listener(incomingMessage);
    }
  } else if (updatedContacts !== state.contacts) {
    await queuePersist({
      contacts: updatedContacts,
    });
  }

  /*
   * Only acknowledge the Internet relay when this message actually
   * arrived through the relay. Nearby delivery uses the application-
   * layer PeerDeliveryAck handled by NearbyPeerBridge.
   *
   * In both cases, acknowledgement happens only after authentication
   * and local persistence.
   */
  if (acknowledgeRelay && relayTransport) {
    await relayTransport.acknowledgeDelivery(
      incomingMessage.id,
      envelope.senderId,
    );
  }

  return true;
}

async function markMessageDelivered(
  messageId: string,
  recipientId: string,
): Promise<void> {
  /*
   * The relay only emits this callback after the recipient
   * successfully decrypts, persists, and acknowledges the
   * message. Therefore this is the authoritative delivery event.
   */
  markDeliveredByMessageId(
    messageId,
  );

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

async function markMessageRead(
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
        message.senderId !== "me" ||
        message.recipientId !== recipientId ||
        message.status !== "delivered"
      ) {
        return message;
      }

      changed = true;

      return {
        ...message,
        status: "read" as MessageStatus,
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

async function markConversationRead(
  peerId: string,
): Promise<void> {
  const conversation = findConversation(peerId);

  if (!conversation) {
    return;
  }

  let changed = false;
  const readMessageIds: string[] = [];

  const messages = conversation.messages.map(
    message => {
      if (
        message.senderId === "me" ||
        message.status === "read"
      ) {
        return message;
      }

      if (
        message.status === "delivered" ||
        message.status === "sent"
      ) {
        changed = true;
        readMessageIds.push(message.id);

        return {
          ...message,
          status: "read" as MessageStatus,
        };
      }

      return message;
    },
  );

  if (
    !changed &&
    (conversation.unreadCount ?? 0) === 0
  ) {
    return;
  }

  const updatedConversation: Conversation = {
    ...conversation,
    messages,
    unreadCount: 0,
  };

  await queuePersist({
    conversations:
      state.conversations.map(
        item =>
          item.peerId === peerId
            ? updatedConversation
            : item,
      ),
  });

  if (state.settings.readReceipts) {
    for (const messageId of readMessageIds) {
      await sendReadReceipt(
        peerId,
        messageId,
      );
    }
  }
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

function configureNearbyPeerBridge(
  identityId: string,
): void {
  /*
   * Recreate the bridge when the authenticated local identity changes.
   * This keeps all nearby routing scoped to the current device identity.
   */
  if (
    nearbyPeerBridge &&
    nearbyPeerBridgeIdentityId === identityId
  ) {
    nearbyPeerBridge.start();
    return;
  }

  if (nearbyPeerBridge) {
    nearbyPeerBridge.stop();
    nearbyPeerBridge = null;
  }

  nearbyPeerBridge = new NearbyPeerBridge(
    [
      new NativeBluetoothTransport(),
      new NativeWiFiDirectTransport(),
    ],
    {
      getIdentityId: () => identityId,

      /*
       * Nearby final delivery deliberately reuses the same authenticated
       * message path as Internet relay delivery. The bridge itself never
       * decrypts the payload.
       */
      onFinalDelivery: async packet => {
        return handleIncomingRelayEnvelope(
          packet.envelope,
          true,
          false,
        );
      },

      /*
       * A nearby delivery ACK reaches the original sender through the
       * recorded reverse path. Only the originating device settles the
       * durable outbound queue/message state.
       */
      onDeliveryAck: async packet => {
        if (!packet.messageId) return;

        await markMessageDelivered(
          packet.messageId,
          packet.recipientId,
        );
      },
    },
  );

  nearbyPeerBridgeIdentityId = identityId;

  /*
   * Keep durable nearby custody delivery active while this
   * authenticated identity is active. The bridge prevents
   * overlapping flushes internally.
   */
  nearbyPeerBridge.start();
}

async function handleReadReceiptEvent(event: import("./transport/protocol").TransportEvent): Promise<void> {
  if (!event.payload) return;

  try {
    const payload = JSON.parse(event.payload) as {
      messageId?: string;
    };

    if (!payload.messageId) return;

    const message = findConversation(event.senderId)
      ?.messages.find(item => item.id === payload.messageId);

    if (!message) return;

    if (message.recipientId !== event.senderId) return;

    if (message.senderId !== "me") return;

    await markMessageRead(payload.messageId, event.senderId);
  } catch {
    // Invalid read receipts must never crash the relay.
  }
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

    onEvent: async (event) => {
      if (!event.payload) {
        return;
      }

      if (event.kind === "read-receipt") {
        if (
          event.recipientId !== identityId ||
          !event.senderId
        ) {
          return;
        }

        if (
          Date.parse(event.createdAt) + 60_000 <
          Date.now()
        ) {
          return;
        }

        await handleReadReceiptEvent(event);
        return;
      }

      if (event.kind !== "call-signal") {
        return;
      }

      try {
        const signal =
          JSON.parse(
            event.payload,
          ) as CallSignal;

        if (
          !signal.id ||
          !signal.callId ||
          !signal.senderId ||
          !signal.recipientId ||
          !signal.type
        ) {
          return;
        }

        if (
          signal.senderId !== event.senderId ||
          signal.recipientId !== identityId
        ) {
          return;
        }

        if (
          Date.parse(signal.createdAt) + 60_000 <
          Date.now()
        ) {
          return;
        }

        for (
          const listener of callSignalListeners
        ) {
          listener(signal);
        }
      } catch {
        // Invalid signaling must never crash the relay.
      }
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

/*
 * Durable outbound delivery worker.
 *
 * It reuses the same router as foreground sends, so the
 * persisted queue follows the same relay/direct-route rules.
 */
const deliveryWorker =
  new DeliveryWorker(
    identityId =>
      getTransportRouter(identityId),
  );

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


export function subscribeCallSignals(
  listener: (signal: CallSignal) => void,
): () => void {
  callSignalListeners.add(listener);

  return () => {
    callSignalListeners.delete(listener);
  };
}

export function subscribeIncomingMessages(
  listener: (message: Message) => void,
): () => void {
  incomingMessageListeners.add(listener);

  return () => {
    incomingMessageListeners.delete(listener);
  };
}

export async function sendCallSignal(
  peerId: string,
  callId: string,
  type: SignalType,
  payload?: string,
): Promise<boolean> {
  const identity = await getIdentity();

  if (!identity?.id) {
    return false;
  }

  const signal = createCallSignal(
    callId,
    identity.id,
    peerId,
    type,
    payload,
  );

  const now = Date.now();

  return getTransportRouter(
    identity.id,
  ).sendEvent({
    id: `call-${signal.id}`,
    kind: "call-signal",
    senderId: identity.id,
    recipientId: peerId,
    createdAt: signal.createdAt,
    expiresAt: new Date(
      now + 60_000,
    ).toISOString(),
    payload: JSON.stringify(signal),
  });
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

export async function sendReadReceipt(
  peerId: string,
  messageId: string,
): Promise<boolean> {
  const identity = await getIdentity();

  if (
    !identity?.id ||
    !peerId ||
    !messageId
  ) {
    return false;
  }

  const now = Date.now();

  return getTransportRouter(identity.id).sendEvent({
    id:
      `read-${now}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    kind: "read-receipt",
    senderId: identity.id,
    recipientId: peerId,
    createdAt:
      new Date(now).toISOString(),
    expiresAt:
      new Date(
        now + 60_000,
      ).toISOString(),
    payload: JSON.stringify({
      messageId,
    }),
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
  console.log("[NEXCHAT BOOT NET 01] initializeNetworkTransport START");

  /*
   * Restore the durable encrypted offline queue before
   * the network/relay transport begins processing messages.
   */
  console.log("[NEXCHAT BOOT NET 02] initializeQueue START");
  await initializeQueue();
  console.log("[NEXCHAT BOOT NET 02] initializeQueue OK");

  /*
   * Restore durable nearby-peer custody before any
   * nearby forwarding or ACK processing begins.
   */
  console.log("[NEXCHAT BOOT NET 03] initializePeerStore START");
  await initializePeerStore();
  console.log("[NEXCHAT BOOT NET 03] initializePeerStore OK");

  /*
   * A process can disappear while an item is in "sending".
   * Those items are safe to retry after startup.
   */
  console.log("[NEXCHAT BOOT NET 04] recoverInterruptedItems START");
  recoverInterruptedItems();
  console.log("[NEXCHAT BOOT NET 04] recoverInterruptedItems OK");

  console.log("[NEXCHAT BOOT NET 05] getIdentity START");
  const identity = await getIdentity();
  console.log("[NEXCHAT BOOT NET 05] getIdentity OK", {
    id: identity?.id,
  });

  if (!identity?.id) {
    console.log("[NEXCHAT BOOT NET 06] NO ID - network startup STOPPED");
    return;
  }

  console.log("[NEXCHAT BOOT NET 07] configureRelayTransport START");
  configureRelayTransport(identity.id);
  console.log("[NEXCHAT BOOT NET 07] configureRelayTransport OK");

  /*
   * Publish the public identity needed for universal user discovery.
   * This contains no private encryption material.
   */
  if (relayTransport) {
    try {
      await relayTransport.registerDirectoryUser({
        id: identity.id,
        displayName: identity.displayName,
        username: identity.username,
        publicKey: identity.publicKey,
        avatarUri: identity.avatarUri,
        bio: identity.bio,
      });

      console.log("[NEXCHAT BOOT NET 07B] directory registration sent");
    } catch (error) {
      console.warn(
        "[NEXCHAT BOOT NET 07B] directory registration failed",
        error,
      );
    }
  }

  /*
   * Initialize the application-layer nearby bridge after identity
   * restoration. The native adapters currently report unavailable,
   * so this does not claim Bluetooth/Wi-Fi Direct connectivity.
   */
  console.log("[NEXCHAT BOOT NET 08] configureNearbyPeerBridge START");
  configureNearbyPeerBridge(identity.id);
  console.log("[NEXCHAT BOOT NET 08] configureNearbyPeerBridge OK");

  /*
   * Start durable outbound delivery after queue restoration.
   * start() is idempotent, so repeated initialization will
   * not create multiple worker timers.
   */
  console.log("[NEXCHAT BOOT NET 09] deliveryWorker.start START");
  deliveryWorker.start(identity.id);
  console.log("[NEXCHAT BOOT NET 09] deliveryWorker.start OK");

  console.log("[NEXCHAT BOOT NET 10] initializeNetworkTransport COMPLETE");
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

    registerDirectoryUser: async (): Promise<boolean> => {
      if (!relayTransport) {
        return false;
      }

      const identity = await getIdentity();

      if (!identity?.id || !identity.publicKey) {
        return false;
      }

      return relayTransport.registerDirectoryUser({
        id: identity.id,
        displayName: identity.displayName,
        username: identity.username,
        publicKey: identity.publicKey,
        avatarUri: identity.avatarUri,
        bio: identity.bio,
      });
    },

    searchDirectoryUsers: async (
      query: string,
    ): Promise<DirectoryUser[]> => {
      if (!relayTransport) {
        return [];
      }

      return relayTransport.searchUsers(query);
    },

    getDirectoryUser: async (
      identityId: string,
    ): Promise<DirectoryUser | null> => {
      if (!relayTransport) {
        return null;
      }

      return relayTransport.getUserProfile(identityId);
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
       * The attachment must already exist before the message
       * reference is persisted.
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
                contact.id.toLowerCase() ===
                peerId.toLowerCase(),
            )?.publicKey;

      if (!recipientPublicKey) {
        console.warn(
          "NexChat missing recipient public key",
          JSON.stringify({
            peerId,
            isSelfChat,
            identityId: identity?.id,
            identityUsername: identity?.username,
            contact:
              state.contacts.find(
                (contact) =>
                  contact.id === peerId,
              ) ?? null,
            contactCount:
              state.contacts.length,
          }),
        );

        throw new Error(
          "This contact does not have a messaging public key. Ask them to share their NexChat QR code again.",
        );
      }

      console.log(
        "NexChat recipient public key resolved",
        JSON.stringify({
          peerId,
          isSelfChat,
          recipientPublicKeyLength:
            recipientPublicKey.length,
          identityId: identity?.id,
          contact:
            state.contacts.find(
              (contact) =>
                contact.id === peerId,
            ) ?? null,
        }),
      );

      /*
       * Encrypt before exposing the message to the UI.
       * This keeps the optimistic state valid: once "sending"
       * appears, the encrypted envelope is already ready.
       */
      let encryptedPayload;

      try {
        encryptedPayload =
          await encryptMessagePayload(
            new TextEncoder().encode(
              JSON.stringify(
                sendingMessage,
              ),
            ),
            recipientPublicKey,
          );

        console.log(
          "NexChat message encryption succeeded",
          JSON.stringify({
            messageId:
              sendingMessage.id,
            encryptedPayloadType:
              typeof encryptedPayload,
            encryptedPayloadLength:
              encryptedPayload?.length ?? null,
          }),
        );
      } catch (error) {
        console.error(
          "NexChat message encryption failed",
          error,
        );
        throw error;
      }

      const envelope =
        createTransportEnvelope(
          identity.id,
          peerId,
          encryptedPayload,
          sendingMessage.id,
        );

      envelope.ttl = 7 * 24 * 60 * 60 * 1000;

      console.log(
        "NexChat transport envelope created",
        JSON.stringify({
          messageId:
            sendingMessage.id,
          senderId:
            envelope.senderId,
          recipientId:
            envelope.recipientId,
          payloadType:
            typeof envelope.payload,
          payloadLength:
            typeof envelope.payload === "string"
              ? String(envelope.payload).length
              : null,
        }),
      );

      /*
       * DURABLE OUTBOX
       *
       * Persist the complete encrypted envelope before any
       * network transport is attempted. This guarantees that
       * an app restart, connection loss, or relay failure cannot
       * make an already-sent message disappear.
       *
       * The queue contains only encrypted payload bytes plus
       * routing metadata. It never contains plaintext message
       * content.
       */
      const queueItem = enqueue(
        envelope,
      );

      envelope.queueId =
        queueItem.id;

      /*
       * OPTIMISTIC LOCAL PERSISTENCE
       *
       * Put the message into the conversation before waiting
       * for relay/network delivery. This is the critical fix
       * for slow devices: tapping Send must never make the
       * interface wait for an 8-second relay acknowledgement.
       */
      const sendingConversation: Conversation = {
        ...conversation,

        messages: [
          ...conversation.messages,
          sendingMessage,
        ],
      };

      const sendingExists =
        state.conversations.some(
          (c) =>
            c.peerId === peerId
        );

      const sendingConversations =
        sendingExists
          ? state.conversations.map(
              (c) =>
                c.peerId === peerId
                  ? sendingConversation
                  : c,
            )
          : [
              sendingConversation,
              ...state.conversations,
            ];

      await queuePersist({
        conversations:
          sendingConversations,
      });

      /*
       * Transport now runs only after the UI has received the
       * optimistic message. The existing relay/offline/local
       * transport architecture remains unchanged.
       */
      let transportResult;

      try {
        transportResult =
          await getTransportRouter(identity.id).send(
            envelope,
          );
      } catch (error) {
        deliveryState =
          transition(
            deliveryState,
            "failed",
          );

        const failedConversation =
          findConversation(peerId);

        if (failedConversation) {
          await queuePersist({
            conversations:
              state.conversations.map(
                (c) =>
                  c.peerId === peerId
                    ? {
                        ...failedConversation,
                        messages:
                          failedConversation.messages.map(
                            (item) =>
                              item.id ===
                              sendingMessage.id
                                ? {
                                    ...item,
                                    status:
                                      "failed" as MessageStatus,
                                  }
                                : item,
                          ),
                      }
                    : c,
              ),
          });
        }

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

        markDelivered(
          queueItem.id,
        );
      } else if (transportResult.accepted) {
        deliveryState =
          transition(
            deliveryState,
            "sent",
          );

        markAccepted(
          queueItem.id,
          transportResult.transport,
        );
      } else if (transportResult.queued) {
        deliveryState =
          transition(
            deliveryState,
            "queued",
          );

        /*
         * If the normal transport path could not deliver the
         * encrypted envelope, seed the durable nearby custody
         * path when direct routing is enabled.
         *
         * The same TransportEnvelope is reused. Nearby peers
         * receive only the encrypted payload and routing metadata.
         */
        if (
          state.settings.allowDirectP2P &&
          nearbyPeerBridge
        ) {
          nearbyPeerBridge.enqueueEnvelope(
            envelope,
          );

          void nearbyPeerBridge.flushOutbound();
        }
      } else {
        deliveryState =
          transition(
            deliveryState,
            "failed",
          );
      }

      /*
       * Replace only this message with the confirmed transport
       * state. The message remains visible throughout the entire
       * operation.
       */
      const currentConversation =
        findConversation(peerId);

      if (!currentConversation) {
        return;
      }

      const finalStatus =
        messageStatusFromDelivery(
          deliveryState,
        );

      const finalConversation: Conversation = {
        ...currentConversation,

        messages:
          currentConversation.messages.map(
            (item) =>
              item.id === sendingMessage.id
                ? {
                    ...item,
                    status: finalStatus,
                    transportQueueId:
                      transportResult.queueId,
                  }
                : item,
          ),
      };

      await queuePersist({
        conversations:
          state.conversations.map(
            (c) =>
              c.peerId === peerId
                ? finalConversation
                : c,
          ),
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
                          text: "",
                          attachment: undefined,
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

    markConversationRead: async (
      peerId: string
    ): Promise<void> => {
      await markConversationRead(peerId);
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

    updateContact: async (
      contactId: string,
      patch: Partial<NexContact>,
    ): Promise<NexContact | null> => {
      let updatedContact: NexContact | null = null;

      const contacts = state.contacts.map((contact) => {
        if (
          contact.id.toLowerCase() !==
          contactId.toLowerCase()
        ) {
          return contact;
        }

        updatedContact = {
          ...contact,
          ...patch,
        };

        return updatedContact;
      });

      await queuePersist({
        contacts,
      });

      return updatedContact;
    },

    addContact: async (
      contact: NexContact
    ): Promise<NexContact> => {
      const existing = state.contacts.find(
        (item) =>
          item.id.toLowerCase() ===
          contact.id.toLowerCase(),
      );

      const normalized: NexContact = {
        ...(existing ?? {}),
        ...contact,

        avatar:
          contact.avatar ??
          contact.avatarUri ??
          existing?.avatar,

        avatarUri:
          contact.avatarUri ??
          contact.avatar ??
          existing?.avatarUri ??
          existing?.avatar,
      };

      if (existing) {
        await queuePersist({
          contacts: state.contacts.map(
            item =>
              item.id.toLowerCase() ===
              contact.id.toLowerCase()
                ? normalized
                : item,
          ),
        });

        return normalized;
      }

      await queuePersist({
        contacts: [
          normalized,
          ...state.contacts,
        ],
      });

      return normalized;
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
