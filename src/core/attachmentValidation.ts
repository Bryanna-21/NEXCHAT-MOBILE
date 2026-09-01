export interface AttachmentCandidate {
  uri: string;
  type?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
}

export interface AttachmentValidation {
  valid: boolean;
  reason?: string;
}

export const MAX_ATTACHMENT_BYTES =
  100 * 1024 * 1024;

const allowedMimePrefixes = [
  "image/",
  "video/",
  "audio/",
];

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/json",
  "application/octet-stream",
]);

function normalizeMime(
  mimeType?: string,
): string | undefined {
  if (!mimeType) {
    return undefined;
  }

  return mimeType
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function validateAttachment(
  candidate: AttachmentCandidate,
): AttachmentValidation {
  if (!candidate.uri) {
    return {
      valid: false,
      reason:
        "Attachment URI is missing.",
    };
  }

  if (
    typeof candidate.fileSize ===
      "number" &&
    candidate.fileSize < 0
  ) {
    return {
      valid: false,
      reason:
        "Attachment size is invalid.",
    };
  }

  if (
    typeof candidate.fileSize ===
      "number" &&
    candidate.fileSize >
      MAX_ATTACHMENT_BYTES
  ) {
    return {
      valid: false,
      reason:
        "Attachment exceeds the 100 MB limit.",
    };
  }

  const mimeType =
    normalizeMime(candidate.mimeType);

  if (mimeType) {
    const allowed =
      allowedMimePrefixes.some(
        prefix =>
          mimeType.startsWith(prefix),
      ) ||
      allowedMimeTypes.has(mimeType);

    if (!allowed) {
      return {
        valid: false,
        reason:
          `Unsupported attachment type: ${mimeType}`,
      };
    }
  }

  return {
    valid: true,
  };
}

export function attachmentTypeFromMime(
  mimeType?: string,
): "image" | "video" | "audio" | "file" {
  const normalized =
    normalizeMime(mimeType);

  if (
    normalized?.startsWith("image/")
  ) {
    return "image";
  }

  if (
    normalized?.startsWith("video/")
  ) {
    return "video";
  }

  if (
    normalized?.startsWith("audio/")
  ) {
    return "audio";
  }

  return "file";
}
