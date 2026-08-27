import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const PASSCODE_HASH_KEY = "nexchat.security.passcode.hash.v1";
const RECOVERY_KEY = "nexchat.security.recovery.v1";
const BIOMETRIC_KEY = "nexchat.security.biometric.v1";

async function hash(value: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value
  );
}

export async function setPasscode(passcode: string): Promise<void> {
  if (!passcode.trim()) throw new Error("Passcode cannot be empty.");
  await SecureStore.setItemAsync(PASSCODE_HASH_KEY, await hash(passcode));
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PASSCODE_HASH_KEY);
  if (!stored) return false;
  return stored === await hash(passcode);
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
