export type TransportKind = "local"|"nearby-bluetooth"|"nearby-wifi"|"internet-relay";

export interface Transport {
  readonly kind: TransportKind;
  available(): Promise<boolean>;
  send(payload: Uint8Array, recipient: string): Promise<void>;
}

/**
 * Native transport adapters intentionally live behind this interface.
 * Expo Go can run the local/internet-independent UI while the development
 * build supplies Bluetooth/P2P implementations.
 */
export class LocalQueueTransport implements Transport {
  readonly kind="local" as const;
  async available(){ return true; }
  async send(_payload:Uint8Array,_recipient:string){ return; }
}
