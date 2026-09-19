import * as FileSystem from "expo-file-system/legacy";

export interface StoredAttachment {
  id: string;
  type:
    | "image"
    | "video"
    | "audio"
    | "file";
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

const ROOT =
  `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}nexchat-attachments/`;

async function ensureRoot(): Promise<void> {
  if (!ROOT) {
    throw new Error(
      "NexChat attachment storage directory is unavailable.",
    );
  }

  const info =
    await FileSystem.getInfoAsync(ROOT);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(
      ROOT,
      {
        intermediates: true,
      },
    );
  }
}

function sanitize(
  value: string,
): string {
  return value.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
}

function attachmentUri(
  id: string,
): string {
  return `${ROOT}${sanitize(id)}`;
}

export async function storeAttachment(
  attachment: StoredAttachment,
): Promise<StoredAttachment> {
  await ensureRoot();

  const destination =
    attachmentUri(attachment.id);

  if (attachment.uri === destination) {
    const existing =
      await FileSystem.getInfoAsync(
        destination,
      );

    if (!existing.exists) {
      throw new Error(
        "Attachment storage record points to a missing file.",
      );
    }

    return {
      ...attachment,
      uri: destination,
    };
  }

  const sourceInfo =
    await FileSystem.getInfoAsync(
      attachment.uri,
    );

  if (!sourceInfo.exists) {
    throw new Error(
      "Selected attachment is no longer available.",
    );
  }

  const destinationInfo =
    await FileSystem.getInfoAsync(
      destination,
    );

  if (destinationInfo.exists) {
    throw new Error(
      "Attachment storage collision detected.",
    );
  }

  await FileSystem.copyAsync({
    from: attachment.uri,
    to: destination,
  });

  const copiedInfo =
    await FileSystem.getInfoAsync(
      destination,
    );

  if (!copiedInfo.exists) {
    throw new Error(
      "Attachment copy could not be verified.",
    );
  }

  return {
    ...attachment,
    uri: destination,
  };
}

export async function attachmentExists(
  id: string,
): Promise<boolean> {
  await ensureRoot();

  const info =
    await FileSystem.getInfoAsync(
      attachmentUri(id),
    );

  return info.exists;
}

export async function deleteAttachment(
  id: string,
): Promise<void> {
  await ensureRoot();

  const uri =
    attachmentUri(id);

  const info =
    await FileSystem.getInfoAsync(uri);

  if (info.exists) {
    await FileSystem.deleteAsync(
      uri,
      {
        idempotent: true,
      },
    );
  }
}

export async function getAttachmentUri(
  id: string,
): Promise<string | null> {
  await ensureRoot();

  const uri =
    attachmentUri(id);

  const info =
    await FileSystem.getInfoAsync(uri);

  return info.exists ? uri : null;
}
