import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useNexChatStore } from "../core/store";
import { Identity } from "../core/identity";
import { Group, getGroups, getLastGroupMessage } from "../core/groups";
import { GroupsScreen } from "./GroupsScreen";
import { CommunitiesScreen } from "./CommunitiesScreen";
import { ActionSheet, ActionSheetOption } from "./ActionSheet";

type ListTab = "All" | "Unread" | "Groups" | "Communities";

type UnifiedRow =
  | { kind: "conversation"; peerId: string; name: string; preview: string; time: number; pinned: boolean; muted: boolean; unread: boolean }
  | { kind: "group"; group: Group; preview: string; time: number };

export function ChatListScreen({
  theme,
  identity,
  onOpen,
  onNew,
}: {
  theme: any;
  identity: Identity | null;
  onOpen: (peerId: string) => void;
  onNew: () => void;
}) {
  const st = useNexChatStore();
  const myId = identity?.id;

  const [tab, setTab] = useState<ListTab>("All");
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupPreviews, setGroupPreviews] = useState<Record<string, { text: string; time: number }>>({});

  const [chatActionsFor, setChatActionsFor] = useState<string | null>(null);
  const [pinMenuFor, setPinMenuFor] = useState<string | null>(null);
  const [peekPeerId, setPeekPeerId] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [archiveRefreshing, setArchiveRefreshing] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!myId) return;

    const all = await getGroups();
    const mine = all.filter((g) => g.memberIds.includes(myId) && !g.archived);
    setGroups(mine);

    const previews: Record<string, { text: string; time: number }> = {};
    for (const g of mine) {
      const last = await getLastGroupMessage(g.id);
      previews[g.id] = {
        text: last
          ? last.callInfo
            ? last.callInfo.type === "video" ? "🎥 Video call" : "📞 Voice call"
            : last.text || (last.attachment ? "Attachment" : "")
          : "No messages yet",
        time: last ? new Date(last.createdAt).getTime() : new Date(g.createdAt).getTime(),
      };
    }
    setGroupPreviews(previews);
  }, [myId]);

  useEffect(() => {
    loadGroups();
    st.clearExpiredPins();
  }, [loadGroups]);

  if (tab === "Groups") {
    return (
      <View style={s.flex}>
        <ListHeader tab={tab} setTab={setTab} theme={theme} onNew={onNew} query={query} setQuery={setQuery} />
        <GroupsScreen theme={theme} identity={identity} />
      </View>
    );
  }

  if (tab === "Communities") {
    return (
      <View style={s.flex}>
        <ListHeader tab={tab} setTab={setTab} theme={theme} onNew={onNew} query={query} setQuery={setQuery} />
        <CommunitiesScreen theme={theme} identity={identity} />
      </View>
    );
  }

  const q = query.trim().toLowerCase();

  const archivedRows = st.conversations
    .filter((c) => c.archived && c.peerId !== myId)
    .map((c) => {
      const contact = st.contacts.find((x) => x.id === c.peerId);
      const last = c.messages.at(-1);

      return {
        peerId: c.peerId,
        name:
          contact?.username
            ? `@${contact.username}`
            : contact?.displayName || c.peerId,
        preview: last?.deletedForEveryone || last?.deletedForMe
          ? "Message deleted"
          : last?.callInfo
          ? last.callInfo.type === "video" ? "🎥 Video call" : "📞 Voice call"
          : last?.text || last?.attachment?.name || "No messages",
        time: last ? new Date(last.createdAt).getTime() : 0,
      };
    })
    .sort((a, b) => b.time - a.time);

  const openArchive = async () => {
    if (!st.settings.pullDownToArchive || archiveRefreshing) return;

    setArchiveRefreshing(true);
    setArchiveVisible(true);

    setTimeout(() => {
      setArchiveRefreshing(false);
    }, 250);
  };

  const selfConversation = st.conversations.find(
    (c) => c.peerId === myId && !c.archived,
  );

  const conversationRows: UnifiedRow[] = st.conversations
    .filter(
      (c) =>
        !c.archived &&
        c.peerId !== myId,
    )
    .map((c) => {
      const contact = st.contacts.find((x) => x.id === c.peerId);
      const last = c.messages.at(-1);
      const name =
        contact?.username
          ? `@${contact.username}`
          : contact?.displayName || c.peerId;

      return {
        kind: "conversation" as const,
        peerId: c.peerId,
        name,
        preview: last?.deletedForEveryone || last?.deletedForMe
          ? "Message deleted"
          : last?.callInfo
          ? last.callInfo.type === "video" ? "🎥 Video call" : "📞 Voice call"
          : last?.text || last?.attachment?.name || "No messages",
        time: last ? new Date(last.createdAt).getTime() : 0,
        pinned: !!c.pinned,
        muted: !!c.muted,
        unread: (c.unreadCount ?? 0) > 0,
      };
    });

  if (myId) {
    conversationRows.unshift({
      kind: "conversation" as const,
      peerId: myId,
      name: "Message yourself",
      preview: selfConversation?.messages.at(-1)?.text
        || selfConversation?.messages.at(-1)?.attachment?.name
        || "Notes to yourself",
      time: selfConversation?.messages.at(-1)
        ? new Date(
            selfConversation.messages.at(-1)!.createdAt,
          ).getTime()
        : 0,
      pinned: false,
      muted: false,
      unread: false,
    });
  }

  const groupRows: UnifiedRow[] = groups.map((g) => ({
    kind: "group" as const,
    group: g,
    preview: groupPreviews[g.id]?.text ?? "",
    time: groupPreviews[g.id]?.time ?? 0,
  }));

  let rows: UnifiedRow[] = [...conversationRows, ...groupRows];

  if (tab === "Unread") {
    rows = rows.filter((r) => r.kind === "conversation" && r.unread);
  }

  if (q) {
    rows = rows.filter((r) => {
      const name = r.kind === "conversation" ? r.name : r.group.name;
      return name.toLowerCase().includes(q);
    });
  }

  rows.sort((a, b) => {
    const aPinned = a.kind === "conversation" ? a.pinned : false;
    const bPinned = b.kind === "conversation" ? b.pinned : false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return b.time - a.time;
  });

  const rowKey = (r: UnifiedRow) => (r.kind === "conversation" ? `c-${r.peerId}` : `g-${r.group.id}`);

  const toggleSelected = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const confirmBulkDelete = () => {
    const peerIds = Array.from(selectedIds)
      .filter((k) => k.startsWith("c-"))
      .map((k) => k.slice(2));

    if (!peerIds.length) {
      exitSelectMode();
      return;
    }

    Alert.alert(
      `Delete ${peerIds.length} chat(s)?`,
      "This removes the selected conversations entirely. This cannot be undone.",
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await st.deleteConversations(peerIds);
            exitSelectMode();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

const chatActionsOptions: ActionSheetOption[] = chatActionsFor
  ? (() => {
      const conv = st.conversations.find((c) => c.peerId === chatActionsFor);
      const isUnread = (conv?.unreadCount ?? 0) > 0;

      return [
        {
          text: "Peek",
          onPress: () => setPeekPeerId(chatActionsFor),
        },
        {
          text: isUnread ? "Mark as Read" : "Mark as Unread",
          onPress: () =>
            st.setConversation(chatActionsFor, {
              unreadCount: isUnread ? 0 : 1,
            }),
        },
        {
          text: conv?.pinned ? "Unpin" : "Pin",
          onPress: () => {
            if (conv?.pinned) {
              st.pinConversation(chatActionsFor, false);
            } else {
              setPinMenuFor(chatActionsFor);
            }
          },
        },
        {
          text: conv?.muted ? "Unmute" : "Mute",
          onPress: () =>
            st.setConversation(chatActionsFor, {
              muted: !conv?.muted,
            }),
        },
        {
          text: conv?.archived ? "Unarchive" : "Archive",
          onPress: () =>
            st.archiveConversation(chatActionsFor, !conv?.archived),
        },
        {
          text: "Select",
          onPress: () => {
            setSelectMode(true);
            setSelectedIds(new Set([`c-${chatActionsFor}`]));
          },
        },
        {
          text: "Clear chat",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Clear chat?",
              "This removes all messages from this conversation on this device. The conversation itself will remain.",
              [
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: () => st.clearConversation(chatActionsFor),
                },
                {
                  text: "Cancel",
                  style: "cancel",
                },
              ]
            ),
        },
        {
          text: "Delete chat",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Delete chat?",
              "This permanently removes the entire conversation from this device. This cannot be undone.",
              [
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => st.deleteConversation(chatActionsFor),
                },
                {
                  text: "Cancel",
                  style: "cancel",
                },
              ]
            ),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ];
    })()
  : [];

  const pinMenuOptions: ActionSheetOption[] = pinMenuFor
    ? [
        { text: "1 hour", onPress: () => st.pinConversation(pinMenuFor, true, new Date(Date.now() + 3600_000).toISOString()) },
        { text: "Today", onPress: () => st.pinConversation(pinMenuFor, true, new Date(new Date().setHours(23, 59, 59, 999)).toISOString()) },
        { text: "3 days", onPress: () => st.pinConversation(pinMenuFor, true, new Date(Date.now() + 3 * 86400_000).toISOString()) },
        { text: "Until I unpin it", onPress: () => st.pinConversation(pinMenuFor, true, undefined) },
        { text: "Cancel", style: "cancel" },
      ]
    : [];

  const peekConversation = peekPeerId ? st.conversations.find((c) => c.peerId === peekPeerId) : undefined;
  const peekContact = peekPeerId ? st.contacts.find((c) => c.id === peekPeerId) : undefined;
  const peekMessages = peekConversation ? peekConversation.messages.slice(-10).reverse() : [];

  return (
    <View style={s.flex}>
      <ListHeader tab={tab} setTab={setTab} theme={theme} onNew={onNew} query={query} setQuery={setQuery} />

      <FlatList
        data={rows}
        keyExtractor={rowKey}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        refreshControl={
          st.settings.pullDownToArchive ? (
            <RefreshControl
              refreshing={archiveRefreshing}
              onRefresh={openArchive}
              tintColor={theme.brand}
              colors={[theme.brand]}
            />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40, color: theme.ink }}>◌</Text>
            <Text style={{ fontWeight: "800", fontSize: 18, color: theme.ink }}>
              {tab === "Unread" ? "No unread chats" : "No chats yet"}
            </Text>
            <Text style={{ color: theme.muted, textAlign: "center" }}>
              {tab === "Unread"
                ? "You're all caught up."
                : "Start one conversation. NexChat will reuse it instead of creating duplicate entries."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const key = rowKey(item);
          const selected = selectedIds.has(key);
          const name = item.kind === "conversation" ? item.name : item.group.name;

          return (
            <TouchableOpacity
              onPress={() => {
                if (selectMode) {
                  toggleSelected(key);
                  return;
                }
                if (item.kind === "conversation") onOpen(item.peerId);
              }}
              onLongPress={() => {
                if (selectMode) return;
                if (item.kind === "conversation") setChatActionsFor(item.peerId);
              }}
              delayLongPress={350}
              style={[
                s.chatRow,
                { backgroundColor: theme.card, borderColor: selected ? theme.brand : theme.line },
              ]}
            >
              {selectMode && (
                <View style={[s.checkbox, { borderColor: theme.brand, backgroundColor: selected ? theme.brand : "transparent" }]}>
                  {selected && <Text style={{ color: "white", fontSize: 12, fontWeight: "900" }}>✓</Text>}
                </View>
              )}

              <View style={[s.avatar, { backgroundColor: theme.brand }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>{name.slice(0, 1).toUpperCase()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[s.chatName, { color: theme.ink }]} numberOfLines={1}>
                    {item.kind === "conversation" && item.pinned ? "📌 " : ""}
                    {item.kind === "conversation" && item.muted ? "🔕 " : ""}
                    {name}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>
                    {item.time ? new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ color: theme.muted }}>{item.preview}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal
        visible={archiveVisible}
        animationType="slide"
        onRequestClose={() => setArchiveVisible(false)}
      >
        <View style={[s.flex, { backgroundColor: theme.bg }]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <TouchableOpacity
              onPress={() => setArchiveVisible(false)}
              style={{ paddingRight: 14 }}
            >
              <Text style={{ color: theme.brand, fontSize: 24 }}>‹</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.ink,
                  fontSize: 20,
                  fontWeight: "900",
                }}
              >
                Archived Chats
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {archivedRows.length} archived chat{archivedRows.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <FlatList
            data={archivedRows}
            keyExtractor={(item) => item.peerId}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: 40,
              flexGrow: archivedRows.length === 0 ? 1 : 0,
            }}
            ListEmptyComponent={
              <View
                style={[
                  s.empty,
                  {
                    flex: 1,
                    justifyContent: "center",
                    minHeight: 300,
                  },
                ]}
              >
                <Text style={{ fontSize: 40, color: theme.ink }}>📦</Text>
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 18,
                    color: theme.ink,
                    marginTop: 8,
                  }}
                >
                  No archived chats
                </Text>
                <Text
                  style={{
                    color: theme.muted,
                    textAlign: "center",
                    marginTop: 6,
                  }}
                >
                  Chats you archive will appear here.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  s.chatRow,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.line,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => {
                    setArchiveVisible(false);
                    onOpen(item.peerId);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <View
                    style={[
                      s.avatar,
                      {
                        backgroundColor: theme.brand,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "900",
                      }}
                    >
                      {item.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={[
                          s.chatName,
                          {
                            color: theme.ink,
                            flex: 1,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>

                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 11,
                          marginLeft: 8,
                        }}
                      >
                        {item.time
                          ? new Date(item.time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </Text>
                    </View>

                    <Text
                      numberOfLines={1}
                      style={{ color: theme.muted }}
                    >
                      {item.preview}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => st.archiveConversation(item.peerId, false)}
                  style={{
                    marginLeft: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      color: theme.brand,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    Unarchive
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>

      {!selectMode && (
        <TouchableOpacity onPress={onNew} style={[s.fab, { backgroundColor: theme.brand }]}>
          <Text style={{ color: "white", fontSize: 28 }}>＋</Text>
        </TouchableOpacity>
      )}

      {selectMode && (
        <View style={[s.selectBar, { backgroundColor: theme.card, borderTopColor: theme.line }]}>
          <TouchableOpacity onPress={exitSelectMode}>
            <Text style={{ color: theme.ink, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.muted }}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={confirmBulkDelete}>
            <Text style={{ color: theme.danger, fontWeight: "800" }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <ActionSheet
        visible={!!chatActionsFor}
        title="Chat"
        options={chatActionsOptions}
        onRequestClose={() => setChatActionsFor(null)}
        theme={theme}
      />

      <ActionSheet
        visible={!!pinMenuFor}
        title="Pin chat"
        message="Choose how long to keep it pinned"
        options={pinMenuOptions}
        onRequestClose={() => setPinMenuFor(null)}
        theme={theme}
      />

      <Modal visible={!!peekPeerId} transparent animationType="fade" onRequestClose={() => setPeekPeerId(null)}>
        <View style={s.peekOverlay}>
          <View style={[s.peekCard, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 4 }}>
              {peekContact?.username
                ? `@${peekContact.username}`
                : peekContact?.displayName || peekPeerId}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 10 }}>
              Peek — viewing doesn't mark this chat as read
            </Text>

            <FlatList
              data={peekMessages}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={{ color: theme.muted }}>No messages yet.</Text>}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ color: theme.ink }}>
                    {item.deletedForEveryone || item.deletedForMe
                      ? "Message deleted"
                      : item.text || item.attachment?.name || "(attachment)"}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setPeekPeerId(null)} style={[s.peekButton, { borderColor: theme.line, borderWidth: 1 }]}>
                <Text style={{ color: theme.ink }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const id = peekPeerId;
                  setPeekPeerId(null);
                  if (id) onOpen(id);
                }}
                style={[s.peekButton, { backgroundColor: theme.brand }]}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Open chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ListHeader({
  tab,
  setTab,
  theme,
  onNew,
  query,
  setQuery,
}: {
  tab: ListTab;
  setTab: (t: ListTab) => void;
  theme: any;
  onNew: () => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const tabs: ListTab[] = ["All", "Unread", "Groups", "Communities"];

  return (
    <View style={{ backgroundColor: theme.card, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.line }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search or start a new chat"
          placeholderTextColor={theme.muted}
          style={[hs.search, { backgroundColor: theme.bg, color: theme.ink }]}
        />
      </View>

      <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 8, alignItems: "center" }}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[
              hs.pill,
              {
                backgroundColor: tab === t ? theme.brand : "transparent",
                borderColor: tab === t ? theme.brand : theme.line,
              },
            ]}
          >
            <Text style={{ color: tab === t ? "white" : theme.ink, fontWeight: "700", fontSize: 13 }}>{t}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={onNew} style={[hs.pill, { borderColor: theme.line, paddingHorizontal: 10 }]}>
          <Text style={{ color: theme.ink, fontSize: 16 }}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  search: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },

  chatRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 8,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  chatName: { fontWeight: "900", fontSize: 16, flexShrink: 1 },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },

  selectBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  peekOverlay: { flex: 1, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center", padding: 24 },
  peekCard: { width: "100%", borderRadius: 18, padding: 16 },
  peekButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});
