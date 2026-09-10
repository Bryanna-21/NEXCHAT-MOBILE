import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";

const PASSCODE_HASH_KEY = "nexchat.security.passcode.hash.v1";
const RECOVERY_KEY = "nexchat.security.recovery.v1";
const BIOMETRIC_KEY = "nexchat.security.biometric.v1";

/*
 * Passcode storage format.
 *
 * v1 (legacy): a single unsalted SHA-256 hex digest of the raw
 * passcode. Two users with the same passcode produced identical
 * stored values, one hash round gave no real resistance to
 * offline brute force if the stored value were ever extracted,
 * and there was no per-install randomness at all.
 *
 * v2 (current): every passcode gets its own random salt and is
 * stretched through many rounds of SHA-512 before anything
 * touches disk:
 *
 *   "nxc2:" + iterations + ":" + base64(salt) + ":" + base64(derivedKey)
 *
 * This is a hand-rolled iterated hash (salt || passcode, hashed,
 * then re-hashed together with the salt and passcode each round),
 * not a standards-body KDF like PBKDF2 or Argon2 -- Expo Go has
 * no native KDF primitive available without a custom dev client,
 * and adding one would mean ejecting from Expo Go, which is out
 * of scope here. It is, however, a real and meaningful upgrade
 * over a single unsalted round: unique salts defeat rainbow
 * tables and reveal nothing about matching passcodes across
 * installs, and the iteration count makes brute force materially
 * more expensive. The iteration count is centralized in one
 * constant so it can be raised later without changing the
 * storage format.
 *
 * Existing v1 hashes keep working: verifyPasscode() recognizes
 * the old bare-hex format, checks it the old way, and -- only on
 * a successful match, since that's the only moment the plaintext
 * passcode is available -- silently re-saves it in v2 format.
 * Nobody is locked out by this change.
 */

const V2_PREFIX = "nxc2";
const V2_ITERATIONS = 50_000;
const SALT_BYTES = 16;

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

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value.normalize("NFKC"));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }

  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

function deriveKeyV2(
  passcode: string,
  salt: Uint8Array,
  iterations: number
): Uint8Array {
  const passcodeBytes = utf8Bytes(passcode);
  let state = nacl.hash(concatBytes(salt, passcodeBytes));

  for (let i = 1; i < iterations; i++) {
    state = nacl.hash(concatBytes(state, salt, passcodeBytes));
  }

  return state;
}

async function hashV2(passcode: string): Promise<string> {
  const salt = await Crypto.getRandomBytesAsync(SALT_BYTES);
  const derived = deriveKeyV2(passcode, salt, V2_ITERATIONS);

  return [
    V2_PREFIX,
    String(V2_ITERATIONS),
    bytesToBase64(salt),
    bytesToBase64(derived),
  ].join(":");
}

function verifyV2(passcode: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== V2_PREFIX) return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;

  try {
    salt = base64ToBytes(parts[2]);
    expected = base64ToBytes(parts[3]);
  } catch {
    return false;
  }

  const actual = deriveKeyV2(passcode, salt, iterations);
  return constantTimeEqual(actual, expected);
}

// Legacy v1: a single unsalted SHA-256 hex digest, e.g.
// "3f786850e387550fdab836ed7e6dc881de23001b".padEnd(64, "0")-shaped.
async function hashV1Legacy(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function isLegacyV1Hash(stored: string): boolean {
  return /^[0-9a-f]{64}$/i.test(stored);
}

export async function setPasscode(passcode: string): Promise<void> {
  if (!passcode.trim()) throw new Error("Passcode cannot be empty.");
  await SecureStore.setItemAsync(PASSCODE_HASH_KEY, await hashV2(passcode));
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PASSCODE_HASH_KEY);
  if (!stored) return false;

  if (stored.startsWith(`${V2_PREFIX}:`)) {
    return verifyV2(passcode, stored);
  }

  if (isLegacyV1Hash(stored)) {
    const matches = stored === (await hashV1Legacy(passcode));

    if (matches) {
      // Successful login with the old format -- this is the one
      // moment we have the plaintext passcode, so upgrade the
      // stored hash to v2 in place.
      await SecureStore.setItemAsync(PASSCODE_HASH_KEY, await hashV2(passcode));
    }

    return matches;
  }

  return false;
}

export async function hasPasscode(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PASSCODE_HASH_KEY)) !== null;
}

export async function clearPasscode(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSCODE_HASH_KEY);
}

async function createRecoveryCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(12);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .match(/.{1,4}/g)!
    .join("-")
    .toUpperCase();
}

export async function getRecoveryCode(): Promise<string> {
  let code = await SecureStore.getItemAsync(RECOVERY_KEY);

  if (!code) {
    code = await createRecoveryCode();
    await SecureStore.setItemAsync(RECOVERY_KEY, code);
  }

  return code;
}

export async function resetPasscodeWithRecovery(
  recovery: string,
  newPasscode: string
): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(RECOVERY_KEY);

  if (!stored || stored.toUpperCase() !== recovery.trim().toUpperCase()) {
    return false;
  }

  await setPasscode(newPasscode);
  return true;
}

export async function isBiometricEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_KEY);
  return value === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hardware || !enrolled) {
      throw new Error("Biometric authentication is not available or enrolled.");
    }
  }

  await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? "true" : "false");
}

export async function authenticateBiometric(): Promise<boolean> {
  const enabled = await isBiometricEnabled();

  if (!enabled) return false;

  const hardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hardware || !enrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock NexChat",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });

  return result.success;
}
