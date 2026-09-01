import {
  createBackupSnapshot,
} from "./backup";

export type BackupSchedule =
  | "off"
  | "daily"
  | "weekly"
  | "monthly";

export interface BackupScheduleConfig {
  enabled: boolean;
  schedule: BackupSchedule;
  destination:
    | "device"
    | "trusted-device"
    | "cloud";
}

export interface BackupRunResult {
  startedAt: string;
  completedAt: string;
  success: boolean;
  error?: string;
}

/*
 * This module intentionally holds NO mutable state of its own.
 *
 * "Last run" information must be supplied by the caller (read
 * from persisted settings) and the outcome of a run must be
 * written back by the caller into persisted storage. Module-
 * level state does not survive an app restart, which made the
 * previous version of this scheduler silently reset to "never
 * run" every time the app relaunched.
 *
 * This is foreground-only scheduling: it only runs when the
 * app is open and this check is explicitly invoked (e.g. on
 * launch). There is no OS-level background task registered in
 * this Expo configuration, so a backup will NOT run while the
 * app is closed or backgrounded. That is a real platform
 * limitation, not something this module fakes around.
 */

export function shouldRunBackup(
  config: BackupScheduleConfig,
  lastRunAt: string | null,
  now = new Date(),
): boolean {
  if (
    !config.enabled ||
    config.schedule === "off"
  ) {
    return false;
  }

  if (!lastRunAt) {
    return true;
  }

  const last = new Date(lastRunAt);

  if (Number.isNaN(last.getTime())) {
    return true;
  }

  switch (config.schedule) {
    case "daily":
      return (
        now.getTime() -
          last.getTime() >=
        24 * 60 * 60 * 1000
      );

    case "weekly":
      return (
        now.getTime() -
          last.getTime() >=
        7 * 24 * 60 * 60 * 1000
      );

    case "monthly":
      return (
        now.getUTCFullYear() >
          last.getUTCFullYear() ||
        (
          now.getUTCFullYear() ===
            last.getUTCFullYear() &&
          now.getUTCMonth() >
            last.getUTCMonth()
        )
      );

    default:
      return false;
  }
}

export async function runBackup(
  config: BackupScheduleConfig,
): Promise<BackupRunResult> {
  const startedAt =
    new Date().toISOString();

  if (
    !config.enabled ||
    config.schedule === "off"
  ) {
    return {
      startedAt,
      completedAt:
        new Date().toISOString(),
      success: false,
      error:
        "Automatic backup is disabled.",
    };
  }

  if (config.destination !== "device") {
    return {
      startedAt,
      completedAt:
        new Date().toISOString(),
      success: false,
      error:
        `${config.destination} backup is not implemented yet.`,
    };
  }

  try {
    await createBackupSnapshot();

    return {
      startedAt,
      completedAt:
        new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    return {
      startedAt,
      completedAt:
        new Date().toISOString(),
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Backup failed.",
    };
  }
}
