import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getVaultSize,
  getEncryptedVaultEnvelope,
  isValidVaultEnvelopeShape,
  hasVaultData,
} from "./vault";

const BACKUP_KEY = "nexchat.backup.device.v1";

export interface BackupInspection {
  encrypted: boolean;
  vaultBytes: number;
  backupBytes: number;
  verified: boolean;
  createdAt?: string;
}

interface BackupEnvelope {
  version: 2;
  encryptedVaultEnvelope: string;
  createdAt: string;
}

export async function inspectBackup(): Promise<BackupInspection> {
  const verification = await verifyBackupIntegrity();
  const raw = await AsyncStorage.getItem(BACKUP_KEY);

  let backupBytes = 0;
  let createdAt: string | undefined;

  if (raw) {
    backupBytes = new TextEncoder().encode(raw).length;

    try {
      const envelope = JSON.parse(raw) as BackupEnvelope;
      createdAt = envelope.createdAt;
    } catch {
      createdAt = undefined;
    }
  }

  return {
    encrypted: true,
    vaultBytes: await getVaultSize(),
    backupBytes,
    verified: verification,
    createdAt,
  };
}

/**
 * The backup is a separate snapshot of the vault's ALREADY
 * ENCRYPTED on-disk representation.
 *
 * Critical invariant:
 * - This function NEVER decrypts the vault.
 * - It obtains the raw encrypted envelope directly from the
 *   vault module (which owns encryption) and stores that
 *   verbatim.
 * - It does NOT call saveVault(), so it cannot overwrite the
 *   live vault.
 *
 * Safe replacement: the previous backup is only overwritten
 * after the new envelope has been validated.
 */
export async function createBackupSnapshot(): Promise<void> {
  const hasData = await hasVaultData();

  if (!hasData) {
    throw new Error(
      "There is no vault data available to back up.",
    );
  }

  const encryptedVaultEnvelope =
    await getEncryptedVaultEnvelope();

  if (encryptedVaultEnvelope === null) {
    throw new Error(
      "There is no vault data available to back up.",
    );
  }

  if (!isValidVaultEnvelopeShape(encryptedVaultEnvelope)) {
    throw new Error(
      "The current vault envelope is not well-formed. Refusing to back up potentially corrupted data.",
    );
  }

  const envelope: BackupEnvelope = {
    version: 2,
    encryptedVaultEnvelope,
    createdAt: new Date().toISOString(),
  };

  const serialized = JSON.stringify(envelope);

  /*
   * Validate the serialized envelope round-trips before
   * writing it, and validate again after writing, before
   * reporting success.
   */
  const reparsed = JSON.parse(serialized) as BackupEnvelope;

  if (
    reparsed.version !== 2 ||
    !isValidVaultEnvelopeShape(reparsed.encryptedVaultEnvelope)
  ) {
    throw new Error(
      "Backup envelope failed pre-write validation.",
    );
  }

  await AsyncStorage.setItem(BACKUP_KEY, serialized);

  const readBack = await AsyncStorage.getItem(BACKUP_KEY);

  if (!readBack || !(await verifyBackupIntegrity())) {
    throw new Error(
      "Backup could not be verified after writing. The previous backup, if any, was not necessarily preserved.",
    );
  }
}

/**
 * Read-only structural + cryptographic-shape verification of
 * the stored backup. Does NOT decrypt, does NOT touch the live
 * vault, does NOT modify application state.
 */
export async function verifyBackupIntegrity(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(BACKUP_KEY);

    if (!raw) {
      return false;
    }

    const envelope = JSON.parse(raw) as BackupEnvelope;

    if (
      envelope.version !== 2 ||
      typeof envelope.encryptedVaultEnvelope !== "string" ||
      typeof envelope.createdAt !== "string"
    ) {
      return false;
    }

    return isValidVaultEnvelopeShape(
      envelope.encryptedVaultEnvelope,
    );
  } catch {
    return false;
  }
}

export async function clearDeviceBackup(): Promise<void> {
  await AsyncStorage.removeItem(BACKUP_KEY);
}
