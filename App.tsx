import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import {
  initIdentity,
  getIdentity,
  Identity
} from "./src/core/identity";

import { initVault } from "./src/core/vault";

import {
  useNexChatStore
} from "./src/core/store";

type Tab =
  | "Chats"
  | "Stories"
  | "Feed"
  | "Calls"
  | "Vault"
  | "Settings";

const LIGHT = {
  bg: "#F5F8FB",
  card: "#FFFFFF",
  ink: "#102A43",
  muted: "#66788A",
  brand: "#0C5A8D",
  brand2: "#167DB7",
  line: "#D9E2EC",
  danger: "#B42318",
  good: "#087443"
};

const DARK = {
  bg: "#08111A",
  card: "#101C27",
  ink: "#F2F7FA",
  muted: "#9BAEBD",
  brand: "#42A5E5",
  brand2: "#6CC4F5",
  line: "#263847",
  danger: "#FF8A80",
  good: "#63D6A0"
};

function Logo({
  small = false,
  colors
}: {
  small?: boolean;
  colors: typeof LIGHT;
}) {
  return (
    <View
      style={[
        styles.logo,
        {
          backgroundColor: colors.card,
          borderColor: colors.line
        },
        small && {
          width: 42,
          height: 42,
          borderRadius: 14
        }
      ]}
    >
      <Text
        style={[
          styles.logoN,
          { color: colors.brand },
          small && { fontSize: 22 }
        ]}
      >
        N
      </Text>

      <View
        style={[
          styles.lock,
          { borderColor: colors.brand }
        ]}
      >
        <View
          style={[
            styles.lockBody,
            { backgroundColor: colors.brand }
          ]}
        />
      </View>
    </View>
  );
}

function Header({
  title,
  subtitle,
  colors
}: {
  title: string;
  subtitle?: string;
  colors: typeof LIGHT;
}) {
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.line
        }
      ]}
    >
      <View style={styles.headerRow}>
        <Logo small colors={colors} />

        <View>
          <Text style={[styles.title, { color: colors.ink }]}>
            {title}
          </Text>

          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function Empty({
  title,
  body,
  action,
  onPress,
  colors
}: {
  title: string;
  body: string;
  action?: string;
  onPress?: () => void;
  colors: typeof LIGHT;
}) {
  return (
    <View style={styles.empty}>
      <Logo colors={colors} />

      <Text style={[styles.emptyTitle, { color: colors.ink }]}>
        {title}
      </Text>

      <Text style={[styles.emptyBody, { color: colors.muted }]}>
        {body}
      </Text>

      {action && (
        <TouchableOpacity
          style={[styles.primary, { backgroundColor: colors.brand }]}
          onPress={onPress}
        >
          <Text style={styles.primaryText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Chats({
  onNew,
  colors
}: {
  onNew: () => void;
  colors: typeof LIGHT;
}) {
  const { messages } = useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="Chats"
        subtitle="Private local-first messaging"
        colors={colors}
      />

      {messages.length === 0 ? (
        <Empty
          title="Your messages stay yours"
          body="Start a local conversation. Messages are stored through the encrypted local vault."
          action="New message"
          onPress={onNew}
          colors={colors}
        />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.chatCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line
                }
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colors.bg }
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: colors.brand }
                  ]}
                >
                  {item.peer[0]?.toUpperCase()}
                </Text>
              </View>

              <View style={styles.flex}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink }
                  ]}
                >
                  {item.peer}
                </Text>

                <Text
                  style={[
                    styles.cardBody,
                    { color: colors.muted }
                  ]}
                >
                  {item.text}
                </Text>
              </View>

              <Text style={[styles.time, { color: colors.muted }]}>
                {item.status}
              </Text>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: colors.brand }
        ]}
        onPress={onNew}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

function NewMessage({
  onDone,
  colors
}: {
  onDone: () => void;
  colors: typeof LIGHT;
}) {
  const [peer, setPeer] = useState("");
  const [text, setText] = useState("");

  const { addMessage } = useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="New message"
        subtitle="No phone number required"
        colors={colors}
      />

      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.ink }]}>
          NexChat ID or contact
        </Text>

        <TextInput
          value={peer}
          onChangeText={setPeer}
          placeholder="N-4827-9153-64"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.line,
              color: colors.ink
            }
          ]}
        />

        <Text style={[styles.label, { color: colors.ink }]}>
          Message
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write something…"
          placeholderTextColor={colors.muted}
          multiline
          style={[
            styles.input,
            styles.messageInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.line,
              color: colors.ink
            }
          ]}
        />

        <TouchableOpacity
          style={[
            styles.primary,
            { backgroundColor: colors.brand }
          ]}
          onPress={async () => {
            if (!peer.trim() || !text.trim()) {
              Alert.alert(
                "Missing information",
                "Enter a contact and message."
              );
              return;
            }

            await addMessage({
              peer,
              text,
              status: "Queued locally"
            });

            onDone();
          }}
        >
          <Text style={styles.primaryText}>
            Send locally
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stories({
  colors,
  identity
}: {
  colors: typeof LIGHT;
  identity: Identity;
}) {
  const {
    stories,
    addStory,
    viewStory
  } = useNexChatStore();

  const [text, setText] = useState("");

  return (
    <View style={styles.flex}>
      <Header
        title="Stories"
        subtitle="Disappears after 24 hours"
        colors={colors}
      />

      <View style={styles.form}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Share a moment…"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.line,
              color: colors.ink
            }
          ]}
        />

        <TouchableOpacity
          style={[
            styles.primary,
            { backgroundColor: colors.brand }
          ]}
          onPress={async () => {
            if (!text.trim()) return;

            await addStory(identity.id, text.trim());
            setText("");
          }}
        >
          <Text style={styles.primaryText}>
            Post story
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={stories}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Empty
            title="No active stories"
            body="Stories automatically expire after 24 hours."
            colors={colors}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => viewStory(item.id)}
            style={[
              styles.post,
              {
                backgroundColor: colors.card,
                borderColor: item.viewed
                  ? colors.line
                  : colors.brand
              }
            ]}
          >
            <View style={styles.storyHeader}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colors.bg }
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: colors.brand }
                  ]}
                >
                  {item.author[0]?.toUpperCase()}
                </Text>
              </View>

              <View style={styles.flex}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink }
                  ]}
                >
                  {item.author}
                </Text>

                <Text
                  style={[
                    styles.time,
                    { color: colors.muted }
                  ]}
                >
                  {item.viewed ? "Viewed" : "New"}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.storyText,
                { color: colors.ink }
              ]}
            >
              {item.text}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function Feed({
  colors,
  identity
}: {
  colors: typeof LIGHT;
  identity: Identity;
}) {
  const {
    feed,
    addFeedPost,
    toggleLike
  } = useNexChatStore();

  const [text, setText] = useState("");

  return (
    <View style={styles.flex}>
      <Header
        title="Feed"
        subtitle="Public posts · separate from private chats"
        colors={colors}
      />

      <View style={styles.form}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What's happening?"
          placeholderTextColor={colors.muted}
          multiline
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.line,
              color: colors.ink
            }
          ]}
        />

        <TouchableOpacity
          style={[
            styles.primary,
            { backgroundColor: colors.brand }
          ]}
          onPress={async () => {
            if (!text.trim()) return;

            await addFeedPost(identity.id, text.trim());
            setText("");
          }}
        >
          <Text style={styles.primaryText}>
            Publish
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={feed}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.post,
              {
                backgroundColor: colors.card,
                borderColor: colors.line
              }
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink }
              ]}
            >
              {item.author}
            </Text>

            <Text
              style={[
                styles.cardBody,
                { color: colors.ink }
              ]}
            >
              {item.text}
            </Text>

            <TouchableOpacity
              style={styles.like}
              onPress={() => toggleLike(item.id)}
            >
              <Text
                style={[
                  styles.likeText,
                  {
                    color: item.liked
                      ? colors.brand
                      : colors.muted
                  }
                ]}
              >
                {item.liked ? "♥" : "♡"} {item.likes}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

function Calls({
  colors
}: {
  colors: typeof LIGHT;
}) {
  return (
    <View style={styles.flex}>
      <Header
        title="Calls"
        subtitle="Voice and video transport"
        colors={colors}
      />

      <Empty
        title="Calls transport ready"
        body="Local, nearby and relay transports can share this call interface."
        colors={colors}
      />
    </View>
  );
}

function Vault({
  colors
}: {
  colors: typeof LIGHT;
}) {
  const { vaultBytes } = useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="Vault"
        subtitle="Private device storage"
        colors={colors}
      />

      <View style={styles.form}>
        <View
          style={[
            styles.stat,
            {
              backgroundColor: colors.card,
              borderColor: colors.line
            }
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: colors.ink }
            ]}
          >
            Encrypted local payload
          </Text>

          <Text
            style={[
              styles.statValue,
              { color: colors.brand }
            ]}
          >
            {vaultBytes} bytes
          </Text>
        </View>

        <View
          style={[
            styles.stat,
            {
              backgroundColor: colors.card,
              borderColor: colors.line
            }
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: colors.ink }
            ]}
          >
            Privacy boundary
          </Text>

          <Text
            style={[
              styles.cardBody,
              { color: colors.muted }
            ]}
          >
            Private messages remain separate from public Feed and Stories data.
          </Text>
        </View>
      </View>
    </View>
  );
}

function Settings({
  identity,
  colors,
  dark,
  setDark,
  onReset
}: {
  identity: Identity;
  colors: typeof LIGHT;
  dark: boolean;
  setDark: (value: boolean) => void;
  onReset: () => void;
}) {
  const [bio, setBio] = useState(false);

  return (
    <View style={styles.flex}>
      <Header
        title="Settings"
        subtitle="Identity, security and appearance"
        colors={colors}
      />

      <FlatList
        contentContainerStyle={styles.list}
        data={[
          {
            title: "Your NexChat ID",
            body: identity.id
          },
          {
            title: "Recovery Kit",
            body: "Generate and export a recovery package before trusting additional devices."
          },
          {
            title: "Trusted devices",
            body: "Review and revoke devices that can access your identity."
          },
          {
            title: "Remote lock",
            body: "Lock the account from a trusted device if your phone is stolen."
          }
        ]}
        renderItem={({ item }) => (
          <View
            style={[
              styles.setting,
              {
                backgroundColor: colors.card,
                borderColor: colors.line
              }
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink }
              ]}
            >
              {item.title}
            </Text>

            <Text
              style={[
                styles.cardBody,
                { color: colors.muted }
              ]}
            >
              {item.body}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.settingsFooter}>
            <View
              style={[
                styles.row,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line
                }
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.ink }
                ]}
              >
                Dark theme
              </Text>

              <Switch
                value={dark}
                onValueChange={setDark}
              />
            </View>

            <View
              style={[
                styles.row,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line
                }
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.ink }
                ]}
              >
                Biometric unlock
              </Text>

              <Switch
                value={bio}
                onValueChange={async value => {
                  if (value) {
                    const available =
                      await LocalAuthentication.hasHardwareAsync();

                    if (!available) {
                      Alert.alert(
                        "Unavailable",
                        "This device does not expose biometric hardware."
                      );
                      return;
                    }
                  }

                  setBio(value);
                }}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.danger,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.danger
                }
              ]}
              onPress={onReset}
            >
              <Text
                style={[
                  styles.dangerText,
                  { color: colors.danger }
                ]}
              >
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
  const [newMsg, setNewMsg] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dark, setDark] = useState(false);

  const { hydrate, reset } = useNexChatStore();

  const colors = dark ? DARK : LIGHT;

  useEffect(() => {
    (async () => {
      await initVault();
      await initIdentity();

      const id = await getIdentity();

      setIdentity(id);

      await hydrate();
    })();
  }, []);

  const screen = useMemo(() => {
    if (!identity) {
      return (
        <Empty
          title="Preparing NexChat Core"
          body="Initializing local identity and secure storage…"
          colors={colors}
        />
      );
    }

    if (newMsg) {
      return (
        <NewMessage
          colors={colors}
          onDone={() => setNewMsg(false)}
        />
      );
    }

    if (tab === "Chats") {
      return (
        <Chats
          colors={colors}
          onNew={() => setNewMsg(true)}
        />
      );
    }

    if (tab === "Stories") {
      return (
        <Stories
          colors={colors}
          identity={identity}
        />
      );
    }

    if (tab === "Feed") {
      return (
        <Feed
          colors={colors}
          identity={identity}
        />
      );
    }

    if (tab === "Calls") {
      return <Calls colors={colors} />;
    }

    if (tab === "Vault") {
      return <Vault colors={colors} />;
    }

    return (
      <Settings
        identity={identity}
        colors={colors}
        dark={dark}
        setDark={setDark}
        onReset={async () => {
          await reset();

          Alert.alert(
            "Reset",
            "Local demo data cleared."
          );
        }}
      />
    );
  }, [
    tab,
    newMsg,
    identity,
    dark,
    colors,
    reset
  ]);

  const tabs: Tab[] = [
    "Chats",
    "Stories",
    "Feed",
    "Calls",
    "Vault",
    "Settings"
  ];

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: colors.bg }
      ]}
    >
      <StatusBar
        barStyle={dark ? "light-content" : "dark-content"}
      />

      {screen}

      {!newMsg && (
        <View
          style={[
            styles.tabs,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.line
            }
          ]}
        >
          {tabs.map(item => (
            <TouchableOpacity
              key={item}
              style={styles.tab}
              onPress={() => setTab(item)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      tab === item
                        ? colors.brand
                        : colors.muted,
                    fontWeight:
                      tab === item
                        ? "800"
                        : "500"
                  }
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
    flex: 1
  },

  flex: {
    flex: 1
  },

  header: {
    padding: 16,
    paddingTop: 10,
    borderBottomWidth: 1
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },

  title: {
    fontSize: 22,
    fontWeight: "800"
  },

  subtitle: {
    fontSize: 12,
    marginTop: 2
  },

  logo: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1
  },

  logoN: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -5
  },

  lock: {
    position: "absolute",
    top: 18,
    right: 17,
    width: 22,
    height: 22,
    borderWidth: 3,
    borderRadius: 6,
    alignItems: "center"
  },

  lockBody: {
    position: "absolute",
    top: 8,
    width: 17,
    height: 12,
    borderRadius: 3
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30
  },

  emptyTitle: {
    fontSize: 23,
    fontWeight: "800",
    marginTop: 18,
    textAlign: "center"
  },

  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 320
  },

  primary: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 12
  },

  primaryText: {
    color: "#fff",
    fontWeight: "800"
  },

  form: {
    padding: 16,
    gap: 12
  },

  label: {
    fontSize: 13,
    fontWeight: "800"
  },

  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16
  },

  messageInput: {
    height: 120,
    textAlignVertical: "top"
  },

  list: {
    padding: 16,
    gap: 12
  },

  chatCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },

  avatarText: {
    fontWeight: "900",
    fontSize: 18
  },

  cardTitle: {
    fontWeight: "800",
    fontSize: 15
  },

  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },

  time: {
    fontSize: 10
  },

  post: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1
  },

  storyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  storyText: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: 14
  },

  like: {
    marginTop: 14
  },

  likeText: {
    fontWeight: "800",
    fontSize: 14
  },

  stat: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1
  },

  statValue: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 6
  },

  setting: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1
  },

  settingsFooter: {
    gap: 10,
    marginTop: 2
  },

  row: {
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1
  },

  danger: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center"
  },

  dangerText: {
    fontWeight: "800"
  },

  tabs: {
    minHeight: 64,
    borderTopWidth: 1,
    flexDirection: "row"
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2
  },

  tabText: {
    fontSize: 10
  },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5
  },

  fabText: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 30
  }
});
