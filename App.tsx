import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import { CameraView, useCameraPermissions } from "expo-camera";

import {
  initIdentity,
  getIdentity,
  Identity,
} from "./src/core/identity";
import { initVault } from "./src/core/vault";
import {
  useNexChatStore,
  Attachment,
  NexContact,
} from "./src/core/store";
import {
  authenticateBiometric,
  getRecoveryCode,
  hasPasscode,
  isBiometricEnabled,
  resetPasscodeWithRecovery,
  setBiometricEnabled,
  setPasscode,
  verifyPasscode,
} from "./src/core/appSecurity";
import { MediaPicker } from "./src/components/MediaPicker";
import { MediaPreview } from "./src/components/MediaPreview";

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
  line: "#D9E2EC",
  danger: "#B42318",
};

const DARK = {
  bg: "#08111A",
  card: "#101C27",
  ink: "#F2F7FA",
  muted: "#9BAEBD",
  brand: "#42A5E5",
  line: "#263847",
  danger: "#FF8A80",
};

function Header({
  title,
  subtitle,
  colors,
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
          borderBottomColor: colors.line,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.ink }]}>
        {title}
      </Text>

      {subtitle && (
        <Text
          style={[
            styles.subtitle,
            { color: colors.muted },
          ]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function Composer({
  colors,
  placeholder,
  multiple,
  onSubmit,
}: {
  colors: typeof LIGHT;
  placeholder: string;
  multiple: boolean;
  onSubmit: (
    text: string,
    media: Attachment[]
  ) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Attachment[]>([]);

  return (
    <View style={styles.form}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.line,
            color: colors.ink,
          },
        ]}
      />

      <MediaPicker
        multiple={multiple}
        onSelected={(items) =>
          setMedia(
            multiple
              ? [...media, ...items].slice(0, 10)
              : items.slice(0, 1)
          )
        }
      />

      {!!media.length && (
        <FlatList
          horizontal
          data={media}
          keyExtractor={(item, index) =>
            `${item.uri}-${index}`
          }
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item, index }) => (
            <MediaPreview
              media={item}
              onRemove={() =>
                setMedia(
                  media.filter((_, mediaIndex) =>
                    mediaIndex === index ? false : true
                  )
                )
              }
            />
          )}
        />
      )}

      <TouchableOpacity
        style={[
          styles.primary,
          { backgroundColor: colors.brand },
        ]}
        onPress={async () => {
          if (!text.trim() && !media.length) {
            Alert.alert(
              "Nothing to post",
              "Add text, a photo or a video."
            );
            return;
          }

          await onSubmit(text.trim(), media);
          setText("");
          setMedia([]);
        }}
      >
        <Text style={styles.primaryText}>Publish</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chats({
  colors,
  onNew,
}: {
  colors: typeof LIGHT;
  onNew: () => void;
}) {
  const { messages } = useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="Chats"
        subtitle="Private local-first messaging"
        colors={colors}
      />

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text
            style={[
              styles.emptyText,
              { color: colors.muted },
            ]}
          >
            No conversations yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink },
              ]}
            >
              {item.peer}
            </Text>

            {!!item.text && (
              <Text
                style={[
                  styles.cardBody,
                  { color: colors.muted },
                ]}
              >
                {item.text}
              </Text>
            )}

            {item.attachment && (
              <View style={{ marginTop: 10 }}>
                <MediaPreview media={item.attachment} />
              </View>
            )}

            <Text
              style={[
                styles.time,
                { color: colors.muted },
              ]}
            >
              {item.status}
            </Text>
          </View>
        )}
      />

      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: colors.brand },
        ]}
        onPress={onNew}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

function NewMessage({
  colors,
  onDone,
}: {
  colors: typeof LIGHT;
  onDone: () => void;
}) {
  const { contacts, addMessage } = useNexChatStore();
  const [peer, setPeer] = useState("");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Attachment[]>([]);

  return (
    <View style={styles.flex}>
      <Header
        title="New message"
        subtitle="Text, photos and videos"
        colors={colors}
      />

      <View style={styles.form}>
        <Text
          style={[
            styles.label,
            { color: colors.ink },
          ]}
        >
          NexChat contact
        </Text>

        <FlatList
          horizontal
          data={contacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.contactChip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line,
                },
              ]}
              onPress={() => setPeer(item.id)}
            >
              <Text
                style={[
                  styles.contactName,
                  { color: colors.ink },
                ]}
              >
                {item.displayName}
              </Text>
              <Text
                style={[
                  styles.time,
                  { color: colors.muted },
                ]}
              >
                {item.id}
              </Text>
            </TouchableOpacity>
          )}
        />

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
              color: colors.ink,
            },
          ]}
        />

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
              color: colors.ink,
            },
          ]}
        />

        <MediaPicker
          onSelected={(items) =>
            setMedia(items.slice(0, 1))
          }
        />

        {!!media[0] && (
          <MediaPreview
            media={media[0]}
            onRemove={() => setMedia([])}
          />
        )}

        <TouchableOpacity
          style={[
            styles.primary,
            { backgroundColor: colors.brand },
          ]}
          onPress={async () => {
            if (!peer.trim()) {
              Alert.alert(
                "Choose a contact",
                "Select or enter a NexChat ID."
              );
              return;
            }

            if (!text.trim() && !media[0]) {
              Alert.alert(
                "Empty message",
                "Add text or media."
              );
              return;
            }

            await addMessage({
              peer: peer.trim(),
              text: text.trim(),
              status: "Queued locally",
              attachment: media[0],
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
  identity,
}: {
  colors: typeof LIGHT;
  identity: Identity;
}) {
  const { stories, addStory, viewStory } =
    useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="Stories"
        subtitle="Photos and videos · 24-hour expiry"
        colors={colors}
      />

      <Composer
        colors={colors}
        placeholder="Share a moment…"
        multiple={false}
        onSubmit={async (caption, media) => {
          await addStory({
            authorId: identity.id,
            caption,
            media: media[0],
          });
        }}
      />

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text
            style={[
              styles.emptyText,
              { color: colors.muted },
            ]}
          >
            No active stories.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: item.viewed
                  ? colors.line
                  : colors.brand,
              },
            ]}
            onPress={() => viewStory(item.id)}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink },
              ]}
            >
              {item.authorId}
            </Text>

            {!!item.caption && (
              <Text
                style={[
                  styles.cardBody,
                  { color: colors.ink },
                ]}
              >
                {item.caption}
              </Text>
            )}

            {item.media && (
              <View style={{ marginTop: 10 }}>
                <MediaPreview media={item.media} />
              </View>
            )}

            <Text
              style={[
                styles.time,
                { color: colors.muted },
              ]}
            >
              {item.viewed ? "Viewed" : "New"} · expires in 24h
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function Feed({
  colors,
  identity,
}: {
  colors: typeof LIGHT;
  identity: Identity;
}) {
  const { feed, addFeedPost, toggleLike } =
    useNexChatStore();

  return (
    <View style={styles.flex}>
      <Header
        title="Feed"
        subtitle="Public posts · text, photos and videos"
        colors={colors}
      />

      <Composer
        colors={colors}
        placeholder="What's happening?"
        multiple
        onSubmit={async (caption, media) => {
          await addFeedPost({
            authorId: identity.id,
            caption,
            media,
          });
        }}
      />

      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink },
              ]}
            >
              {item.authorId}
            </Text>

            {!!item.caption && (
              <Text
                style={[
                  styles.cardBody,
                  { color: colors.ink },
                ]}
              >
                {item.caption}
              </Text>
            )}

            {!!item.media?.length && (
              <FlatList
                horizontal
                data={item.media}
                keyExtractor={(media, index) =>
                  `${media.uri}-${index}`
                }
                contentContainerStyle={{
                  gap: 8,
                  marginTop: 10,
                }}
                renderItem={({ item: media }) => (
                  <MediaPreview media={media} />
                )}
              />
            )}

            <TouchableOpacity
              style={styles.likeButton}
              onPress={() => toggleLike(item.id)}
            >
              <Text
                style={[
                  styles.likeText,
                  {
                    color: item.liked
                      ? colors.brand
                      : colors.muted,
                  },
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

function IDModal({
  identity,
  colors,
  visible,
  onClose,
}: {
  identity: Identity;
  colors: typeof LIGHT;
  visible: boolean;
  onClose: () => void;
}) {
  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();
  const [scanner, setScanner] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modal,
            { backgroundColor: colors.card },
          ]}
        >
          <Text
            style={[
              styles.modalTitle,
              { color: colors.ink },
            ]}
          >
            Your NexChat ID
          </Text>

          <View
            style={[
              styles.qrBox,
              { borderColor: colors.line },
            ]}
          >
            <Text
              style={[
                styles.qrFake,
                { color: colors.ink },
              ]}
            >
              ▦
            </Text>
            <Text
              style={[
                styles.qrId,
                { color: colors.ink },
              ]}
            >
              {identity.id}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.secondary}
            onPress={async () => {
              await Clipboard.setStringAsync(identity.id);
              Alert.alert(
                "Copied",
                "Your NexChat ID is on the clipboard."
              );
            }}
          >
            <Text style={styles.secondaryText}>
              Copy ID
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondary}
            onPress={() =>
              Share.share({
                message: `Connect with me on NexChat: ${identity.id}`,
              })
            }
          >
            <Text style={styles.secondaryText}>
              Share ID / Link
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondary}
            onPress={async () => {
              if (!cameraPermission?.granted) {
                const result =
                  await requestCameraPermission();

                if (!result.granted) {
                  Alert.alert(
                    "Camera permission",
                    "Camera access is required to scan a NexChat QR code."
                  );
                  return;
                }
              }

              setScanner(true);
            }}
          >
            <Text style={styles.secondaryText}>
              Scan QR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text
              style={[
                styles.close,
                { color: colors.muted },
              ]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={scanner} animationType="slide">
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={(result) => {
            setScanner(false);
            Alert.alert(
              "NexChat QR detected",
              result.data
            );
          }}
        >
          <View style={styles.scannerOverlay}>
            <TouchableOpacity
              style={styles.scannerClose}
              onPress={() => setScanner(false)}
            >
              <Text style={styles.primaryText}>
                Close scanner
              </Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </Modal>
    </Modal>
  );
}

function SecurityGate({
  onUnlocked,
}: {
  onUnlocked: () => void;
}) {
  const [passcode, setPasscodeInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (await isBiometricEnabled()) {
        const success = await authenticateBiometric();

        if (success) onUnlocked();
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.gate}>
      <Text style={styles.gateTitle}>
        NexChat Locked
      </Text>

      <Text style={styles.gateBody}>
        Unlock with your device biometric or NexChat passcode.
      </Text>

      <TextInput
        value={passcode}
        onChangeText={setPasscodeInput}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="6-digit passcode"
        style={styles.gateInput}
      />

      <TouchableOpacity
        style={styles.gateButton}
        disabled={busy}
        onPress={async () => {
          setBusy(true);

          try {
            const valid = await verifyPasscode(
              passcode
            );

            if (!valid) {
              Alert.alert(
                "Incorrect passcode",
                "Try again or use Forgot passcode."
              );
              return;
            }

            onUnlocked();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={styles.primaryText}>
          Unlock
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={async () => {
          const code = await getRecoveryCode();

          if (!code) {
            Alert.alert(
              "No recovery code",
              "No recovery credential is configured on this device."
            );
            return;
          }

          Alert.prompt(
            "Forgot passcode",
            "Enter your NexChat recovery code.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Continue",
                onPress: async (recovery?: string) => {
                  Alert.prompt(
                    "New passcode",
                    "Enter a new 6-digit passcode.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Reset",
                        onPress: async (newPasscode?: string) => {
                          try {
                            await resetPasscodeWithRecovery(
                              recovery || "",
                              newPasscode || ""
                            );
                            Alert.alert(
                              "Passcode reset",
                              "Your new passcode is ready."
                            );
                          } catch (error) {
                            Alert.alert(
                              "Reset failed",
                              error instanceof Error
                                ? error.message
                                : "Invalid recovery code."
                            );
                          }
                        },
                      },
                    ]
                  );
                },
              },
            ]
          );
        }}
      >
        <Text style={styles.forgot}>
          Forgot passcode?
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Settings({
  identity,
  colors,
  dark,
  setDark,
  onReset,
}: {
  identity: Identity;
  colors: typeof LIGHT;
  dark: boolean;
  setDark: (value: boolean) => void;
  onReset: () => void;
}) {
  const [biometric, setBiometric] = useState(false);
  const [passwordExists, setPasswordExists] =
    useState(false);

  useEffect(() => {
    (async () => {
      setBiometric(await isBiometricEnabled());
      setPasswordExists(await hasPasscode());
    })();
  }, []);

  const configurePasscode = () => {
    Alert.prompt(
      passwordExists
        ? "Change passcode"
        : "Create passcode",
      "Enter a new 6-digit NexChat passcode.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: (value?: string) => {
            Alert.prompt(
              "Confirm passcode",
              "Enter the same passcode again.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Save",
                  onPress: async (confirm?: string) => {
                    if (!value || value !== confirm) {
                      Alert.alert(
                        "Mismatch",
                        "The passcodes do not match."
                      );
                      return;
                    }

                    try {
                      await setPasscode(value);
                      setPasswordExists(true);
                      Alert.alert(
                        "Saved",
                        "Your NexChat passcode is configured."
                      );
                    } catch (error) {
                      Alert.alert(
                        "Invalid passcode",
                        error instanceof Error
                          ? error.message
                          : "Use exactly 6 digits."
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.flex}>
      <Header
        title="Settings"
        subtitle="Identity, privacy and device protection"
        colors={colors}
      />

      <FlatList
        contentContainerStyle={styles.list}
        data={[
          {
            title: "Your NexChat ID",
            body: identity.id,
          },
          {
            title: "Recovery",
            body:
              "Keep your recovery code somewhere safe. It is required if you forget your local passcode.",
          },
        ]}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.ink },
              ]}
            >
              {item.title}
            </Text>

            <Text
              style={[
                styles.cardBody,
                { color: colors.muted },
              ]}
            >
              {item.body}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={{ gap: 10 }}>
            <View
              style={[
                styles.settingRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.ink },
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
                styles.settingRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink },
                  ]}
                >
                  Biometric app lock
                </Text>

                <Text
                  style={[
                    styles.cardBody,
                    { color: colors.muted },
                  ]}
                >
                  Requires Face ID, fingerprint or the
                  device security fallback when NexChat
                  is locked.
                </Text>
              </View>

              <Switch
                value={biometric}
                onValueChange={async (value) => {
                  try {
                    if (value && !passwordExists) {
                      Alert.alert(
                        "Create a passcode first",
                        "Biometric lock requires a NexChat passcode as the secure fallback."
                      );
                      return;
                    }

                    await setBiometricEnabled(value);
                    setBiometric(value);
                  } catch (error) {
                    Alert.alert(
                      "Biometric unavailable",
                      error instanceof Error
                        ? error.message
                        : "Unable to configure biometrics."
                    );
                  }
                }}
              />
            </View>

            <TouchableOpacity
              style={styles.secondary}
              onPress={configurePasscode}
            >
              <Text style={styles.secondaryText}>
                {passwordExists
                  ? "Change passcode"
                  : "Create passcode"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondary}
              onPress={async () => {
                const code = await getRecoveryCode();

                if (!code) {
                  Alert.alert(
                    "Recovery unavailable",
                    "Create a passcode first."
                  );
                  return;
                }

                await Share.share({
                  message:
                    `NexChat recovery code: ${code}\n\n` +
                    "Store this somewhere private. Anyone with this code can reset the local NexChat passcode.",
                });
              }}
            >
              <Text style={styles.secondaryText}>
                View / share recovery code
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.danger}
              onPress={onReset}
            >
              <Text style={styles.dangerText}>
                Reset local data
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
  const [newMessage, setNewMessage] =
    useState(false);
  const [identity, setIdentity] =
    useState<Identity | null>(null);
  const [dark, setDark] = useState(false);
  const [locked, setLocked] = useState(false);
  const [idModal, setIdModal] = useState(false);

  const { hydrate, reset } = useNexChatStore();

  const colors = dark ? DARK : LIGHT;

  useEffect(() => {
    (async () => {
      await initVault();
      await initIdentity();

      const id = await getIdentity();
      setIdentity(id);

      await hydrate();

      if (await hasPasscode()) {
        if (await isBiometricEnabled()) {
          const success =
            await authenticateBiometric();

          setLocked(!success);
        } else {
          setLocked(true);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!locked) return;

    const interval = setInterval(async () => {
      if (await isBiometricEnabled()) {
        const success =
          await authenticateBiometric();

        if (success) setLocked(false);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [locked]);

  if (!identity) {
    return (
      <SafeAreaView style={styles.gate}>
        <Text style={styles.gateTitle}>
          Preparing NexChat
        </Text>
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SecurityGate
        onUnlocked={() => setLocked(false)}
      />
    );
  }

  const screen = (() => {
    if (newMessage) {
      return (
        <NewMessage
          colors={colors}
          onDone={() => setNewMessage(false)}
        />
      );
    }

    if (tab === "Chats") {
      return (
        <Chats
          colors={colors}
          onNew={() => setNewMessage(true)}
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
      return (
        <View style={styles.flex}>
          <Header
            title="Calls"
            subtitle="Voice and video"
            colors={colors}
          />

          <View style={styles.form}>
            <Text
              style={[
                styles.cardBody,
                { color: colors.muted },
              ]}
            >
              Calls use the same NexChat contact directory.
              Select a contact before connecting a future
              voice/video transport.
            </Text>

            <TouchableOpacity
              style={[
                styles.primary,
                { backgroundColor: colors.brand },
              ]}
              onPress={() =>
                Alert.alert(
                  "Contact picker",
                  "Use your NexChat contacts when the call transport is connected."
                )
              }
            >
              <Text style={styles.primaryText}>
                ＋ Select contact
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (tab === "Vault") {
      const { vaultBytes } = useNexChatStore();

      return (
        <View style={styles.flex}>
          <Header
            title="Vault"
            subtitle="Encrypted private device storage"
            colors={colors}
          />

          <View style={styles.form}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.ink },
                ]}
              >
                Encrypted payload
              </Text>

              <Text
                style={[
                  styles.statValue,
                  { color: colors.brand },
                ]}
              >
                {vaultBytes} bytes
              </Text>
            </View>
          </View>
        </View>
      );
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
            "Reset complete",
            "Local NexChat content has been cleared."
          );
        }}
      />
    );
  })();

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: colors.bg },
      ]}
    >
      <StatusBar
        barStyle={
          dark ? "light-content" : "dark-content"
        }
      />

      <TouchableOpacity
        style={[
          styles.identityButton,
          {
            backgroundColor: colors.card,
            borderColor: colors.line,
          },
        ]}
        onPress={() => setIdModal(true)}
      >
        <Text
          style={[
            styles.identityText,
            { color: colors.brand },
          ]}
        >
          {identity.id} · QR / Share
        </Text>
      </TouchableOpacity>

      {screen}

      <View
        style={[
          styles.tabs,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.line,
          },
        ]}
      >
        {(
          [
            "Chats",
            "Stories",
            "Feed",
            "Calls",
            "Vault",
            "Settings",
          ] as Tab[]
        ).map((item) => (
          <TouchableOpacity
            key={item}
            style={styles.tab}
            onPress={() => {
              setNewMessage(false);
              setTab(item);
            }}
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
                    tab === item ? "900" : "500",
                },
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <IDModal
        identity={identity}
        colors={colors}
        visible={idModal}
        onClose={() => setIdModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 23,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  identityButton: {
    minHeight: 38,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: {
    fontSize: 12,
    fontWeight: "900",
  },
  form: {
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
  },
  messageInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  label: {
    fontSize: 13,
    fontWeight: "900",
  },
  primary: {
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
  secondary: {
    borderWidth: 1,
    borderColor: "#78909C",
    borderRadius: 14,
    padding: 13,
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "900",
    color: "#42A5E5",
  },
  danger: {
    borderWidth: 1,
    borderColor: "#B42318",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  dangerText: {
    color: "#B42318",
    fontWeight: "900",
  },
  list: {
    padding: 16,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  time: {
    fontSize: 10,
    marginTop: 8,
  },
  emptyText: {
    textAlign: "center",
    padding: 40,
    fontSize: 14,
  },
  tabs: {
    height: 68,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: "#D9E2EC",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 68,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "700",
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
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 30,
  },
  contactChip: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  contactName: {
    fontWeight: "900",
  },
  likeButton: {
    paddingTop: 12,
  },
  likeText: {
    fontWeight: "900",
  },
  settingRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.6)",
    justifyContent: "flex-end",
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  qrBox: {
    height: 220,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFake: {
    fontSize: 100,
  },
  qrId: {
    fontWeight: "900",
  },
  close: {
    textAlign: "center",
    padding: 10,
    fontWeight: "800",
  },
  scannerOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 30,
  },
  scannerClose: {
    backgroundColor: "rgba(0,0,0,.7)",
    padding: 14,
    borderRadius: 14,
  },
  gate: {
    flex: 1,
    backgroundColor: "#08111A",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 15,
  },
  gateTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  gateBody: {
    color: "#9BAEBD",
    textAlign: "center",
    lineHeight: 21,
  },
  gateInput: {
    width: "100%",
    backgroundColor: "#101C27",
    borderColor: "#263847",
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    color: "#fff",
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 5,
  },
  gateButton: {
    width: "100%",
    backgroundColor: "#0C5A8D",
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  forgot: {
    color: "#6CC4F5",
    fontWeight: "900",
    padding: 10,
  },
  statValue: {
    fontSize: 25,
    fontWeight: "900",
    marginTop: 7,
  },
});
