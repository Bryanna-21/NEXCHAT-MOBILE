import {
  NexTransport,
  TransportEnvelope,
  TransportResult,
} from "./protocol";

export class LocalTransport
  implements NexTransport
{
  readonly kind = "local" as const;

  async available(): Promise<boolean> {
    return true;
  }

  async send(
    envelope: TransportEnvelope,
  ): Promise<TransportResult> {
    /*
     * The durable outbox is now populated before routing.
     * LocalTransport therefore must NOT enqueue a second copy.
     *
     * A local transport result means the message remains safely
     * queued on this device for the delivery worker.
     */
    return {
      transport: this.kind,
      accepted: false,
      delivered: false,
      queued: true,
      queueId: envelope.queueId,
      messageId: envelope.messageId,
    };
  }
}
