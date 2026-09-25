import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

export type StoredAccount = {
  username: string;
  salt: string;
  verifier: string;
};

export type AccountInfo = {
  username: string;
};

const ACCOUNT_KEY = "nexchat.account.credentials.v1";
const SESSION_KEY = "nexchat.account.session.v1";

const ITERATIONS = 12000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveVerifier(
  password: string,
  salt: string
): Promise<string> {
  let value = `${salt}:${password}`;

  for (let i = 0; i < ITERATIONS; i++) {
    value = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value
    );
  }

  return value;
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function getAccount(): Promise<AccountInfo | null> {
  const raw = await AsyncStorage.getItem(ACCOUNT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const account = JSON.parse(raw) as StoredAccount;

    if (
      !account ||
      typeof account.username !== "string" ||
      typeof account.salt !== "string" ||
      typeof account.verifier !== "string"
    ) {
      return null;
    }

    return {
      username: account.username,
    };
  } catch {
    return null;
  }
}

export async function hasAccount(): Promise<boolean> {
  return (await getAccount()) !== null;
}

export async function createAccount(
  username: string,
  password: string
): Promise<void> {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    throw new Error("Choose a username.");
  }

  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    throw new Error(
      "Username must be 3–20 characters using lowercase letters, numbers and underscores."
    );
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (await hasAccount()) {
    throw new Error("A NexChat account already exists on this device.");
  }

  const salt = bytesToHex(Crypto.getRandomBytes(16));
  const verifier = await deriveVerifier(password, salt);

  const account: StoredAccount = {
    username: normalized,
    salt,
    verifier,
  };

  await AsyncStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify(account)
  );

  await AsyncStorage.setItem(SESSION_KEY, "authenticated");
}

export async function login(
  username: string,
  password: string
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ACCOUNT_KEY);

  if (!raw) {
    return false;
  }

  let account: StoredAccount;

  try {
    account = JSON.parse(raw) as StoredAccount;
  } catch {
    return false;
  }

  if (
    !account ||
    typeof account.username !== "string" ||
    typeof account.salt !== "string" ||
    typeof account.verifier !== "string"
  ) {
    return false;
  }

  const normalized = normalizeUsername(username);

  if (normalized !== account.username) {
    return false;
  }

  const verifier = await deriveVerifier(
    password,
    account.salt
  );

  if (verifier !== account.verifier) {
    return false;
  }

  await AsyncStorage.setItem(
    SESSION_KEY,
    "authenticated"
  );

  return true;
}

export async function isAuthenticated(): Promise<boolean> {
  return (
    (await AsyncStorage.getItem(SESSION_KEY)) ===
    "authenticated"
  );
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function getAccountUsername(): Promise<string | null> {
  const account = await getAccount();
  return account?.username ?? null;
}

export async function deleteAccount(): Promise<void> {
  await AsyncStorage.multiRemove([
    ACCOUNT_KEY,
    SESSION_KEY,
  ]);
}
