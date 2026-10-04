import {
  NexTransport,
  TransportEnvelope,
  TransportEvent,
  TransportResult,
} from "./protocol";

export type DirectoryUser = {
  id: string;
  username: string;
  displayName: string;
  publicKey: string;
  avatarUri?: string;
  bio?: string;
  updatedAt?: string;
};

type RelayMessage =
  | {
      type: "register-ack";
      accepted: boolean;
      identityId: string;
    }
  | {
      type: "directory-register-ack";
      accepted: boolean;
      user?: DirectoryUser;
      error?: string;
    }
  | {
      type: "directory-search-result";
      requestId: string;
      results: DirectoryUser[];
    }
  | {
      type: "directory-profile-result";
      requestId: string;
      user?: DirectoryUser;
    }
  | {
      type: "envelope";
      envelope: TransportEnvelope;
      offline?: boolean;
    }
  | {
      type: "envelope-ack";
      messageId?: string;
      envelopeId?: string;
      accepted: boolean;
      forwarded?: boolean;
      queued?: boolean;
      error?: string;
    }
  | {
      type: "event";
      event: TransportEvent;
    }
  | {
      type: "event-ack";
      eventId?: string;
      accepted: boolean;
      forwarded?: boolean;
      error?: string;
    }
  | {
      type: "presence";
      identityId: string;
      online: boolean;
    }
  | {
      type: "delivery-ack";
      messageId: string;
      recipientId: string;
    };

export interface InternetRelayTransportOptions {
  relayUrl?: string;
  identityId: string;
  onlineStatus?: boolean;
  onEnvelope?: (
    envelope: TransportEnvelope,
    offline: boolean,
  ) => void | Promise<void>;
  onDeliveryAck?: (
    messageId: string,
    recipientId: string,
  ) => void;
  onEvent?: (
    event: TransportEvent,
  ) => void | Promise<void>;
  onPresence?: (
    identityId: string,
    online: boolean,
  ) => void;
}

type PendingEnvelopeAck = {
  resolve: (result: TransportResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(i + chunk, bytes.length),
      ),
    );
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

const ACK_TIMEOUT_MS = 8000;
const REGISTER_TIMEOUT_MS = 5000;
const DIRECTORY_TIMEOUT_MS = 8000;

export class InternetRelayTransport implements NexTransport {
  readonly kind = "internet-relay" as const;

  private readonly relayUrl?: string;
  private readonly identityId: string;
  private readonly onlineStatus: boolean;

  private readonly onEnvelope?: InternetRelayTransportOptions["onEnvelope"];
  private readonly onDeliveryAck?: InternetRelayTransportOptions["onDeliveryAck"];
  private readonly onEvent?: InternetRelayTransportOptions["onEvent"];
  private readonly onPresence?: (
    identityId: string,
    online: boolean,
  ) => void;

  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket | null> | null = null;

  private registered = false;

  private readonly pendingEnvelopeAcks =
    new Map<string, PendingEnvelopeAck>();

  private readonly pendingEventAcks =
    new Map<string, {
      resolve: (accepted: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    }>();

  private readonly pendingDirectoryRequests =
    new Map<string, {
      resolve: (
        result: DirectoryUser[] | DirectoryUser | null,
      ) => void;
      timer: ReturnType<typeof setTimeout>;
    }>();

  private pendingDirectoryRegistration:
    {
      resolve: (accepted: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;

  constructor(options: InternetRelayTransportOptions) {
    this.relayUrl =
      options.relayUrl?.trim() || undefined;

    this.identityId = options.identityId;
    this.onlineStatus =
      options.onlineStatus !== false;

    this.onEnvelope =
      options.onEnvelope;

    this.onDeliveryAck =
      options.onDeliveryAck;

    this.onEvent =
      options.onEvent;

    this.onPresence =
      options.onPresence;
  }

  async available(): Promise<boolean> {
    return Boolean(
      this.relayUrl &&
      this.identityId,
    );
  }

  async connect(): Promise<boolean> {
    if (!(await this.available())) return false;

    const socket = await this.getSocket();

    return Boolean(
      socket &&
      socket.readyState === WebSocket.OPEN &&
      this.registered,
    );
  }

  async send(
    envelope: TransportEnvelope,
  ): Promise<TransportResult> {
    if (!(await this.available())) {
      return {
        transport: this.kind,
        accepted: false,
        delivered: false,
        queued: false,
        error:
          "Internet relay is not configured.",
      };
    }

    const socket = await this.getSocket();

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return {
        transport: this.kind,
        accepted: false,
        delivered: false,
        queued: false,
        error:
          "Internet relay is unavailable.",
      };
    }

    const message: RelayMessage = {
      type: "envelope",
      envelope: {
        ...envelope,
        payload: bytesToBase64(
          envelope.payload,
        ) as unknown as Uint8Array,
      },
    };

    return new Promise<TransportResult>(
      (resolve) => {
        const messageKey =
          envelope.messageId ??
          envelope.id;

        const timer = setTimeout(() => {
          this.pendingEnvelopeAcks.delete(
            messageKey,
          );

          resolve({
            transport: this.kind,
            accepted: false,
            delivered: false,
            queued: false,
            error:
              "Timed out waiting for relay envelope acknowledgment.",
            messageId:
              envelope.messageId,
          });
        }, ACK_TIMEOUT_MS);

        this.pendingEnvelopeAcks.set(
          messageKey,
          {
            resolve,
            timer,
          },
        );

        try {
          socket.send(
            JSON.stringify(message),
          );
        } catch (error) {
          clearTimeout(timer);

          this.pendingEnvelopeAcks.delete(
            messageKey,
          );

          resolve({
            transport: this.kind,
            accepted: false,
            delivered: false,
            queued: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to send envelope.",
            messageId:
              envelope.messageId,
          });
        }
      },
    );
  }

  async acknowledgeDelivery(
    messageId: string,
    senderId: string,
  ): Promise<boolean> {
    if (!(await this.available())) return false;

    const socket = await this.getSocket();

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return false;
    }

    try {
      socket.send(
        JSON.stringify({
          type: "delivery-ack",
          messageId,
          senderId,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async sendEvent(
    event: TransportEvent,
  ): Promise<boolean> {
    if (!(await this.available())) {
      return false;
    }

    const socket = await this.getSocket();

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return false;
    }

    const message: RelayMessage = {
      type: "event",
      event,
    };

    return new Promise<boolean>(
      (resolve) => {
        const timer = setTimeout(() => {
          this.pendingEventAcks.delete(
            event.id,
          );
          resolve(false);
        }, ACK_TIMEOUT_MS);

        this.pendingEventAcks.set(
          event.id,
          {
            resolve,
            timer,
          },
        );

        try {
          socket.send(
            JSON.stringify(message),
          );
        } catch {
          clearTimeout(timer);

          this.pendingEventAcks.delete(
            event.id,
          );

          resolve(false);
        }
      },
    );
  }

  async registerDirectoryUser(
    user: DirectoryUser,
  ): Promise<boolean> {
    if (!(await this.available())) {
      return false;
    }

    const socket = await this.getSocket();


    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return false;
    }

    if (this.pendingDirectoryRegistration) {
      clearTimeout(
        this.pendingDirectoryRegistration.timer,
      );
      this.pendingDirectoryRegistration.resolve(false);
      this.pendingDirectoryRegistration = null;
    }

    return new Promise<boolean>(
      (resolve) => {
        const timer = setTimeout(() => {
          this.pendingDirectoryRegistration = null;
          resolve(false);
        }, DIRECTORY_TIMEOUT_MS);

        this.pendingDirectoryRegistration = {
          resolve,
          timer,
        };

        try {

          socket.send(
            JSON.stringify({
              type: "directory-register",
              user,
            }),
          );
        } catch (error) {
          clearTimeout(timer);
          this.pendingDirectoryRegistration = null;
          resolve(false);
        }
      },
    );
  }

  async searchUsers(
    query: string,
  ): Promise<DirectoryUser[]> {
    if (!(await this.available())) {
      return [];
    }

    const socket = await this.getSocket();

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return [];
    }

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return [];
    }

    const requestId =
      `directory-search-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    return new Promise<DirectoryUser[]>(
      (resolve) => {
        const timer = setTimeout(() => {
          this.pendingDirectoryRequests.delete(
            requestId,
          );

          resolve([]);
        }, DIRECTORY_TIMEOUT_MS);

        this.pendingDirectoryRequests.set(
          requestId,
          {
            resolve: (
              result,
            ) => {
              resolve(
                Array.isArray(result)
                  ? result
                  : [],
              );
            },
            timer,
          },
        );

        try {
          socket.send(
            JSON.stringify({
              type: "directory-search",
              requestId,
              query: normalizedQuery,
            }),
          );
        } catch {
          clearTimeout(timer);
          this.pendingDirectoryRequests.delete(
            requestId,
          );
          resolve([]);
        }
      },
    );
  }

  async getUserProfile(
    identityId: string,
  ): Promise<DirectoryUser | null> {
    if (!(await this.available())) {
      return null;
    }

    const socket = await this.getSocket();

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !this.registered
    ) {
      return null;
    }

    const requestId =
      `directory-profile-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    return new Promise<DirectoryUser | null>(
      (resolve) => {
        const timer = setTimeout(() => {
          this.pendingDirectoryRequests.delete(
            requestId,
          );

          resolve(null);
        }, DIRECTORY_TIMEOUT_MS);

        this.pendingDirectoryRequests.set(
          requestId,
          {
            resolve: (
              result,
            ) => {
              resolve(
                result &&
                !Array.isArray(result)
                  ? result
                  : null,
              );
            },
            timer,
          },
        );

        try {
          socket.send(
            JSON.stringify({
              type: "directory-profile",
              requestId,
              identityId:
                identityId.trim(),
            }),
          );
        } catch {
          clearTimeout(timer);
          this.pendingDirectoryRequests.delete(
            requestId,
          );
          resolve(null);
        }
      },
    );
  }

  close(): void {
    this.registered = false;

    for (
      const pending of this.pendingEnvelopeAcks.values()
    ) {
      clearTimeout(pending.timer);

      pending.resolve({
        transport: this.kind,
        accepted: false,
        delivered: false,
        queued: false,
        error:
          "Internet relay connection closed.",
      });
    }

    this.pendingEnvelopeAcks.clear();

    for (
      const pending of this.pendingEventAcks.values()
    ) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }

    this.pendingEventAcks.clear();

    for (
      const pending of this.pendingDirectoryRequests.values()
    ) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }

    this.pendingDirectoryRequests.clear();

    if (this.pendingDirectoryRegistration) {
      clearTimeout(
        this.pendingDirectoryRegistration.timer,
      );
      this.pendingDirectoryRegistration.resolve(false);
      this.pendingDirectoryRegistration = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private async getSocket(): Promise<WebSocket | null> {
    if (!this.relayUrl) {
      return null;
    }

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.registered
    ) {
      return this.socket;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting =
      new Promise<WebSocket | null>(
        (resolve) => {
          const socket =
            new WebSocket(
              this.relayUrl!,
            );

          let settled = false;

          const timeout =
            setTimeout(() => {
              if (settled) {
                return;
              }

              settled = true;

              try {
                socket.close();
              } catch {
                // Ignore close failures.
              }

              resolve(null);
            }, REGISTER_TIMEOUT_MS);

          socket.onopen = () => {
            this.socket = socket;
            this.registered = false;

            try {
              socket.send(
                JSON.stringify({
                  type: "register",
                  identityId:
                    this.identityId,
                  onlineStatus:
                    this.onlineStatus,
                }),
              );
            } catch {
              clearTimeout(timeout);

              if (!settled) {
                settled = true;
                resolve(null);
              }

              return;
            }
          };

          socket.onmessage = (
            event,
          ) => {
            this.handleMessage(
              event.data,
            );

            if (
              !settled &&
              this.registered
            ) {
              clearTimeout(timeout);
              settled = true;
              resolve(socket);
            }
          };

          socket.onerror = () => {
            clearTimeout(timeout);

            if (!settled) {
              settled = true;
              resolve(null);
            }
          };

          socket.onclose = () => {
            clearTimeout(timeout);

            if (
              this.socket === socket
            ) {
              this.socket = null;
            }

            this.registered = false;

            if (!settled) {
              settled = true;
              resolve(null);
            }
          };
        },
      );

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private handleMessage(
    rawData: unknown,
  ): void {
    let message: RelayMessage;

    try {
      const raw =
        typeof rawData === "string"
          ? rawData
          : String(rawData);

      message =
        JSON.parse(raw) as RelayMessage;
    } catch {
      return;
    }

    if (
      message.type === "register-ack"
    ) {
      this.registered =
        message.accepted &&
        message.identityId ===
          this.identityId;


      return;
    }

    if (
      message.type === "directory-register-ack"
    ) {
      const pending =
        this.pendingDirectoryRegistration;

      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingDirectoryRegistration = null;

      pending.resolve(
        message.accepted === true,
      );

      return;
    }

    if (
      message.type === "directory-search-result"
    ) {
      const pending =
        this.pendingDirectoryRequests.get(
          message.requestId,
        );

      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingDirectoryRequests.delete(
        message.requestId,
      );

      pending.resolve(
        Array.isArray(message.results)
          ? message.results
          : [],
      );

      return;
    }

    if (
      message.type === "directory-profile-result"
    ) {
      const pending =
        this.pendingDirectoryRequests.get(
          message.requestId,
        );

      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingDirectoryRequests.delete(
        message.requestId,
      );

      pending.resolve(
        message.user || null,
      );

      return;
    }

    if (
      message.type === "envelope-ack"
    ) {
      const messageKey =
        message.messageId ??
        message.envelopeId;

      if (!messageKey) {
        return;
      }

      const pending =
        this.pendingEnvelopeAcks.get(
          messageKey,
        );

      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);

      this.pendingEnvelopeAcks.delete(
        messageKey,
      );

      pending.resolve({
        transport: this.kind,
        accepted:
          message.accepted === true,
        delivered: false,
        queued:
          message.queued === true,
        error:
          message.error,
        messageId:
          message.messageId,
      });

      return;
    }

    if (
      message.type === "delivery-ack"
    ) {
      this.onDeliveryAck?.(
        message.messageId,
        message.recipientId,
      );

      return;
    }

    if (
      message.type === "envelope"
    ) {
      const incomingEnvelope =
        message.envelope;

      const normalizedEnvelope: TransportEnvelope = {
        ...incomingEnvelope,
        payload:
          typeof incomingEnvelope.payload === "string"
            ? base64ToBytes(
                incomingEnvelope.payload,
              )
            : incomingEnvelope.payload,
      };

      void this.handleIncomingEnvelope(
        normalizedEnvelope,
        message.offline === true,
      );

      return;
    }

    if (
      message.type === "event"
    ) {
      void this.onEvent?.(
        message.event,
      );

      return;
    }

    if (
      message.type === "presence"
    ) {
      this.onPresence?.(
        message.identityId,
        message.online,
      );

      return;
    }

    if (
      message.type === "event-ack"
    ) {
      const eventId =
        message.eventId;

      if (!eventId) {
        return;
      }

      const pending =
        this.pendingEventAcks.get(
          eventId,
        );

      if (!pending) {
        return;
      }

      clearTimeout(
        pending.timer,
      );

      this.pendingEventAcks.delete(
        eventId,
      );

      pending.resolve(
        Boolean(
          message.accepted &&
          message.forwarded,
        ),
      );

      return;
    }
  }

  private async handleIncomingEnvelope(
    envelope: TransportEnvelope,
    offline: boolean,
  ): Promise<void> {
    try {
      await this.onEnvelope?.(
        envelope,
        offline,
      );
    } catch {
      // Incoming message handling errors
      // must not crash the WebSocket.
    }
  }
}
