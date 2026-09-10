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

import { Attachment, useNexChatStore } from "../core/store";
import { Identity } from "../core/identity";
import { capturePhoto, pickMedia } from "../core/media";
import {
  Group,
  GroupMessage,
  deleteGroupMessage,
  getGroupMessages,
  logGroupCall,
  sendGroupMessage,
} from "../core/groups";
import { ActionSheet, ActionSheetOption } from "./ActionSheet";
import VoiceRecorder from "./audio/VoiceRecorder";
import { TypingDots } from "./TypingDots";

function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function GroupCallOverlay({
  theme,
  video,
  groupName,
  onEnd,
}: {
  theme: any;
  video: boolean;
  groupName: string;
  onEnd: (outcome: { status: "completed" | "failed"; durationSeconds?: number }) => void;
}) {
  const [status, setStatus] = useState<"calling" | "connected">("calling");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStatus("connected"), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    const i = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(i);
  }, [status]);

  const end = () => {
    onEnd({
      status: status === "connected" ? "completed" : "failed",
      durationSeconds: status === "connected" ? elapsed : undefined,
    });
  };

  return (
    <Modal transparent visible onRequestClose={end}>
      <View style={gs.callOverlay}>
        <View style={[gs.callCard, { backgroundColor: theme.card }]}>
          <View style={[gs.bigAvatar, { backgroundColor: theme.brand }]}>
            <Text style={{ color: "white", fontSize: 30, fontWeight: "900" }}>
              {groupName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: theme.ink, fontSize: 20, fontWeight: "900", marginTop: 10 }}>
            {groupName}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 16 }}>
            {video ? "🎥 Group video" : "📞 Group voice"}
          </Text>
          <Text style={{ color: theme.ink, fontWeight: "800", marginTop: 16 }}>
            {status === "calling" ? "Calling…" : formatCallDuration(elapsed)}
          </Text>
          {status === "calling" && <TypingDots color={theme.ink} />}
          <Text style={{ color: theme.muted, textAlign: "center", marginTop: 12, fontSize: 12 }}>
            Real audio/video transport requires the native WebRTC build. This is a local call attempt, honestly tracked — not a live connection.
          </Text>
          <TouchableOpacity onPress={end} style={[gs.endButton, { backgroundColor: theme.danger }]}>
            <Text style={{ color: "white", fontWeight: "800" }}>End call</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function GroupChat({
  theme,
  group,
  identity,
  onBack,
  onOpenInfo,
}: {
  theme: any;
  group: Group;
  identity: Identity | null;
  onBack: () => void;
  onOpenInfo: () => void;
}) {
  const st = useNexChatStore();
  const myId = identity?.id;

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [call, setCall] = useState<{ video: boolean } | null>(null);
  const [msgActionsFor, setMsgActionsFor] = useState<GroupMessage | null>(null);

  const load = useCallback(async () => {
    const result = await getGroupMessages(group.id);
    setMessages(result);
  }, [group.id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (attachment?: Attachment) => {
    if (!myId) return;
    if (!text.trim() && !attachment) return;

    await sendGroupMessage(group.id, myId, text.trim(), attachment);
    setText("");
    await load();
  };

  const attachOptions: ActionSheetOption[] = [
    {
      text: "Camera",
      onPress: async () => {
        try {
          const a = await capturePhoto();
          if (a) await send(a);
        } catch (e) {
          Alert.alert("Camera unavailable", e instanceof Error ? e.message : "Unable to use the camera.");
        }
      },
    },
    {
      text: "Photos / Videos",
      onPress: async () => {
        try {
          const picked = await pickMedia(true);
          for (const item of picked) {
            await send(item);
          }
        } catch (e) {
          Alert.alert("Media unavailable", e instanceof Error ? e.message : "Unable to access media.");
        }
      },
    },
    { text: "Cancel", style: "cancel" },
  ];

  const msgActionsOptions: ActionSheetOption[] = msgActionsFor
    ? [
        ...(msgActionsFor.senderId === myId
          ? [
              {
                text: "Delete message",
                style: "destructive" as const,
                onPress: async () => {
                  await deleteGroupMessage(msgActionsFor.id);
                  await load();
                },
              },
            ]
          : []),
        { text: "Cancel", style: "cancel" as const },
      ]
    : [];

  const endCall = async (outcome: { status: "completed" | "failed"; durationSeconds?: number }) => {
    if (!myId || !call) return;
    const video = call.video;
    setCall(null);

    await logGroupCall(group.id, myId, {
      type: video ? "video" : "voice",
      status: outcome.status,
      durationSeconds: outcome.durationSeconds,
    });

    await load();
  };

  return (
    <View style={gs.flex}>
      <View style={[gs.header, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <TouchableOpacity onPress={onBack} style={{ paddingRight: 10 }}>
          <Text style={{ color: theme.ink, fontSize: 28 }}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenInfo} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          {group.avatarUri ? (
            <Image source={{ uri: group.avatarUri }} style={gs.headerAvatar} />
          ) : (
            <View style={[gs.headerAvatar, { backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "white", fontWeight: "900" }}>{group.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.ink, fontWeight: "900", fontSize: 16 }}>{group.name}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{group.memberIds.length} member(s)</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCall({ video: false })} style={{ padding: 8 }}>
          <Text style={{ fontSize: 20 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCall({ video: true })} style={{ padding: 8 }}>
          <Text style={{ fontSize: 20 }}>🎥</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        inverted
        data={[...messages].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        ListEmptyComponent={
          <View style={gs.empty}>
            <Text style={{ color: theme.muted }}>Start the group conversation.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === myId;

          return (
            <TouchableOpacity
              onLongPress={() => setMsgActionsFor(item)}
              delayLongPress={350}
              style={[
                gs.bubble,
                {
                  alignSelf: mine ? "flex-end" : "flex-start",
                  backgroundColor: mine ? theme.bubbleMe : theme.bubbleThem,
                  borderColor: theme.line,
                },
              ]}
            >
              {!mine && (
                <Text style={{ color: theme.brand, fontSize: 11, fontWeight: "800", marginBottom: 2 }}>
                  {item.senderId}
                </Text>
              )}

              {item.callInfo ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>{item.callInfo.type === "video" ? "🎥" : "📞"}</Text>
                  <View>
                    <Text style={{ color: theme.ink, fontWeight: "700" }}>
                      {item.callInfo.type === "video" ? "Video call" : "Voice call"}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>
                      {item.callInfo.status === "completed"
                        ? item.callInfo.durationSeconds != null
                          ? formatCallDuration(item.callInfo.durationSeconds)
                          : "Completed"
                        : "Not connected"}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {item.text ? <Text style={{ color: theme.ink, fontSize: 16 }}>{item.text}</Text> : null}
                </>
              )}

              <Text style={{ fontSize: 10, color: theme.muted, alignSelf: "flex-end", marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {voiceVisible ? (
        <VoiceRecorder
          theme={theme}
          onCancel={() => setVoiceVisible(false)}
          onRecorded={async (attachment) => {
            setVoiceVisible(false);
            await send(attachment);
          }}
        />
      ) : (
        <View style={[gs.composer, { backgroundColor: theme.card, borderTopColor: theme.line }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={() => setAttachMenuVisible(true)}>
              <Text style={{ fontSize: 25, color: theme.ink }}>＋</Text>
            </TouchableOpacity>

            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Message"
              placeholderTextColor={theme.muted}
              style={[gs.input, { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg }]}
            />

            {text.trim() ? (
              <TouchableOpacity onPress={() => send()} style={[gs.sendBtn, { backgroundColor: theme.brand }]}>
                <Text style={{ color: "white", fontWeight: "900" }}>➤</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setVoiceVisible(true)} style={[gs.sendBtn, { backgroundColor: theme.brand }]}>
                <Text style={{ fontSize: 18 }}>🎙</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ActionSheet
        visible={attachMenuVisible}
        title="Attachments"
        message="Choose what to send"
        options={attachOptions}
        onRequestClose={() => setAttachMenuVisible(false)}
        theme={theme}
      />

      <ActionSheet
        visible={!!msgActionsFor}
        title="Message"
        options={msgActionsOptions}
        onRequestClose={() => setMsgActionsFor(null)}
        theme={theme}
      />

      {call && (
        <GroupCallOverlay theme={theme} video={call.video} groupName={group.name} onEnd={endCall} />
      )}
    </View>
  );
}

const gs = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },

  headerAvatar: { width: 36, height: 36, borderRadius: 18 },

  empty: { padding: 30, alignItems: "center" },

  bubble: {
    maxWidth: "82%",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 2,
  },

  composer: { padding: 8, borderTopWidth: 1 },

  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  callOverlay: {
    flex: 1,
    backgroundColor: "#000B",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  callCard: {
    width: "90%",
    borderRadius: 26,
    padding: 28,
    alignItems: "center",
    gap: 6,
  },

  bigAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },

  endButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 14,
  },
});
