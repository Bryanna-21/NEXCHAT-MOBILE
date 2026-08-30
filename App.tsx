import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import {
  initIdentity,
  getIdentity,
  Identity,
} from "./src/core/identity";

import { initVault } from "./src/core/vault";

import {
  Conversation,
  Message,
  useNexChatStore,
} from "./src/core/store";

type Tab = "Chats" | "Discover" | "Calls" | "Vault" | "Settings";

const COLORS = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  ink: "#102A43",
  muted: "#66788A",
  brand: "#0C5A8D",
  sent: "#D8FDD2",
  received: "#FFFFFF",
  line: "#D9E2EC",
  danger: "#B42318",
};

function Logo({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.logo, small && styles.logoSmall]}>
      <Text style={[styles.logoN, small && styles.logoNSmall]}>N</Text>
      <View style={styles.lock}>
        <View style={styles.lockBody} />
      </View>
    </View>
  );
}

function Header({
  title,
  subtitle,
  back,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      {back && (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
      )}

      <Logo small />

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function Empty({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Logo />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>

      {action && (
        <TouchableOpacity style={styles.primary} onPress={onPress}>
          <Text style={styles.primaryText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Chats({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: (conversation: Conversation) => void;
}) {
  const { conversations } = useNexChatStore();

  const sorted = useMemo(
    () =>
      [...conversations]
        .filter((item) => !item.archived)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""),
        ),
    [conversations],
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title="Chats" subtitle="Private conversations" />

      {sorted.length === 0 ? (
        <Empty
          title="Your messages stay yours"
          body="Start a conversation. A contact gets one conversation, not a new chat entry for every message."
          action="New message"
          onPress={onNew}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatCard}
              onPress={() => onOpen(item)}
              onLongPress={() =>
                Alert.alert(item.title, "Conversation options", [
                  {
                    text: item.pinned ? "Unpin" : "Pin",
                    onPress: async () => {
                      const store = useNexChatStore();
                      await store.togglePin(item.id);
                    },
                  },
                  {
                    text: item.archived ? "Unarchive" : "Archive",
                    onPress: async () => {
                      const store = useNexChatStore();
                      await store.toggleArchive(item.id);
                    },
                  },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.avatarLetter}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.chatTitleRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>

                  {item.pinned && <Text style={styles.pin}>📌</Text>}

                  {item.muted && <Text style={styles.pin}>🔕</Text>}
                </View>

                <Text numberOfLines={1} style={styles.cardBody}>
                  {item.lastMessage || "No messages yet"}
                </Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                {item.lastMessageAt && (
                  <Text style={styles.time}>
                    {new Date(item.lastMessageAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                )}

                {item.unreadCount > 0 && (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>
                      {item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={onNew}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

function NewMessage({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (conversation: Conversation) => void;
}) {
  const [peer, setPeer] = useState("");
  const [text, setText] = useState("");

  const store = useNexChatStore();

  async function send() {
    if (!peer.trim()) {
      Alert.alert("Missing contact", "Enter a NexChat ID.");
      return;
    }

    if (!text.trim()) {
      Alert.alert("Missing message", "Write a message.");
      return;
    }

    try {
      const conversation = await store.openOrCreateConversation(peer);
      await store.sendText(conversation.peerId, text);
      setText("");
      onOpen(conversation);
    } catch (error) {
      Alert.alert(
        "Unable to send",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="New message"
        subtitle="Use a NexChat ID"
        back
        onBack={onBack}
      />

      <View style={styles.form}>
        <Text style={styles.label}>NexChat ID</Text>

        <TextInput
          value={peer}
          onChangeText={setPeer}
          placeholder="N-4827-9153-64"
          autoCapitalize="characters"
          style={styles.input}
        />

        <Text style={styles.label}>Message</Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write something…"
          multiline
          style={[styles.input, styles.messageInput]}
        />

        <TouchableOpacity style={styles.primary} onPress={send}>
          <Text style={styles.primaryText}>Open conversation</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChatScreen({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const store = useNexChatStore();
  const [text, setText] = useState("");

  const messages = useMemo(
    () => store.getMessages(conversation.id),
    [store, conversation.id, store.messages],
  );

  async function send() {
    if (!text.trim()) return;

    try {
      await store.sendText(conversation.peerId, text);
      setText("");
    } catch (error) {
      Alert.alert(
        "Unable to send",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    }
  }

  function messageTime(message: Message) {
    return new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function messageMenu(message: Message) {
    Alert.alert("Message", undefined, [
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await store.deleteMessage(message.id);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header
        title={conversation.title}
        subtitle="NexChat conversation"
        back
        onBack={onBack}
      />

      <View style={styles.encryptionBanner}>
        <Text style={styles.encryptionText}>
          🔒 Private conversation
        </Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => {
          const sent = item.senderId === "me";

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => messageMenu(item)}
              style={[
                styles.bubble,
                sent ? styles.sentBubble : styles.receivedBubble,
                sent ? styles.sentAlign : styles.receivedAlign,
              ]}
            >
              {item.type === "text" && (
                <Text style={styles.messageText}>{item.text}</Text>
              )}

              <View style={styles.messageMeta}>
                <Text style={styles.messageTime}>
                  {messageTime(item)}
                </Text>

                {sent && (
                  <Text style={styles.status}>
                    {item.status === "read"
                      ? "✓✓"
                      : item.status === "delivered"
                        ? "✓✓"
                        : "✓"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>
              No messages yet
            </Text>
            <Text style={styles.emptyChatBody}>
              Send the first message in this conversation.
            </Text>
          </View>
        }
      />

      <View style={styles.composer}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() =>
            Alert.alert(
              "Attachments",
              "Photos, videos, voice notes and files are being connected to the universal attachment engine.",
            )
          }
        >
          <Text style={styles.attachText}>＋</Text>
        </TouchableOpacity>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          multiline
          style={styles.composerInput}
        />

        <TouchableOpacity
          style={styles.sendButton}
          onPress={send}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Discover() {
  return (
    <View style={{ flex: 1 }}>
      <Header title="Discover" subtitle="Public content" />

      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={[
          [
            "Welcome to NexChat",
            "Public discovery is separated from private conversations.",
          ],
          [
            "Privacy by design",
            "Private messages are not treated as public feed content.",
          ],
        ]}
        renderItem={({ item }) => (
          <View style={styles.post}>
            <Text style={styles.cardTitle}>{item[0]}</Text>
            <Text style={styles.cardBody}>{item[1]}</Text>
          </View>
        )}
      />
    </View>
  );
}

function Calls() {
  return (
    <View style={{ flex: 1 }}>
      <Header title="Calls" subtitle="Voice and video" />

      <Empty
        title="Calls"
        body="The call interface will use the same identity and privacy layer as messaging."
      />
    </View>
  );
}

function Vault() {
  const { vaultBytes, hydrated } = useNexChatStore();

  return (
    <View style={{ flex: 1 }}>
      <Header title="Vault" subtitle="Private device storage" />

      <View style={styles.form}>
        <View style={styles.stat}>
          <Text style={styles.cardTitle}>Vault status</Text>

          <Text style={styles.statValue}>
            {hydrated ? "READY" : "INITIALIZING"}
          </Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.cardTitle}>Encrypted payload</Text>

          <Text style={styles.statValue}>
            {vaultBytes} bytes
          </Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.cardTitle}>Local-first storage</Text>

          <Text style={styles.cardBody}>
            Messages remain in the local encrypted storage layer.
            Network synchronization will be added separately.
          </Text>
        </View>
      </View>
    </View>
  );
}

function Settings({
  identity,
  onReset,
}: {
  identity: Identity;
  onReset: () => void;
}) {
  const [biometric, setBiometric] = useState(false);

  async function toggleBiometric() {
    const hardware = await LocalAuthentication.hasHardwareAsync();

    if (!hardware) {
      Alert.alert(
        "Unavailable",
        "This device does not expose biometric hardware.",
      );
      return;
    }

    const enrolled =
      await LocalAuthentication.isEnrolledAsync();

    if (!enrolled) {
      Alert.alert(
        "No biometric enrolled",
        "Set up a fingerprint or other biometric on the device first.",
      );
      return;
    }

    setBiometric((value) => !value);
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Settings"
        subtitle="Identity, privacy and device"
      />

      <FlatList
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={[
          {
            title: "Your NexChat ID",
            body: identity.id,
          },
          {
            title: "Profile",
            body: "Name, nickname, photo and about information.",
          },
          {
            title: "Privacy",
            body: "Last seen, online status, read receipts and discoverability.",
          },
          {
            title: "Blocked contacts",
            body: "Manage people you have blocked.",
          },
          {
            title: "Devices",
            body: "Review trusted devices and revoke access.",
          },
          {
            title: "Recovery",
            body: "Recovery Kit and trusted-device recovery.",
          },
          {
            title: "Chat defaults",
            body: "Disappearing messages, media behavior and themes.",
          },
        ]}
        renderItem={({ item }) => (
          <View style={styles.setting}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              style={styles.setting}
              onPress={toggleBiometric}
            >
              <Text style={styles.cardTitle}>
                Biometric unlock
              </Text>

              <Text style={styles.cardBody}>
                {biometric ? "Enabled" : "Disabled"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.danger}
              onPress={onReset}
            >
              <Text style={styles.dangerText}>
                Reset local demo data
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Chats");
  const [newMessage, setNewMessage] = useState(false);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [identity, setIdentity] =
    useState<Identity | null>(null);

  const store = useNexChatStore();

  useEffect(() => {
    (async () => {
      try {
        await initVault();
        await initIdentity();

        const id = await getIdentity();

        setIdentity(id);

        await store.hydrate();
      } catch (error) {
        console.warn("NexChat initialization warning:", error);

        await store.hydrate();
      }
    })();
  }, []);

  const screen = useMemo(() => {
    if (!identity) {
      return (
        <Empty
          title="Preparing NexChat"
          body="Initializing the local identity and storage layer."
        />
      );
    }

    if (activeConversation) {
      return (
        <ChatScreen
          conversation={activeConversation}
          onBack={() => setActiveConversation(null)}
        />
      );
    }

    if (newMessage) {
      return (
        <NewMessage
          onBack={() => setNewMessage(false)}
          onOpen={(conversation) => {
            setNewMessage(false);
            setActiveConversation(conversation);
          }}
        />
      );
    }

    switch (tab) {
      case "Chats":
        return (
          <Chats
            onNew={() => setNewMessage(true)}
            onOpen={(conversation) =>
              setActiveConversation(conversation)
            }
          />
        );

      case "Discover":
        return <Discover />;

      case "Calls":
        return <Calls />;

      case "Vault":
        return <Vault />;

      case "Settings":
        return (
          <Settings
            identity={identity}
            onReset={async () => {
              await store.reset();
              Alert.alert(
                "Reset",
                "Local demo data cleared.",
              );
            }}
          />
        );
    }
  }, [
    identity,
    tab,
    newMessage,
    activeConversation,
    store.messages,
    store.conversations,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {screen}

      {!activeConversation && !newMessage && (
        <View style={styles.tabs}>
          {(
            [
              "Chats",
              "Discover",
              "Calls",
              "Vault",
              "Settings",
            ] as Tab[]
          ).map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.tab}
              onPress={() => setTab(item)}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === item && styles.activeTab,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    minHeight: 74,
    padding: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  backButton: {
    width: 28,
    alignItems: "center",
  },

  backText: {
    fontSize: 36,
    color: COLORS.brand,
    lineHeight: 36,
  },

  title: {
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.ink,
  },

  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },

  logo: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: "#E8F3FA",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "#C7DFEF",
  },

  logoSmall: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },

  logoN: {
    fontSize: 42,
    fontWeight: "900",
    color: COLORS.brand,
  },

  logoNSmall: {
    fontSize: 23,
  },

  lock: {
    position: "absolute",
    top: 18,
    right: 17,
    width: 22,
    height: 22,
    borderWidth: 3,
    borderColor: COLORS.brand,
    borderRadius: 6,
    alignItems: "center",
  },

  lockBody: {
    position: "absolute",
    top: 8,
    width: 17,
    height: 12,
    backgroundColor: COLORS.brand,
    borderRadius: 3,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },

  emptyTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: COLORS.ink,
    marginTop: 18,
    textAlign: "center",
  },

  emptyBody: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 320,
  },

  primary: {
    backgroundColor: COLORS.brand,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 16,
  },

  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  form: {
    padding: 16,
    gap: 12,
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.ink,
  },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: COLORS.ink,
  },

  messageInput: {
    height: 120,
    textAlignVertical: "top",
  },

  chatCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#DDECF6",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontWeight: "900",
    color: COLORS.brand,
    fontSize: 18,
  },

  chatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  cardTitle: {
    fontWeight: "800",
    color: COLORS.ink,
    fontSize: 15,
  },

  cardBody: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  pin: {
    fontSize: 12,
  },

  time: {
    fontSize: 10,
    color: COLORS.muted,
  },

  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },

  unreadText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },

  fabText: {
    color: "#FFFFFF",
    fontSize: 30,
  },

  messages: {
    padding: 14,
    gap: 7,
    flexGrow: 1,
    backgroundColor: COLORS.bg,
  },

  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  sentBubble: {
    backgroundColor: COLORS.sent,
    borderTopRightRadius: 4,
  },

  receivedBubble: {
    backgroundColor: COLORS.received,
    borderTopLeftRadius: 4,
  },

  sentAlign: {
    alignSelf: "flex-end",
  },

  receivedAlign: {
    alignSelf: "flex-start",
  },

  messageText: {
    color: COLORS.ink,
    fontSize: 16,
    lineHeight: 22,
  },

  messageMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },

  messageTime: {
    fontSize: 9,
    color: COLORS.muted,
  },

  status: {
    fontSize: 10,
    color: COLORS.brand,
  },

  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyChatTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.ink,
  },

  emptyChatBody: {
    color: COLORS.muted,
    marginTop: 5,
  },

  encryptionBanner: {
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "#EDF7F0",
  },

  encryptionText: {
    fontSize: 11,
    color: "#276749",
    fontWeight: "700",
  },

  composer: {
    padding: 8,
    gap: 7,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },

  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  attachText: {
    fontSize: 28,
    color: COLORS.brand,
  },

  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 15,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.ink,
  },

  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  sendText: {
    color: "#FFFFFF",
    fontSize: 18,
  },

  post: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  stat: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.brand,
    marginTop: 6,
  },

  setting: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  danger: {
    borderWidth: 1,
    borderColor: "#F3B3AE",
    backgroundColor: "#FFF5F4",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },

  dangerText: {
    color: COLORS.danger,
    fontWeight: "800",
  },

  tabs: {
    height: 64,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    flexDirection: "row",
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabText: {
    fontSize: 11,
    color: COLORS.muted,
  },

  activeTab: {
    color: COLORS.brand,
    fontWeight: "800",
  },
});
