import { Platform } from "react-native";
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

const WEB_DB_NAME = "nexchat-attachments";
const WEB_STORE_NAME = "attachments";

function sanitize(value: string): string {
  return value.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
}

function attachmentUri(id: string): string {
  return `${ROOT}${sanitize(id)}`;
}

/*
 * WEB ATTACHMENT STORAGE
 *
 * Browser file-picker URIs are blob: URLs and are not durable
 * across reloads. Store the actual Blob in IndexedDB and create
 * a fresh object URL whenever the attachment is retrieved.
 */

function openWebDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      WEB_DB_NAME,
      1,
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
        db.createObjectStore(WEB_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error ||
          new Error(
            "Unable to open NexChat web attachment storage.",
          ),
      );
    };
  });
}

async function webPut(
  id: string,
  blob: Blob,
): Promise<void> {
  const db = await openWebDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      WEB_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      WEB_STORE_NAME,
    ).put(blob, id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ||
          new Error(
            "Unable to store NexChat web attachment.",
          ),
      );
    };
  });
}

async function webGet(
  id: string,
): Promise<Blob | null> {
  const db = await openWebDatabase();

  return new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(
      WEB_STORE_NAME,
      "readonly",
    );

    const request =
      transaction.objectStore(
        WEB_STORE_NAME,
      ).get(id);

    request.onsuccess = () => {
      db.close();
      resolve(
        request.result instanceof Blob
          ? request.result
          : null,
      );
    };

    request.onerror = () => {
      db.close();
      reject(
        request.error ||
          new Error(
            "Unable to read NexChat web attachment.",
          ),
      );
    };
  });
}

async function webDelete(
  id: string,
): Promise<void> {
  const db = await openWebDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      WEB_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      WEB_STORE_NAME,
    ).delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ||
          new Error(
            "Unable to delete NexChat web attachment.",
          ),
      );
    };
  });
}

async function webExists(
  id: string,
): Promise<boolean> {
  return (await webGet(id)) !== null;
}

async function storeWebAttachment(
  attachment: StoredAttachment,
): Promise<StoredAttachment> {
  console.log(
    "[NEXCHAT ATTACHMENT] WEB STORE START",
    {
      id: attachment.id,
      uri: attachment.uri,
      mimeType: attachment.mimeType,
      size: attachment.size,
    },
  );

  const response = await fetch(
    attachment.uri,
  );

  if (!response.ok) {
    throw new Error(
      `Unable to read selected attachment (${response.status}).`,
    );
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error(
      "Selected attachment is empty.",
    );
  }

  await webPut(
    attachment.id,
    blob,
  );

  console.log(
    "[NEXCHAT ATTACHMENT] WEB STORE COMPLETE",
    {
      id: attachment.id,
      size: blob.size,
      type: blob.type,
    },
  );

  return {
    ...attachment,
    /*
     * The URI is intentionally kept as the current object URL.
     * getAttachmentUri() can recreate it after reload.
     */
    uri: URL.createObjectURL(blob),
    size:
      attachment.size ??
      blob.size,
    mimeType:
      attachment.mimeType ||
      blob.type ||
      undefined,
  };
}

async function storeNativeAttachment(
  attachment: StoredAttachment,
): Promise<StoredAttachment> {
  const root = ROOT;

  if (!root) {
    throw new Error(
      "NexChat attachment storage directory is unavailable.",
    );
  }

  const info =
    await FileSystem.getInfoAsync(root);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(
      root,
      {
        intermediates: true,
      },
    );
  }

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

  console.log(
    "[NEXCHAT ATTACHMENT] CHECKING SOURCE",
    {
      uri: attachment.uri,
    },
  );

  const sourceInfo =
    await FileSystem.getInfoAsync(
      attachment.uri,
    );

  console.log(
    "[NEXCHAT ATTACHMENT] SOURCE INFO",
    sourceInfo,
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

  console.log(
    "[NEXCHAT ATTACHMENT] COPY START",
    {
      from: attachment.uri,
      to: destination,
    },
  );

  await FileSystem.copyAsync({
    from: attachment.uri,
    to: destination,
  });

  console.log(
    "[NEXCHAT ATTACHMENT] COPY COMPLETE",
    {
      destination,
    },
  );

  const copiedInfo =
    await FileSystem.getInfoAsync(
      destination,
    );

  console.log(
    "[NEXCHAT ATTACHMENT] DESTINATION INFO",
    copiedInfo,
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

export async function storeAttachment(
  attachment: StoredAttachment,
): Promise<StoredAttachment> {
  console.log(
    "[NEXCHAT ATTACHMENT] STORE START",
    {
      id: attachment.id,
      type: attachment.type,
      uri: attachment.uri,
      mimeType: attachment.mimeType,
      size: attachment.size,
    },
  );

  if (Platform.OS === "web") {
    return storeWebAttachment(
      attachment,
    );
  }

  return storeNativeAttachment(
    attachment,
  );
}

export async function attachmentExists(
  id: string,
): Promise<boolean> {
  if (Platform.OS === "web") {
    return webExists(id);
  }

  const info =
    await FileSystem.getInfoAsync(
      attachmentUri(id),
    );

  return info.exists;
}

export async function deleteAttachment(
  id: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (await webExists(id)) {
      await webDelete(id);
    }

    return;
  }

  const uri =
    attachmentUri(id);

  const info =
    await FileSystem.getInfoAsync(
      uri,
    );

  if (info.exists) {
    await FileSystem.deleteAsync(
      uri,
      {
        idempotent: true,
      },
    );
  }
}

export async function getAttachmentBlob(
  id: string,
): Promise<Blob | null> {
  if (Platform.OS !== "web") {
    return null;
  }

  return webGet(id);
}

export async function getAttachmentUri(
  id: string,
): Promise<string | null> {
  if (Platform.OS === "web") {
    const blob = await webGet(id);

    if (!blob) {
      return null;
    }

    return URL.createObjectURL(blob);
  }

  const uri =
    attachmentUri(id);

  const info =
    await FileSystem.getInfoAsync(
      uri,
    );

  return info.exists
    ? uri
    : null;
}
