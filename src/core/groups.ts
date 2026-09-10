import AsyncStorage from "@react-native-async-storage/async-storage";
import { Attachment, MessageStatus } from "./store";

export type Group = {
  id: string;
  name: string;
  description?: string;
  avatarUri?: string;
  ownerId: string;
  adminIds: string[];
  memberIds: string[];
  createdAt: string;

  pinned?: boolean;
  pinnedUntil?: string;
  muted?: boolean;
  archived?: boolean;
  unreadCount?: number;
};

export type GroupMessage = {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  attachment?: Attachment;
  createdAt: string;
  status: MessageStatus;

  callInfo?: {
    type: "voice" | "video";
    status: "completed" | "failed" | "missed" | "declined";
    durationSeconds?: number;
  };
};

const GROUPS_KEY = "nexchat.groups.v1";
const MESSAGES_KEY = "nexchat.group_messages.v1";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getGroups(): Promise<Group[]> {
  const raw = await AsyncStorage.getItem(GROUPS_KEY);

  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NexChat group data is corrupted.");
  }

  return (parsed as Group[]).map((g) => ({
    ...g,
    adminIds: g.adminIds ?? [],
    memberIds: g.memberIds ?? [],
  }));
}

async function saveGroups(groups: Group[]): Promise<void> {
  await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const groups = await getGroups();
  return groups.find((g) => g.id === groupId) ?? null;
}

export async function createGroup(
  name: string,
  ownerId: string,
  memberIds: string[],
  description?: string,
  avatarUri?: string
): Promise<Group> {
  const cleaned = name.trim();

  if (!cleaned) {
    throw new Error("Group name cannot be empty.");
  }

  const group: Group = {
    id: createId("group"),
    name: cleaned,
    description: description?.trim() || undefined,
    avatarUri,
    ownerId,
    adminIds: [],
    memberIds: Array.from(new Set([ownerId, ...memberIds])),
    createdAt: new Date().toISOString(),
  };

  const groups = await getGroups();
  await saveGroups([group, ...groups]);

  return group;
}

export async function updateGroup(
  groupId: string,
  patch: Partial<Group>
): Promise<void> {
  const groups = await getGroups();

  await saveGroups(
    groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
  );
}

export async function addGroupMember(
  groupId: string,
  userId: string
): Promise<void> {
  const groups = await getGroups();

  await saveGroups(
    groups.map((g) =>
      g.id === groupId && !g.memberIds.includes(userId)
        ? { ...g, memberIds: [...g.memberIds, userId] }
        : g
    )
  );
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<void> {
  const groups = await getGroups();

  await saveGroups(
    groups.map((g) =>
      g.id === groupId
        ? { ...g, memberIds: g.memberIds.filter((id) => id !== userId) }
        : g
    )
  );
}

export async function deleteGroup(groupId: string): Promise<void> {
  const groups = await getGroups();
  await saveGroups(groups.filter((g) => g.id !== groupId));

  const messages = await getAllGroupMessages();
  await saveGroupMessages(messages.filter((m) => m.groupId !== groupId));
}

/**
 * Clear an expired pin (pinnedUntil in the past) if present.
 * Safe to call repeatedly — it's a no-op once already unpinned.
 */
export async function clearExpiredPin(groupId: string): Promise<void> {
  const group = await getGroup(groupId);

  if (
    group?.pinned &&
    group.pinnedUntil &&
    new Date(group.pinnedUntil).getTime() <= Date.now()
  ) {
    await updateGroup(groupId, { pinned: false, pinnedUntil: undefined });
  }
}

export async function getAllGroupMessages(): Promise<GroupMessage[]> {
  const raw = await AsyncStorage.getItem(MESSAGES_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as GroupMessage[];
  } catch {
    throw new Error("NexChat group message data is corrupted.");
  }
}

async function saveGroupMessages(messages: GroupMessage[]): Promise<void> {
  await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

export async function getGroupMessages(
  groupId: string
): Promise<GroupMessage[]> {
  const messages = await getAllGroupMessages();

  return messages
    .filter((m) => m.groupId === groupId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  text: string,
  attachment?: Attachment
): Promise<GroupMessage> {
  const message: GroupMessage = {
    id: createId("gmsg"),
    groupId,
    senderId,
    text,
    attachment,
    createdAt: new Date().toISOString(),
    status: "sent",
  };

  const messages = await getAllGroupMessages();
  await saveGroupMessages([...messages, message]);

  return message;
}

export async function logGroupCall(
  groupId: string,
  senderId: string,
  entry: GroupMessage["callInfo"]
): Promise<GroupMessage> {
  const message: GroupMessage = {
    id: createId("gmsg"),
    groupId,
    senderId,
    text: entry?.type === "video" ? "Video call" : "Voice call",
    createdAt: new Date().toISOString(),
    status: "sent",
    callInfo: entry,
  };

  const messages = await getAllGroupMessages();
  await saveGroupMessages([...messages, message]);

  return message;
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  const messages = await getAllGroupMessages();
  await saveGroupMessages(messages.filter((m) => m.id !== messageId));
}

export async function getLastGroupMessage(
  groupId: string
): Promise<GroupMessage | null> {
  const messages = await getGroupMessages(groupId);
  return messages[messages.length - 1] ?? null;
}
