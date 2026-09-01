export interface WiFiDirectPeer {
  id: string;
  name?: string;
  address?: string;
  connected: boolean;
}

export interface WiFiDirectTransport {
  isAvailable(): Promise<boolean>;

  discover(): Promise<WiFiDirectPeer[]>;

  connect(peerId: string): Promise<void>;

  disconnect(peerId: string): Promise<void>;

  send(
    peerId: string,
    payload: Uint8Array,
  ): Promise<void>;
}

/**
 * Expo-safe boundary.
 *
 * Wi-Fi Direct is not claimed to work until
 * the native adapter is installed.
 */
export class NativeWiFiDirectTransport
  implements WiFiDirectTransport
{
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async discover(): Promise<WiFiDirectPeer[]> {
    throw new Error(
      "Wi-Fi Direct requires the NexChat native development build.",
    );
  }

  async connect(
    _peerId: string,
  ): Promise<void> {
    throw new Error(
      "Wi-Fi Direct requires the NexChat native development build.",
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
      "Wi-Fi Direct requires the NexChat native development build.",
    );
  }
}
