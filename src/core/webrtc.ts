export interface WebRTCOffer {
  type: "offer" | "answer";
  sdp: string;
}

export interface ICECandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface WebRTCTransport {
  initialize(video: boolean): Promise<void>;

  createOffer(): Promise<WebRTCOffer>;

  createAnswer(): Promise<WebRTCOffer>;

  setRemoteDescription(
    description: WebRTCOffer,
  ): Promise<void>;

  addIceCandidate(
    candidate: ICECandidate,
  ): Promise<void>;

  close(): Promise<void>;

  isConnected(): boolean;
}

/**
 * Expo-safe boundary.
 *
 * This implementation intentionally refuses to claim
 * that a media connection exists.
 */
export class UnavailableWebRTCTransport
  implements WebRTCTransport
{
  async initialize(
    _video: boolean,
  ): Promise<void> {
    throw new Error(
      "WebRTC requires the NexChat native development build.",
    );
  }

  async createOffer(): Promise<WebRTCOffer> {
    throw new Error(
      "WebRTC requires the NexChat native development build.",
    );
  }

  async createAnswer(): Promise<WebRTCOffer> {
    throw new Error(
      "WebRTC requires the NexChat native development build.",
    );
  }

  async setRemoteDescription(
    _description: WebRTCOffer,
  ): Promise<void> {
    throw new Error(
      "WebRTC requires the NexChat native development build.",
    );
  }

  async addIceCandidate(
    _candidate: ICECandidate,
  ): Promise<void> {
    throw new Error(
      "WebRTC requires the NexChat native development build.",
    );
  }

  async close(): Promise<void> {
    return;
  }

  isConnected(): boolean {
    return false;
  }
}
