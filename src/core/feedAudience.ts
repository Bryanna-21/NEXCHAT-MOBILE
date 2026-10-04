import type { FeedPost } from "./feed";

export type FeedAudienceContext = {
  identityId: string;
  contactIds: string[];
  blockedIds: string[];
};

export function canUserSeeFeedPost(
  post: FeedPost,
  context: FeedAudienceContext,
): boolean {
  const creatorId = post.creator.id;

  if (!creatorId || !context.identityId) {
    return false;
  }

  // Blocked authors are never visible.
  if (context.blockedIds.includes(creatorId)) {
    return false;
  }

  const audience = post.audience ?? "everyone";

  switch (audience) {
    case "everyone":
      return true;

    case "only_me":
      return creatorId === context.identityId;

    case "connections":
      return (
        creatorId === context.identityId ||
        context.contactIds.includes(creatorId)
      );

    default:
      return false;
  }
}
