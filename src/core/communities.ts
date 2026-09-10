import AsyncStorage from "@react-native-async-storage/async-storage";

export type Community = {
  id: string;
  name: string;
  description?: string;
  avatarUri?: string;
  ownerId: string;
  groupIds: string[];
  createdAt: string;
};

const COMMUNITIES_KEY = "nexchat.communities.v1";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCommunities(): Promise<Community[]> {
  const raw = await AsyncStorage.getItem(COMMUNITIES_KEY);

  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NexChat community data is corrupted.");
  }

  return (parsed as Community[]).map((c) => ({
    ...c,
    groupIds: c.groupIds ?? [],
  }));
}

async function saveCommunities(communities: Community[]): Promise<void> {
  await AsyncStorage.setItem(COMMUNITIES_KEY, JSON.stringify(communities));
}

export async function createCommunity(
  name: string,
  ownerId: string,
  groupIds: string[],
  description?: string,
  avatarUri?: string
): Promise<Community> {
  const cleaned = name.trim();

  if (!cleaned) {
    throw new Error("Community name cannot be empty.");
  }

  const community: Community = {
    id: createId("community"),
    name: cleaned,
    description: description?.trim() || undefined,
    avatarUri,
    ownerId,
    groupIds,
    createdAt: new Date().toISOString(),
  };

  const communities = await getCommunities();
  await saveCommunities([community, ...communities]);

  return community;
}

export async function updateCommunity(
  communityId: string,
  patch: Partial<Community>
): Promise<void> {
  const communities = await getCommunities();

  await saveCommunities(
    communities.map((c) => (c.id === communityId ? { ...c, ...patch } : c))
  );
}

export async function addGroupToCommunity(
  communityId: string,
  groupId: string
): Promise<void> {
  const communities = await getCommunities();

  await saveCommunities(
    communities.map((c) =>
      c.id === communityId && !c.groupIds.includes(groupId)
        ? { ...c, groupIds: [...c.groupIds, groupId] }
        : c
    )
  );
}

export async function removeGroupFromCommunity(
  communityId: string,
  groupId: string
): Promise<void> {
  const communities = await getCommunities();

  await saveCommunities(
    communities.map((c) =>
      c.id === communityId
        ? { ...c, groupIds: c.groupIds.filter((id) => id !== groupId) }
        : c
    )
  );
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const communities = await getCommunities();
  await saveCommunities(communities.filter((c) => c.id !== communityId));
}
