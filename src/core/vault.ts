import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";

const DATA_KEY = "nexchat.vault.data.v2";
const KEY_NAME = "nexchat.vault.key.v2";

type VaultEnvelope = {
  version: 2;
  algorithm: "XSalsa20-Poly1305";
  nonce: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
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

async function getKey(): Promise<Uint8Array> {
  let encoded = await SecureStore.getItemAsync(KEY_NAME);

  if (!encoded) {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);
    encoded = bytesToBase64(key);

    await SecureStore.setItemAsync(KEY_NAME, encoded, {
      requireAuthentication: false,
    });
  }

  const key = base64ToBytes(encoded);

  if (key.length !== nacl.secretbox.keyLength) {
    throw new Error("Invalid NexChat vault key.");
  }

  return key;
}

export async function initVault(): Promise<void> {
  await getKey();
}

export async function saveVault(value: unknown): Promise<void> {
  const key = await getKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = nacl.secretbox(
    plaintext,
    nonce,
    key,
  );

  const envelope: VaultEnvelope = {
    version: 2,
    algorithm: "XSalsa20-Poly1305",
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };

  await AsyncStorage.setItem(
    DATA_KEY,
    JSON.stringify(envelope),
  );
}

export async function readVault<T>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(DATA_KEY);

  if (!raw) return null;

  let envelope: VaultEnvelope;

  try {
    envelope = JSON.parse(raw) as VaultEnvelope;
  } catch {
    throw new Error("NexChat vault data is corrupted.");
  }

  if (
    envelope.version !== 2 ||
    envelope.algorithm !== "XSalsa20-Poly1305"
  ) {
    throw new Error("Unsupported NexChat vault format.");
  }

  const key = await getKey();

  const nonce = base64ToBytes(envelope.nonce);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  if (nonce.length !== nacl.secretbox.nonceLength) {
    throw new Error("Invalid NexChat vault nonce.");
  }

  const plaintext = nacl.secretbox.open(
    ciphertext,
    nonce,
    key,
  );

  if (!plaintext) {
    throw new Error("Vault authentication failed.");
  }

  try {
    return JSON.parse(
      new TextDecoder().decode(plaintext),
    ) as T;
  } catch {
    throw new Error("NexChat vault payload is invalid.");
  }
}

export async function hasVaultData(): Promise<boolean> {
  return (await AsyncStorage.getItem(DATA_KEY)) !== null;
}

export async function getVaultSize(): Promise<number> {
  const raw = await AsyncStorage.getItem(DATA_KEY);

  if (!raw) return 0;

  return new TextEncoder().encode(raw).length;
}

export async function verifyVault(): Promise<boolean> {
  try {
    const data = await readVault<unknown>();

    /*
     * An empty vault is valid if there is no stored payload.
     * If data exists, successful authenticated decryption is enough
     * to prove the vault can currently be opened.
     */
    return data !== null;
  } catch {
    return false;
  }
}

export async function clearVault(): Promise<void> {
  await AsyncStorage.removeItem(DATA_KEY);
  await SecureStore.deleteItemAsync(KEY_NAME);
}
