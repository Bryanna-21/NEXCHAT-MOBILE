import {
  NexTransport,
  TransportEnvelope,
  TransportKind,
  TransportResult,
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
          result.delivered ||
          result.queued
        ) {
          return result;
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
      delivered: false,
      queued: true,
      error: lastError,
    };
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

    if (!preferred) {
      return allowed;
    }

    const preferredTransport =
      allowed.find(
        transport =>
          transport.kind === preferred,
      );

    if (!preferredTransport) {
      return allowed;
    }

    return [
      preferredTransport,
      ...allowed.filter(
        transport =>
          transport !==
          preferredTransport,
      ),
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
