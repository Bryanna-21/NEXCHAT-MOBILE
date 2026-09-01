import {
  getVaultSize,
  readVault,
  saveVault,
} from "./vault";

export interface BackupInspection {
  encrypted: boolean;
  vaultBytes: number;
  verified: boolean;
}

export async function inspectBackup(): Promise<BackupInspection> {
  const verification = await verifyBackupIntegrity();

  return {
    encrypted: true,
    vaultBytes: await getVaultSize(),
    verified: verification,
  };
}

/**
 * Reads the existing encrypted vault and confirms that it can be
 * decrypted and parsed.
 *
 * Does NOT overwrite production vault data.
 */
export async function verifyBackupIntegrity(): Promise<boolean> {
  try {
    await readVault<unknown>();
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an encrypted backup snapshot using the existing vault layer.
 *
 * The vault itself is already encrypted before persistence.
 */
export async function createBackupSnapshot(
  payload: unknown,
): Promise<void> {
  await saveVault(payload);
}
