import {
  NexTransport,
  TransportEnvelope,
  TransportKind,
  TransportResult,
  TransportEvent,
  isValidTransportEnvelope,
} from "./protocol";

export type RoutePreference =
  | "automatic"
  | "relay"
  | "wifi-direct"
  | "bluetooth";

export interface RouterSettings {
  preferredRoute: RoutePreference;
  allowDirect: boolean;
}

export interface TransportRouterOptions {
  transports: NexTransport[];
  settings: RouterSettings;
}

export class TransportRouter {
  private readonly transports: NexTransport[];
  private readonly settings: RouterSettings;

  constructor(
    options: TransportRouterOptions,
  ) {
    this.transports = options.transports;
    this.settings = options.settings;
  }

  async send(
    envelope: TransportEnvelope,
  ): Promise<TransportResult> {
    if (!isValidTransportEnvelope(envelope)) {
      return {
        transport: "local",
        accepted: false,
        delivered: false,
        queued: false,
        error: "Invalid transport envelope.",
      };
    }

    if (
      envelope.ttl !== undefined &&
      Date.now() >
        new Date(envelope.createdAt).getTime() +
          envelope.ttl
    ) {
      return {
        transport: "local",
        accepted: false,
        delivered: false,
        queued: false,
        error: "Transport envelope expired.",
      };
    }

    const candidates =
      this.orderedTransports();

    let lastError =
      "No transport available.";

    for (const transport of candidates) {
      try {
        if (
          !(await transport.available())
        ) {
          continue;
        }

        const result =
          await transport.send(envelope);

        if (
          result.accepted ||
          result.delivered ||
          result.queued
        ) {
          return {
            ...result,
            queueId:
              result.queueId ??
              envelope.queueId,
          };
        }

        if (result.error) {
          lastError = result.error;
        }
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : "Transport failed.";
      }
    }

    return {
      transport: "local",
      accepted: false,
      delivered: false,
      queued: true,
      error: lastError,
    };
  }

  async sendEvent(
    event: TransportEvent,
  ): Promise<boolean> {
    const candidates = this.orderedTransports();

    for (const transport of candidates) {
      if (!transport.sendEvent) {
        continue;
      }

      try {
        if (!(await transport.available())) {
          continue;
        }

        const delivered =
          await transport.sendEvent(event);

        if (delivered) {
          return true;
        }
      } catch {
        // Try the next available transport.
      }
    }

    return false;
  }

  private orderedTransports():
    NexTransport[] {
    const allowed =
      this.transports.filter(
        transport => {
          const direct =
            transport.kind ===
              "nearby-bluetooth" ||
            transport.kind ===
              "nearby-wifi";

          return (
            !direct ||
            this.settings.allowDirect
          );
        },
      );

    const preferred =
      this.preferenceToKind(
        this.settings.preferredRoute,
      );

    const preferredTransport =
      preferred
        ? allowed.find(
            transport =>
              transport.kind === preferred,
          )
        : undefined;

    const remoteTransports =
      allowed.filter(
        transport =>
          transport.kind !== "local",
      );

    const localTransports =
      allowed.filter(
        transport =>
          transport.kind === "local",
      );

    if (preferredTransport) {
      return [
        preferredTransport,
        ...remoteTransports.filter(
          transport =>
            transport !==
            preferredTransport,
        ),
        ...localTransports,
      ];
    }

    return [
      ...remoteTransports,
      ...localTransports,
    ];
  }

  private preferenceToKind(
    preference: RoutePreference,
  ): TransportKind | null {
    switch (preference) {
      case "bluetooth":
        return "nearby-bluetooth";

      case "wifi-direct":
        return "nearby-wifi";

      case "relay":
        return "internet-relay";

      case "automatic":
      default:
        return null;
    }
  }
}
