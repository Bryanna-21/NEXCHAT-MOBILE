import { Identity } from "./identity";

const PREFIX = "NEXCHAT_CONTACT_V1:";

export type NexChatQRContact = {
  id: string;
  displayName: string;
  username?: string;
  avatarUri?: string;
};

export function createContactQR(identity: Identity): string {
  const payload: NexChatQRContact = {
    id: identity.id,
    displayName: identity.displayName,
    username: identity.username,
    avatarUri: identity.avatarUri,
  };

  return `${PREFIX}${JSON.stringify(payload)}`;
}

export function parseContactQR(data: string): NexChatQRContact {
  if (!data.startsWith(PREFIX)) {
    throw new Error("This is not a valid NexChat contact QR code.");
  }

  const raw = data.slice(PREFIX.length);

  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("The NexChat QR code is corrupted.");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as any).id !== "string" ||
    typeof (payload as any).displayName !== "string"
  ) {
    throw new Error("The NexChat QR code contains invalid contact data.");
  }

  return payload as NexChatQRContact;
}
