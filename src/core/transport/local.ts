import {
  NexTransport,
  TransportEnvelope,
  TransportResult,
} from "./protocol";

import {
  enqueue,
  markSending,
  markDelivered,
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

    /*
     * This is a local-only transport: there is no real second
     * device receiving this message over any network. There is
     * no peer to actually deliver to.
     *
     * "Delivered" here means the message was durably handed off
     * to this device's local outbox — the full extent of what a
     * local-only transport can honestly claim. It does NOT mean
     * a remote peer received it. Real device-to-device delivery
     * requires the Bluetooth/Wi-Fi Direct/relay transports, which
     * remain unimplemented (see NativeBluetoothTransport /
     * NativeWiFiDirectTransport).
     *
     * Without this, every message stayed in "queued" forever
     * (markDelivered/markSending existed in the queue but were
     * never called by anything), which is why message status
     * ticks never advanced past the "sending" clock icon.
     */
    markSending(item.id);
    markDelivered(item.id);

    return {
      transport: this.kind,
      delivered: true,
      queued: false,
      queueId:
        envelope.queueId ?? item.id,
    };
  }
}
