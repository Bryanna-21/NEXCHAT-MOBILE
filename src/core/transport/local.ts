import {
  NexTransport,
  TransportEnvelope,
  TransportResult,
} from "./protocol";

import {
  enqueue,
} from "./queue";

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
    const item = enqueue(
      envelope.recipientId,
      envelope.payload,
      envelope.messageId,
    );

    envelope.queueId = item.id;

    return {
      transport: this.kind,
      delivered: false,
      queued: true,
      queueId:
        envelope.queueId ?? item.id,
    };
  }
}
