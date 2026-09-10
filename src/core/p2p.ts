export type P2PRoute =
  | "automatic"
  | "relay"
  | "wifi-direct"
  | "bluetooth";

export type P2PSettings = {
  preferredRoute: P2PRoute;
  allowDirect: boolean;
  hideDirectAddress: boolean;
};

export const defaultP2PSettings: P2PSettings = {
  preferredRoute: "automatic",
  allowDirect: false,
  hideDirectAddress: true,
};

export interface NearbyTransport {
  discover(): Promise<string[]>;
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
}

/**
 * Expo-safe transport boundary.
 *
 * It deliberately reports that native discovery is unavailable instead
 * of pretending Bluetooth/Wi-Fi Direct exists in Expo Go.
 */
export class NativeP2PTransport implements NearbyTransport {
  async discover(): Promise<string[]> {
    throw new Error(
      "Nearby discovery requires a native development build.",
    );
  }

  async connect(_peerId: string): Promise<void> {
    throw new Error(
      "Nearby connections require a native development build.",
    );
  }

  async disconnect(_peerId: string): Promise<void> {
    return;
  }
}

export function isNativeP2PAvailable(): boolean {
  return false;
}
