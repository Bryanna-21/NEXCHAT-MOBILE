import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useNexChatStore } from "../core/store";
import { Identity } from "../core/identity";
import { pickProfilePhoto } from "../core/media";
import {
  Group,
  addGroupMember,
  clearExpiredPin,
  createGroup,
  deleteGroup,
  getGroups,
  getLastGroupMessage,
  removeGroupMember,
  updateGroup,
} from "../core/groups";
import { GroupChat } from "./GroupChat";
import { ActionSheet, ActionSheetOption } from "./ActionSheet";

type GroupsScreenProps = {
  theme: any;
  identity: Identity | null;
};

export function GroupsScreen({ theme, identity }: GroupsScreenProps) {
  const st = useNexChatStore();
  const myId = identity?.id;

  const [groups, setGroups] = useState<Group[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [infoGroup, setInfoGroup] = useState<Group | null>(null);

  const refreshInfoGroup = useCallback(async (groupId: string) => {
    const all = await getGroups();
    setInfoGroup(all.find((g) => g.id === groupId) || null);
  }, []);

  const load = useCallback(async () => {
    if (!myId) return;

    setLoading(true);

    try {
      const all = await getGroups();
      const mine = all.filter((g) => g.memberIds.includes(myId) && !g.archived);

      for (const g of mine) {
        await clearExpiredPin(g.id);
      }

      const refreshed = mine.length ? await getGroups() : mine;
      const myGroups = refreshed.filter((g) => g.memberIds.includes(myId) && !g.archived);

      const sorted = [...myGroups].sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned)
      );

      setGroups(sorted);

      const previewEntries: Record<string, string> = {};
      for (const g of sorted) {
        const last = await getLastGroupMessage(g.id);
        previewEntries[g.id] = last
          ? last.callInfo
            ? last.callInfo.type === "video"
              ? "🎥 Video call"
              : "📞 Voice call"
            : last.text || (last.attachment ? "Attachment" : "")
          : "No messages yet";
      }
      setPreviews(previewEntries);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickNewAvatar = async () => {
    try {
      const uri = await pickProfilePhoto();
      if (uri) setNewAvatarUri(uri);
    } catch (e) {
      Alert.alert("Couldn't set image", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submitCreate = async () => {
    if (!myId) return;

    try {
      await createGroup(newName, myId, selectedMemberIds, newDescription, newAvatarUri || undefined);
      setNewName("");
      setNewDescription("");
      setNewAvatarUri(null);
      setSelectedMemberIds([]);
      setCreateVisible(false);
      await load();
    } catch (e) {
      Alert.alert("Couldn't create group", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  if (openGroup && myId) {
    return (
      <GroupChat
        theme={theme}
        group={openGroup}
        identity={identity}
        onBack={() => {
          setOpenGroup(null);
          load();
        }}
        onOpenInfo={() => setInfoGroup(openGroup)}
      />
    );
  }

  return (
    <View style={s.flex}>
      <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headTitle, { color: theme.ink }]}>Groups</Text>
          <Text style={[s.headSub, { color: theme.muted }]}>Chat with more than one person at once</Text>
        </View>

        <TouchableOpacity onPress={() => setCreateVisible(true)} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 26, color: theme.brand }}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ color: theme.muted }}>{loading ? "Loading groups…" : "No groups yet."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setOpenGroup(item)}
            style={[s.row, { backgroundColor: theme.card, borderColor: theme.line }]}
          >
            {item.avatarUri ? (
              <Image source={{ uri: item.avatarUri }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 15 }}>
                {item.pinned ? "📌 " : ""}{item.name}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                {previews[item.id] || `${item.memberIds.length} member(s)`}
              </Text>
            </View>

            <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>New group</Text>

            <TouchableOpacity onPress={pickNewAvatar} style={{ alignSelf: "center", marginBottom: 12 }}>
              {newAvatarUri ? (
                <Image source={{ uri: newAvatarUri }} style={s.avatarLarge} />
              ) : (
                <View style={[s.avatarLarge, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.line }]}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Group name"
              placeholderTextColor={theme.muted}
              style={[s.input, { color: theme.ink, borderColor: theme.line }]}
            />

            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.muted}
              style={[s.input, { color: theme.ink, borderColor: theme.line, marginTop: 8 }]}
            />

            <Text style={{ color: theme.ink, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>
              Add members
            </Text>

            <ScrollView style={{ maxHeight: 160 }}>
              {st.contacts.filter((c) => c.id !== myId).map((c) => {
                const selected = selectedMemberIds.includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => toggleMember(c.id)}
                    style={[s.memberRow, { borderColor: theme.line, backgroundColor: selected ? theme.bg : "transparent" }]}
                  >
                    <Text style={{ color: theme.ink, flex: 1 }}>{c.displayName || c.id}</Text>
                    <Text style={{ color: selected ? theme.brand : theme.muted, fontWeight: "800" }}>
                      {selected ? "✓" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {st.contacts.length <= 1 && (
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  Add contacts first to invite them to a group.
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
              <TouchableOpacity onPress={() => setCreateVisible(false)} style={[s.button, { borderColor: theme.line, borderWidth: 1 }]}>
                <Text style={{ color: theme.ink }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={submitCreate} style={[s.button, { backgroundColor: theme.brand }]}>
                <Text style={{ color: "white", fontWeight: "700" }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {infoGroup && myId && (
        <GroupInfo
          theme={theme}
          group={infoGroup}
          myId={myId}
          contacts={st.contacts}
          onClose={() => setInfoGroup(null)}
          onLeft={() => {
            setInfoGroup(null);
            setOpenGroup(null);
            load();
          }}
          onUpdated={async () => {
            await load();
            await refreshInfoGroup(infoGroup.id);
          }}
        />
      )}
    </View>
  );
}

function GroupInfo({
  theme,
  group,
  myId,
  contacts,
  onClose,
  onLeft,
  onUpdated,
}: {
  theme: any;
  group: Group;
  myId: string;
  contacts: { id: string; displayName: string }[];
  onClose: () => void;
  onLeft: () => void;
  onUpdated: () => void | Promise<void>;
}) {
  const isOwner = group.ownerId === myId;
  const nameFor = (id: string) => (id === myId ? "You" : contacts.find((c) => c.id === id)?.displayName || id);

  const roleFor = (id: string) => {
    if (id === group.ownerId) return "Owner";
    if (group.adminIds.includes(id)) return "Admin";
    return "Member";
  };

  const [memberActionsFor, setMemberActionsFor] = useState<string | null>(null);
  const [addMembersVisible, setAddMembersVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDescription, setEditDescription] = useState(group.description || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const isAdmin = group.adminIds.includes(myId);
  const canManageMembers = isOwner || isAdmin;
  const addableContacts = contacts.filter((c) => !group.memberIds.includes(c.id));

  const startEditingProfile = () => {
    if (!isOwner) return;
    setEditName(group.name);
    setEditDescription(group.description || "");
    setEditingProfile(true);
  };

  const changeAvatar = async () => {
    if (!isOwner) return;

    try {
      const uri = await pickProfilePhoto();
      if (uri) {
        await updateGroup(group.id, { avatarUri: uri });
        await onUpdated();
      }
    } catch (e) {
      Alert.alert(
        "Couldn't set image",
        e instanceof Error ? e.message : "Something went wrong."
      );
    }
  };

  const saveProfile = async () => {
    const trimmedName = editName.trim();

    if (!trimmedName) {
      Alert.alert("Name required", "Group name cannot be empty.");
      return;
    }

    setSavingProfile(true);

    try {
      await updateGroup(group.id, {
        name: trimmedName,
        description: editDescription.trim() || undefined,
      });
      setEditingProfile(false);
      await onUpdated();
    } catch (e) {
      Alert.alert(
        "Couldn't update group",
        e instanceof Error ? e.message : "Something went wrong."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const memberActionsOptions: ActionSheetOption[] = memberActionsFor
    ? [
        {
          text: "Remove from group",
          style: "destructive",
          onPress: async () => {
            await removeGroupMember(group.id, memberActionsFor);
            onUpdated();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    : [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.flex, { backgroundColor: theme.bg }]}>
        <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
          <TouchableOpacity onPress={onClose} style={{ paddingRight: 10 }}>
            <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.headTitle, { color: theme.ink }]}>Group info</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <TouchableOpacity onPress={changeAvatar} disabled={!isOwner}>
              {group.avatarUri ? (
                <Image source={{ uri: group.avatarUri }} style={s.infoAvatar} />
              ) : (
                <View style={[s.infoAvatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: "white", fontSize: 32, fontWeight: "900" }}>{group.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              {isOwner && (
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 6, textAlign: "center" }}>
                  Tap to change
                </Text>
              )}
            </TouchableOpacity>

            {editingProfile ? (
              <View style={{ width: "100%", marginTop: 12 }}>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Group name"
                  placeholderTextColor={theme.muted}
                  style={[s.input, { color: theme.ink, borderColor: theme.line, textAlign: "center" }]}
                />
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Description (optional)"
                  placeholderTextColor={theme.muted}
                  style={[s.input, { color: theme.ink, borderColor: theme.line, textAlign: "center", marginTop: 8 }]}
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => setEditingProfile(false)}
                    disabled={savingProfile}
                    style={[s.button, { borderColor: theme.line, borderWidth: 1 }]}
                  >
                    <Text style={{ color: theme.ink }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveProfile}
                    disabled={savingProfile}
                    style={[s.button, { backgroundColor: theme.brand }]}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {savingProfile ? "Saving…" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={startEditingProfile}
                disabled={!isOwner}
                style={{ alignItems: "center", marginTop: 12 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: theme.ink, fontWeight: "900", fontSize: 20 }}>{group.name}</Text>
                  {isOwner && <Text style={{ color: theme.muted, fontSize: 14 }}>✎</Text>}
                </View>
                {group.description && (
                  <Text style={{ color: theme.muted, textAlign: "center", marginTop: 6 }}>{group.description}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 14, marginBottom: 8 }}>
            {group.memberIds.length} member(s)
          </Text>

          {canManageMembers && (
            <TouchableOpacity
              onPress={() => setAddMembersVisible(true)}
              style={[s.row, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 6, borderStyle: "dashed" }]}
            >
              <Text style={{ fontSize: 20, color: theme.brand, width: 48, textAlign: "center" }}>＋</Text>
              <Text style={{ color: theme.brand, fontWeight: "700" }}>Add members</Text>
            </TouchableOpacity>
          )}

          {group.memberIds.map((id) => (
            <TouchableOpacity
              key={id}
              onLongPress={() => {
                if (isOwner && id !== myId) setMemberActionsFor(id);
              }}
              style={[s.row, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 6 }]}
            >
              <View style={[s.avatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>{nameFor(id).slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={{ flex: 1, color: theme.ink }} numberOfLines={1}>{nameFor(id)}</Text>
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>{roleFor(id)}</Text>
            </TouchableOpacity>
          ))}

          {isOwner ? (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Delete group?", "This removes the group and all its messages for you. This cannot be undone.", [
                  { text: "Delete", style: "destructive", onPress: async () => { await deleteGroup(group.id); onLeft(); } },
                  { text: "Cancel", style: "cancel" },
                ])
              }
              style={[s.button, { backgroundColor: theme.danger, marginTop: 24 }]}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Delete group</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Leave group?", "You can be re-added later by a member.", [
                  { text: "Leave", style: "destructive", onPress: async () => { await removeGroupMember(group.id, myId); onLeft(); } },
                  { text: "Cancel", style: "cancel" },
                ])
              }
              style={[s.button, { backgroundColor: theme.danger, marginTop: 24 }]}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Leave group</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <ActionSheet
          visible={!!memberActionsFor}
          title="Member"
          options={memberActionsOptions}
          onRequestClose={() => setMemberActionsFor(null)}
          theme={theme}
        />

        <Modal visible={addMembersVisible} transparent animationType="fade" onRequestClose={() => setAddMembersVisible(false)}>
          <View style={s.overlay}>
            <View style={[s.card, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>Add members</Text>

              <ScrollView style={{ maxHeight: 260 }}>
                {addableContacts.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Everyone in your contacts is already in this group.</Text>
                ) : (
                  addableContacts.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={async () => {
                        await addGroupMember(group.id, c.id);
                        onUpdated();
                      }}
                      style={[s.memberRow, { borderColor: theme.line }]}
                    >
                      <Text style={{ color: theme.ink, flex: 1 }}>{c.displayName || c.id}</Text>
                      <Text style={{ color: theme.brand, fontWeight: "800" }}>Add</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={() => setAddMembersVisible(false)}
                style={[s.button, { borderColor: theme.line, borderWidth: 1, marginTop: 12 }]}
              >
                <Text style={{ color: theme.ink }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  headTitle: { fontSize: 20, fontWeight: "800" },
  headSub: { fontSize: 12, marginTop: 2 },
  empty: { padding: 30, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderRadius: 16, marginBottom: 8, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40 },
  infoAvatar: { width: 96, height: 96, borderRadius: 48 },
  overlay: { flex: 1, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", borderRadius: 16, padding: 16, maxHeight: "85%" },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 4 },
});
