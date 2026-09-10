import {
  attachmentExists,
  deleteAttachment,
} from "./attachmentStore";

import {
  Attachment,
  Conversation,
} from "./store";

/**
 * Count how many live message references point to
 * each attachment ID.
 *
 * This deliberately counts references across the entire
 * conversation state rather than maintaining a separate
 * mutable reference counter. The conversation state is the
 * source of truth.
 */
export function collectAttachmentReferences(
  conversations: Conversation[],
): Map<string, number> {
  const references = new Map<string, number>();

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      const attachment =
        message.attachment;

      if (!attachment) {
        continue;
      }

      const current =
        references.get(attachment.id) ?? 0;

      references.set(
        attachment.id,
        current + 1,
      );
    }
  }

  return references;
}

/**
 * Return all attachment IDs currently referenced by
 * persisted messages.
 */
export function collectReferencedAttachmentIds(
  conversations: Conversation[],
): Set<string> {
  return new Set(
    collectAttachmentReferences(
      conversations,
    ).keys(),
  );
}

/**
 * Determine whether an attachment is still referenced
 * anywhere in the current message state.
 */
export function isAttachmentReferenced(
  attachmentId: string,
  conversations: Conversation[],
): boolean {
  return collectReferencedAttachmentIds(
    conversations,
  ).has(attachmentId);
}

/**
 * Delete an attachment only when no message references
 * remain.
 *
 * This protects forwarded messages and any future feature
 * that legitimately shares an attachment between messages.
 */
export async function deleteAttachmentIfUnreferenced(
  attachmentId: string,
  conversations: Conversation[],
): Promise<boolean> {
  if (
    isAttachmentReferenced(
      attachmentId,
      conversations,
    )
  ) {
    return false;
  }

  await deleteAttachment(
    attachmentId,
  );

  return true;
}

/**
 * Extract attachment IDs from a list of messages.
 */
export function collectMessageAttachmentIds(
  messages: Array<{
    attachment?: Attachment;
  }>,
): Set<string> {
  const ids = new Set<string>();

  for (const message of messages) {
    if (message.attachment?.id) {
      ids.add(
        message.attachment.id,
      );
    }
  }

  return ids;
}

/**
 * Remove physical files that are no longer referenced
 * by any persisted message.
 *
 * This is intentionally conservative:
 *
 * - referenced attachment -> KEEP
 * - missing attachment -> IGNORE
 * - unreferenced known attachment -> DELETE
 *
 * The function operates only on attachment IDs supplied
 * by the caller. It does not recursively delete arbitrary
 * files from the application directory.
 */
export async function cleanupUnreferencedAttachments(
  attachmentIds: Iterable<string>,
  conversations: Conversation[],
): Promise<{
  deleted: string[];
  retained: string[];
  missing: string[];
  failed: string[];
}> {
  const referenced =
    collectReferencedAttachmentIds(
      conversations,
    );

  const deleted: string[] = [];
  const retained: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  for (const id of attachmentIds) {
    if (referenced.has(id)) {
      retained.push(id);
      continue;
    }

    try {
      const exists =
        await attachmentExists(id);

      if (!exists) {
        missing.push(id);
        continue;
      }

      await deleteAttachment(id);

      deleted.push(id);
    } catch {
      failed.push(id);
    }
  }

  return {
    deleted,
    retained,
    missing,
    failed,
  };
}
