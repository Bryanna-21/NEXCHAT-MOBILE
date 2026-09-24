import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";

export type Identity = {
  id: string;
  displayName: string;
  username: string;
  publicKey: string;
  avatarUri?: string;
  bio?: string;
  website?: string;
  location?: string;
  pronouns?: string;
  joinedAt?: string;
};

const KEY = "nexchat.identity.v1";
const PRIVATE_KEY = "nexchat.identity.messaging.private-key.v1";

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

async function ensureMessagingKeyPair(): Promise<string> {
  const existingPrivateKey =
    await SecureStore.getItemAsync(PRIVATE_KEY);

  if (existingPrivateKey) {
    const privateKey = base64ToBytes(existingPrivateKey);

    if (privateKey.length !== nacl.box.secretKeyLength) {
      throw new Error("Invalid NexChat messaging private key.");
    }

    const publicKey =
      nacl.box.keyPair.fromSecretKey(privateKey).publicKey;

    return bytesToBase64(publicKey);
  }

  const keyPair = nacl.box.keyPair();

  await SecureStore.setItemAsync(
    PRIVATE_KEY,
    bytesToBase64(keyPair.secretKey),
    {
      requireAuthentication: false,
    }
  );

  return bytesToBase64(keyPair.publicKey);
}

function makeId() {
  const b = Crypto.getRandomBytes(8);

  return `N-${Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 4)}-${Array.from(Crypto.getRandomBytes(4))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 4)}-${Math.floor(10 + Math.random() * 90)}`;
}

export async function initIdentity() {
  const existing = await AsyncStorage.getItem(KEY);

  if (!existing) {
    const publicKey = await ensureMessagingKeyPair();

    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        id: makeId(),
        displayName: "NexChat User",
        username: "user",
        publicKey,
        bio: "",
        website: "",
        location: "",
        pronouns: "",
        joinedAt: new Date().toISOString(),
      })
    );

    return;
  }

  const identity = JSON.parse(existing) as Partial<Identity>;
  const publicKey =
    typeof identity.publicKey === "string" &&
    identity.publicKey.length > 0
      ? identity.publicKey
      : await ensureMessagingKeyPair();

  if (identity.publicKey !== publicKey) {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        ...identity,
        publicKey,
      })
    );
  } else {
    await ensureMessagingKeyPair();
  }
}

export async function getIdentity(): Promise<Identity> {
  const raw = await AsyncStorage.getItem(KEY);

  if (raw) {
    const identity = JSON.parse(raw) as Identity;

    const publicKey = await ensureMessagingKeyPair();

    let changed = false;

    if (!identity.publicKey) {
      identity.publicKey = publicKey;
      changed = true;
    }

    if (!identity.joinedAt) {
      identity.joinedAt = new Date().toISOString();
      changed = true;
    }

    if (changed) {
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify(identity)
      );
    }

    return identity;
  }

  await initIdentity();

  return JSON.parse((await AsyncStorage.getItem(KEY))!);
}

export async function getMessagingKeyPair(): Promise<{
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}> {
  await initIdentity();

  const encoded = await SecureStore.getItemAsync(PRIVATE_KEY);

  if (!encoded) {
    throw new Error(
      "NexChat messaging private key is missing."
    );
  }

  const secretKey = base64ToBytes(encoded);

  if (secretKey.length !== nacl.box.secretKeyLength) {
    throw new Error(
      "Invalid NexChat messaging private key."
    );
  }

  const publicKey =
    nacl.box.keyPair.fromSecretKey(secretKey).publicKey;

  return {
    publicKey,
    secretKey,
  };
}

export async function updateIdentity(patch: Partial<Identity>) {
  const current = await getIdentity();

  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      ...current,
      ...patch,
    })
  );
}
