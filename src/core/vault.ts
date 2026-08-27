import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import { fromByteArray, toByteArray } from "base64-js";

const KEY_NAME = "nexchat.vault.key.v1";
const DATA_KEY = "nexchat.vault.payload.v1";

type VaultEnvelope = {
  version: 1;
  algorithm: "XSalsa20-Poly1305";
  nonce: string;
  ciphertext: string;
};

async function getKey(): Promise<Uint8Array> {
  let encoded = await SecureStore.getItemAsync(KEY_NAME);

  if (!encoded) {
    const bytes = Crypto.getRandomBytes(32);
    encoded = fromByteArray(bytes);

    await SecureStore.setItemAsync(KEY_NAME, encoded, {
      requireAuthentication: false,
    });
  }

  const key = toByteArray(encoded);

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
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  const envelope: VaultEnvelope = {
    version: 1,
    algorithm: "XSalsa20-Poly1305",
    nonce: fromByteArray(nonce),
    ciphertext: fromByteArray(ciphertext),
  };

  await AsyncStorage.setItem(DATA_KEY, JSON.stringify(envelope));
}

export async function readVault<T>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(DATA_KEY);

  if (!raw) {
    return null;
  }

  let envelope: VaultEnvelope;

  try {
    envelope = JSON.parse(raw) as VaultEnvelope;
  } catch {
    throw new Error("NexChat vault data is corrupted.");
  }

  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "XSalsa20-Poly1305" ||
    !envelope.nonce ||
    !envelope.ciphertext
  ) {
    throw new Error("Unsupported NexChat vault format.");
  }

  const key = await getKey();

  const plaintext = nacl.secretbox.open(
    toByteArray(envelope.ciphertext),
    toByteArray(envelope.nonce),
    key
  );

  if (!plaintext) {
    throw new Error("Vault authentication failed.");
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new Error("NexChat vault payload is invalid.");
  }
}

export async function hasVaultData(): Promise<boolean> {
  return (await AsyncStorage.getItem(DATA_KEY)) !== null;
}

export async function getVaultSize(): Promise<number> {
  const raw = await AsyncStorage.getItem(DATA_KEY);
  return raw ? new TextEncoder().encode(raw).length : 0;
}

export async function verifyVault(): Promise<boolean> {
  try {
    const exists = await hasVaultData();

    if (!exists) {
      await saveVault({ __vaultCheck: true });
      const result = await readVault<{ __vaultCheck?: boolean }>();

      if (!result?.__vaultCheck) {
        return false;
      }

      await AsyncStorage.removeItem(DATA_KEY);
      return true;
    }

    await readVault();
    return true;
  } catch {
    return false;
  }
}

export async function clearVault(): Promise<void> {
  await AsyncStorage.removeItem(DATA_KEY);
  await SecureStore.deleteItemAsync(KEY_NAME);
}
