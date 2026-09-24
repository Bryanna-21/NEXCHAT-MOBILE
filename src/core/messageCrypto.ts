import nacl from "tweetnacl";
import { getMessagingKeyPair } from "./identity";

export type EncryptedMessagePayload = {
  version: 1;
  algorithm: "X25519-XSalsa20-Poly1305";
  senderPublicKey: string;
  nonce: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length))
    );
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export async function encryptMessagePayload(
  plaintext: Uint8Array,
  recipientPublicKeyBase64: string,
): Promise<Uint8Array> {
  const recipientPublicKey =
    base64ToBytes(recipientPublicKeyBase64);

  if (
    recipientPublicKey.length !==
    nacl.box.publicKeyLength
  ) {
    throw new Error(
      "Invalid recipient messaging public key."
    );
  }

  const { publicKey, secretKey } =
    await getMessagingKeyPair();

  const nonce = nacl.randomBytes(
    nacl.box.nonceLength
  );

  const ciphertext = nacl.box(
    plaintext,
    nonce,
    recipientPublicKey,
    secretKey,
  );

  const envelope: EncryptedMessagePayload = {
    version: 1,
    algorithm: "X25519-XSalsa20-Poly1305",
    senderPublicKey:
      bytesToBase64(publicKey),
    nonce:
      bytesToBase64(nonce),
    ciphertext:
      bytesToBase64(ciphertext),
  };

  return new TextEncoder().encode(
    JSON.stringify(envelope)
  );
}

export async function decryptMessagePayload(
  encryptedPayload: Uint8Array,
): Promise<Uint8Array> {
  let envelope: EncryptedMessagePayload;

  try {
    envelope = JSON.parse(
      new TextDecoder().decode(encryptedPayload)
    ) as EncryptedMessagePayload;
  } catch {
    throw new Error(
      "Encrypted NexChat message payload is invalid."
    );
  }

  if (
    envelope.version !== 1 ||
    envelope.algorithm !==
      "X25519-XSalsa20-Poly1305"
  ) {
    throw new Error(
      "Unsupported NexChat message encryption format."
    );
  }

  const senderPublicKey =
    base64ToBytes(envelope.senderPublicKey);
  const nonce =
    base64ToBytes(envelope.nonce);
  const ciphertext =
    base64ToBytes(envelope.ciphertext);

  if (
    senderPublicKey.length !==
    nacl.box.publicKeyLength
  ) {
    throw new Error(
      "Invalid sender messaging public key."
    );
  }

  if (
    nonce.length !==
    nacl.box.nonceLength
  ) {
    throw new Error(
      "Invalid NexChat message nonce."
    );
  }

  if (
    ciphertext.length <=
    nacl.box.overheadLength
  ) {
    throw new Error(
      "Invalid NexChat encrypted payload."
    );
  }

  const { secretKey } =
    await getMessagingKeyPair();

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    senderPublicKey,
    secretKey,
  );

  if (!plaintext) {
    throw new Error(
      "NexChat message authentication failed."
    );
  }

  return plaintext;
}
