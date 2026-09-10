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

import { Identity } from "../core/identity";
import { pickProfilePhoto } from "../core/media";
import {
  Community,
  createCommunity,
  deleteCommunity,
  getCommunities,
  updateCommunity,
} from "../core/communities";
import { Group, getGroups } from "../core/groups";
import { GroupChat } from "./GroupChat";

type CommunitiesScreenProps = {
  theme: any;
  identity: Identity | null;
};

export function CommunitiesScreen({ theme, identity }: CommunitiesScreenProps) {
  const myId = identity?.id;

  const [communities, setCommunities] = useState<Community[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [openCommunity, setOpenCommunity] = useState<Community | null>(null);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [editingCommunity, setEditingCommunity] = useState(false);
  const [editCommunityName, setEditCommunityName] = useState("");
  const [editCommunityDescription, setEditCommunityDescription] = useState("");
  const [editCommunityAvatarUri, setEditCommunityAvatarUri] = useState<string | null>(null);
  const [savingCommunityEdit, setSavingCommunityEdit] = useState(false);

  const load = useCallback(async () => {
    if (!myId) return;

    setLoading(true);

    try {
      const [allCommunities, allGroups] = await Promise.all([
        getCommunities(),
        getGroups(),
      ]);

      setCommunities(allCommunities);
      setMyGroups(allGroups.filter((g) => g.memberIds.includes(myId)));
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

  const pickEditAvatar = async () => {
    try {
      const uri = await pickProfilePhoto();
      if (uri) setEditCommunityAvatarUri(uri);
    } catch (e) {
      Alert.alert("Couldn't set image", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const openEditCommunity = () => {
    if (!openCommunity) return;
    setEditCommunityName(openCommunity.name);
    setEditCommunityDescription(openCommunity.description || "");
    setEditCommunityAvatarUri(openCommunity.avatarUri || null);
    setEditingCommunity(true);
  };

  const saveCommunityEdit = async () => {
    if (!openCommunity) return;

    const trimmedName = editCommunityName.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Community name cannot be empty.");
      return;
    }

    setSavingCommunityEdit(true);

    try {
      await updateCommunity(openCommunity.id, {
        name: trimmedName,
        description: editCommunityDescription.trim() || undefined,
        avatarUri: editCommunityAvatarUri || undefined,
      });

      const all = await getCommunities();
      setCommunities(all);
      setOpenCommunity(all.find((c) => c.id === openCommunity.id) || null);
      setEditingCommunity(false);
    } catch (e) {
      Alert.alert("Couldn't update community", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSavingCommunityEdit(false);
    }
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submitCreate = async () => {
    if (!myId) return;

    try {
      await createCommunity(newName, myId, selectedGroupIds, newDescription, newAvatarUri || undefined);
      setNewName("");
      setNewDescription("");
      setNewAvatarUri(null);
      setSelectedGroupIds([]);
      setCreateVisible(false);
      await load();
    } catch (e) {
      Alert.alert("Couldn't create community", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  if (openGroup && identity) {
    return (
      <GroupChat
        theme={theme}
        group={openGroup}
        identity={identity}
        onBack={() => setOpenGroup(null)}
        onOpenInfo={() => {}}
      />
    );
  }

  if (openCommunity) {
    const groupsInCommunity = myGroups.filter((g) => openCommunity.groupIds.includes(g.id));

    return (
      <View style={s.flex}>
        <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
          <TouchableOpacity onPress={() => setOpenCommunity(null)} style={{ paddingRight: 10 }}>
            <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
          </TouchableOpacity>

          {openCommunity.avatarUri ? (
            <Image source={{ uri: openCommunity.avatarUri }} style={s.headerAvatar} />
          ) : (
            <View style={[s.headerAvatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "white", fontWeight: "900" }}>{openCommunity.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[s.headTitle, { color: theme.ink }]}>{openCommunity.name}</Text>
            <Text style={[s.headSub, { color: theme.muted }]}>{groupsInCommunity.length} group(s)</Text>
          </View>

          {openCommunity.ownerId === myId && (
            <TouchableOpacity onPress={openEditCommunity} style={{ padding: 8 }}>
              <Text style={{ fontSize: 18 }}>✎</Text>
            </TouchableOpacity>
          )}

          {openCommunity.ownerId === myId && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Delete community?", "The groups inside it are not deleted, only the community container.", [
                  { text: "Delete", style: "destructive", onPress: async () => { await deleteCommunity(openCommunity.id); setOpenCommunity(null); await load(); } },
                  { text: "Cancel", style: "cancel" },
                ])
              }
              style={{ padding: 8 }}
            >
              <Text style={{ fontSize: 18 }}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>

        {openCommunity.description && (
          <Text style={{ color: theme.muted, padding: 16, paddingBottom: 0 }}>{openCommunity.description}</Text>
        )}

        <FlatList
          data={groupsInCommunity}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ color: theme.muted }}>No groups in this community yet.</Text>
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
                <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 15 }}>{item.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{item.memberIds.length} member(s)</Text>
              </View>
              <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          )}
        />

        <Modal visible={editingCommunity} transparent animationType="fade" onRequestClose={() => setEditingCommunity(false)}>
          <View style={s.overlay}>
            <View style={[s.card, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>Edit community</Text>

              <TouchableOpacity onPress={pickEditAvatar} style={{ alignSelf: "center", marginBottom: 12 }}>
                {editCommunityAvatarUri ? (
                  <Image source={{ uri: editCommunityAvatarUri }} style={s.avatarLarge} />
                ) : (
                  <View style={[s.avatarLarge, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.line }]}>
                    <Text style={{ fontSize: 22 }}>📷</Text>
                  </View>
                )}
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 6, textAlign: "center" }}>
                  Tap to change
                </Text>
              </TouchableOpacity>

              <TextInput
                value={editCommunityName}
                onChangeText={setEditCommunityName}
                placeholder="Community name"
                placeholderTextColor={theme.muted}
                style={[s.input, { color: theme.ink, borderColor: theme.line }]}
              />

              <TextInput
                value={editCommunityDescription}
                onChangeText={setEditCommunityDescription}
                placeholder="Description (optional)"
                placeholderTextColor={theme.muted}
                style={[s.input, { color: theme.ink, borderColor: theme.line, marginTop: 8 }]}
              />

              <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setEditingCommunity(false)}
                  disabled={savingCommunityEdit}
                  style={[s.button, { borderColor: theme.line, borderWidth: 1 }]}
                >
                  <Text style={{ color: theme.ink }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={saveCommunityEdit}
                  disabled={savingCommunityEdit}
                  style={[s.button, { backgroundColor: theme.brand }]}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {savingCommunityEdit ? "Saving…" : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={s.flex}>
      <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headTitle, { color: theme.ink }]}>Communities</Text>
          <Text style={[s.headSub, { color: theme.muted }]}>A home for several related groups</Text>
        </View>

        <TouchableOpacity onPress={() => setCreateVisible(true)} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 26, color: theme.brand }}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={communities}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ color: theme.muted }}>{loading ? "Loading communities…" : "No communities yet."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setOpenCommunity(item)}
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
              <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 15 }}>{item.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                {item.description || `${item.groupIds.length} group(s)`}
              </Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>New community</Text>

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
              placeholder="Community name"
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
              Include groups
            </Text>

            <ScrollView style={{ maxHeight: 160 }}>
              {myGroups.length === 0 ? (
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  Create a group first, then add it to a community.
                </Text>
              ) : (
                myGroups.map((g) => {
                  const selected = selectedGroupIds.includes(g.id);
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => toggleGroup(g.id)}
                      style={[s.memberRow, { borderColor: theme.line, backgroundColor: selected ? theme.bg : "transparent" }]}
                    >
                      <Text style={{ color: theme.ink, flex: 1 }}>{g.name}</Text>
                      <Text style={{ color: selected ? theme.brand : theme.muted, fontWeight: "800" }}>
                        {selected ? "✓" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })
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
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  headTitle: { fontSize: 20, fontWeight: "800" },
  headSub: { fontSize: 12, marginTop: 2 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  empty: { padding: 30, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderRadius: 16, marginBottom: 8, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40 },
  overlay: { flex: 1, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", borderRadius: 16, padding: 16, maxHeight: "85%" },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 4 },
});
