import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  getVaultSize,
  getEncryptedVaultEnvelope,
  isValidVaultEnvelopeShape,
  hasVaultData,
  restoreVaultFromEncryptedEnvelope,
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

/**
 * Parse and structurally validate a raw backup envelope string,
 * whether it came from AsyncStorage or an imported file. Returns
 * null (never throws) on anything malformed, so callers can give
 * the person a clean error instead of a crash.
 */
function parseAndValidateEnvelope(raw: string): BackupEnvelope | null {
  try {
    const envelope = JSON.parse(raw) as BackupEnvelope;

    if (
      envelope.version !== 2 ||
      typeof envelope.encryptedVaultEnvelope !== "string" ||
      typeof envelope.createdAt !== "string" ||
      !isValidVaultEnvelopeShape(envelope.encryptedVaultEnvelope)
    ) {
      return null;
    }

    return envelope;
  } catch {
    return null;
  }
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
  const raw = await AsyncStorage.getItem(BACKUP_KEY);
  if (!raw) return false;

  return parseAndValidateEnvelope(raw) !== null;
}

export async function clearDeviceBackup(): Promise<void> {
  await AsyncStorage.removeItem(BACKUP_KEY);
}

/**
 * Restore the live vault from the stored device backup.
 *
 * This inspects and validates the backup envelope, then hands
 * the still-encrypted contents to the vault module for the
 * actual decrypt-and-verify restore. It never decrypts
 * anything itself.
 *
 * Existing vault data is only replaced after the vault module
 * confirms the restored data is valid and readable. On any
 * failure, the previous vault state is preserved automatically
 * by restoreVaultFromEncryptedEnvelope's rollback.
 */
export async function restoreFromBackup(): Promise<void> {
  const raw = await AsyncStorage.getItem(BACKUP_KEY);

  if (!raw) {
    throw new Error(
      "No backup is available to restore.",
    );
  }

  const envelope = parseAndValidateEnvelope(raw);

  if (!envelope) {
    throw new Error(
      "The stored backup is corrupted or in an unsupported format.",
    );
  }

  await restoreVaultFromEncryptedEnvelope(
    envelope.encryptedVaultEnvelope,
  );
}

/**
 * Cloud backup, honestly scoped: NexChat has no server of its
 * own to sync to, so "cloud backup" here means writing the same
 * encrypted envelope createBackupSnapshot() produces to a plain
 * file, then handing that file to the OS share sheet so the
 * person can save it into whichever cloud app they already have
 * (Drive, Dropbox, iCloud Files, etc). The file contains the
 * SAME already-encrypted vault envelope as the on-device backup
 * -- this function never decrypts anything, and the exported
 * file is exactly as safe (or unsafe) at rest as the on-device
 * backup is.
 *
 * A fresh snapshot is taken first so the exported file always
 * reflects current data, without disturbing whatever on-device
 * backup already existed if snapshotting fails partway.
 */
export async function exportBackupToFile(): Promise<string> {
  await createBackupSnapshot();

  const raw = await AsyncStorage.getItem(BACKUP_KEY);

  if (!raw || !parseAndValidateEnvelope(raw)) {
    throw new Error(
      "No valid backup is available to export.",
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${FileSystem.cacheDirectory}nexchat-backup-${timestamp}.json`;

  await FileSystem.writeAsStringAsync(path, raw);

  return path;
}

/**
 * Restore the live vault from a previously exported backup file
 * (picked from Files, Drive, Dropbox, etc via the document
 * picker). The file's contents are validated with the exact same
 * structural checks as an on-device backup before anything is
 * handed to the vault module, and the vault module's own
 * decrypt-and-verify + rollback behavior applies identically --
 * an untrusted or corrupted file cannot damage the live vault.
 *
 * This does NOT touch the separate on-device backup snapshot, so
 * importing a file from another device never overwrites this
 * device's own backup history.
 */
export async function importBackupFromFile(fileUri: string): Promise<void> {
  let raw: string;

  try {
    raw = await FileSystem.readAsStringAsync(fileUri);
  } catch {
    throw new Error(
      "Couldn't read the selected file.",
    );
  }

  const envelope = parseAndValidateEnvelope(raw);

  if (!envelope) {
    throw new Error(
      "This file isn't a valid NexChat backup, or is corrupted.",
    );
  }

  await restoreVaultFromEncryptedEnvelope(
    envelope.encryptedVaultEnvelope,
  );
}
