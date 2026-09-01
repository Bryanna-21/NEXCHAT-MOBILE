export interface BluetoothPeer {
  id: string;
  name?: string;
  connected: boolean;
}

export interface BluetoothTransport {
  isAvailable(): Promise<boolean>;

  discover(): Promise<BluetoothPeer[]>;

  connect(peerId: string): Promise<void>;

  disconnect(peerId: string): Promise<void>;

  send(
    peerId: string,
    payload: Uint8Array,
  ): Promise<void>;
}

/**
 * Expo-safe implementation.
 *
 * It never reports a fake Bluetooth connection.
 */
export class NativeBluetoothTransport
  implements BluetoothTransport
{
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async discover(): Promise<BluetoothPeer[]> {
    throw new Error(
      "Bluetooth requires the NexChat native development build.",
    );
  }

  async connect(
    _peerId: string,
  ): Promise<void> {
    throw new Error(
      "Bluetooth requires the NexChat native development build.",
    );
  }

  async disconnect(
    _peerId: string,
  ): Promise<void> {
    return;
  }

  async send(
    _peerId: string,
    _payload: Uint8Array,
  ): Promise<void> {
    throw new Error(
      "Bluetooth requires the NexChat native development build.",
    );
  }
}
