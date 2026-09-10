import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
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

  const conversationRows: UnifiedRow[] = st.conversations
    .filter((c) => !c.archived)
    .map((c) => {
      const contact = st.contacts.find((x) => x.id === c.peerId);
      const last = c.messages.at(-1);
      const name = contact?.displayName || c.peerId;

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
        return [
          { text: "Peek", onPress: () => setPeekPeerId(chatActionsFor) },
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
            onPress: () => st.setConversation(chatActionsFor, { muted: !conv?.muted }),
          },
          { text: "Archive", onPress: () => st.archiveConversation(chatActionsFor, true) },
          {
            text: "Select",
            onPress: () => {
              setSelectMode(true);
              setSelectedIds(new Set([`c-${chatActionsFor}`]));
            },
          },
          {
            text: "Delete chat",
            style: "destructive",
            onPress: () =>
              Alert.alert("Delete chat?", "This removes the entire conversation. This cannot be undone.", [
                { text: "Delete", style: "destructive", onPress: () => st.deleteConversation(chatActionsFor) },
                { text: "Cancel", style: "cancel" },
              ]),
          },
          { text: "Cancel", style: "cancel" },
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
              {peekContact?.displayName || peekPeerId}
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
