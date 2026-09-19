import React,{useEffect,useMemo,useRef,useState} from "react";
import {SafeAreaProvider,useSafeAreaInsets} from "react-native-safe-area-context";
import {Alert,AppState,FlatList,Image,ImageBackground,KeyboardAvoidingView,Modal,Platform,ScrollView,Share,StatusBar,StyleSheet,Switch,Text,TextInput,TouchableOpacity,View} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  authenticateBiometric,
  isBiometricEnabled,
  setBiometricEnabled,
} from "./src/core/appSecurity";
import * as LocalAuthentication from "expo-local-authentication";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {initIdentity,getIdentity,Identity,updateIdentity} from "./src/core/identity";
import {initVault,verifyVault,getVaultSize,clearVault} from "./src/core/vault";
import {createBackupSnapshot,restoreFromBackup} from "./src/core/backup";
import {useNexChatStore,Attachment,Conversation,NexContact,Message,MessageStatus,CallHistoryEntry,getPersistedSettingsSnapshot} from "./src/core/store";
import {shouldRunBackup,runBackup} from "./src/core/backupScheduler";
import {MediaPicker} from "./src/components/MediaPicker";
import {QRScanner} from "./src/components/QRScanner";
import {pickProfilePhoto,pickMedia,capturePhoto} from "./src/core/media";
import VoiceRecorder from "./src/components/audio/VoiceRecorder";
import {createContactQR} from "./src/core/qr";
import QRCode from "react-native-qrcode-svg";
import {MediaPreview} from "./src/components/MediaPreview";
import {themes} from "./src/theme/theme";
import {StoriesScreen} from "./src/components/StoriesScreen";
import {BootSplash} from "./src/components/BootSplash";
import {ActionSheet, ActionSheetOption} from "./src/components/ActionSheet";
import {ChatListScreen} from "./src/components/ChatListScreen";
import {TypingDots} from "./src/components/TypingDots";
import {FeedScreen} from "./src/components/FeedScreen";
import {getFeedFollowCounts} from "./src/core/feed";
import {PasscodeManager} from "./src/components/PasscodeManager";

type Tab="Chats"|"Stories"|"Feed"|"Calls"|"Settings";
type Screen={name:"home"}|{name:"chat";peerId:string}|{name:"new"}|{name:"contact";peerId:string}|{name:"settings"}|{name:"settingsSection";section:string};
const icon=(x:string)=><Text style={{fontSize:19}}>{x}</Text>;

function Button({label,onPress,secondary=false,danger=false,theme}:{label:string;onPress:()=>void;secondary?:boolean;danger?:boolean;theme?:any}){
  const buttonTheme = theme || themes.light;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.button,
        secondary && [
          s.secondary,
          {
            backgroundColor: buttonTheme.surface,
            borderColor: buttonTheme.line,
            borderWidth: 1,
          },
        ],
        danger && s.danger,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && {color: buttonTheme.ink},
          danger && {color:"white"},
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Row({
  icon:ic,
  title,
  subtitle,
  onPress,
  right,
  theme,
}:{
  icon:string;
  title:string;
  subtitle?:string;
  onPress?:()=>void;
  right?:React.ReactNode;
  theme?:any;
}){
  const rowTheme = theme || themes.light;

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      style={s.row}
    >
      <Text style={[s.rowIcon, {color: rowTheme.ink}]}>{ic}</Text>

      <View style={{flex:1}}>
        <Text style={[s.rowTitle,{color:rowTheme.ink}]}>
          {title}
        </Text>

        {subtitle && (
          <Text style={[s.rowSub,{color:rowTheme.muted}]}>
            {subtitle}
          </Text>
        )}
      </View>

      {right || (
        <Text style={[s.chevron,{color:rowTheme.muted}]}>
          ›
        </Text>
      )}
    </TouchableOpacity>
  );
}
function Header({title,subtitle,onBack,onInfo,onCall,onVideo,theme}:{title:string;subtitle?:string;onBack?:()=>void;onInfo?:()=>void;onCall?:()=>void;onVideo?:()=>void;theme:any}){return <View style={[s.header,{backgroundColor:theme.card,borderBottomColor:theme.line}]}><TouchableOpacity onPress={onBack} disabled={!onBack} style={s.headBack}><Text style={{color:theme.ink,fontSize:28}}>{onBack?"‹":""}</Text></TouchableOpacity><View style={{flex:1}}><Text style={[s.headTitle,{color:theme.ink}]}>{title}</Text>{subtitle&&<Text style={[s.headSub,{color:theme.muted}]}>{subtitle}</Text>}</View>{onCall&&<TouchableOpacity onPress={onCall} style={s.headAction}>{icon("📞")}</TouchableOpacity>}{onVideo&&<TouchableOpacity onPress={onVideo} style={s.headAction}>{icon("🎥")}</TouchableOpacity>}{onInfo&&<TouchableOpacity onPress={onInfo} style={s.headAction}>{icon("ⓘ")}</TouchableOpacity>}</View>}

function NewMessage({
  theme,
  onBack,
  onOpen,
}: {
  theme: any;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const st = useNexChatStore();

  const [id, setId] = useState("");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<"normal" | "viewOnce">("normal");
  const [scannerVisible, setScannerVisible] = useState(false);

  const addScannedContact = async (contact: {
    id: string;
    displayName: string;
    username?: string;
    avatarUri?: string;
  }) => {
    if (contact.id === (await getIdentity()).id) {
      Alert.alert(
        "That's your own QR code",
        "You cannot start a conversation with yourself."
      );
      return;
    }

    const existing = st.contacts.find(
      (c) => c.id.toLowerCase() === contact.id.toLowerCase()
    );

    if (!existing) {
      await st.addContact({
        id: contact.id,
        displayName: contact.displayName,
        username: contact.username,
        avatarUri: contact.avatarUri,
        online: false,
      });
    }

    setId(contact.id);

    Alert.alert(
      "Contact added",
      `${contact.displayName} has been added to your NexChat contacts.`,
      [
        {
          text: "Open chat",
          onPress: () => onOpen(contact.id),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  const send = async () => {
    const peer = id.trim();

    if (!peer) {
      Alert.alert(
        "Recipient required",
        "Enter a NexChat ID or scan a contact QR code."
      );
      return;
    }

    const existing = st.contacts.find(
      (c) => c.id.toLowerCase() === peer.toLowerCase()
    );

    const realId = existing?.id || peer;

    if (media.length === 0) {
      await st.sendMessage(
        realId,
        text.trim(),
        undefined,
        {
          viewOnce: mode === "viewOnce",
        }
      );
    } else {
      for (const item of media) {
        await st.sendMessage(
          realId,
          text.trim(),
          item,
          {
            viewOnce: mode === "viewOnce",
          }
        );
      }
    }

    setText("");
    setMedia([]);

    onOpen(realId);
  };

  return (
    <View style={s.flex}>
      <Header
        title="New message"
        subtitle="One contact = one conversation"
        onBack={onBack}
        theme={theme}
      />

      <ScrollView contentContainerStyle={s.form}>
        <Button
          label="▣  Scan NexChat QR"
          onPress={() => setScannerVisible(true)}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Contacts
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {st.contacts.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setId(c.id)}
              style={[
                s.chip,
                {
                  borderColor: theme.line,
                  backgroundColor: theme.card,
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "800",
                  color: theme.ink,
                }}
              >
                {c.displayName}
              </Text>

              <Text
                style={{
                  fontSize: 10,
                  color: theme.muted,
                }}
              >
                {c.id}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          NexChat ID
        </Text>

        <TextInput
          value={id}
          onChangeText={setId}
          autoCapitalize="characters"
          placeholder="N-1234-5678-90"
          placeholderTextColor={theme.muted}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
              backgroundColor: theme.card,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Message
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Write a message"
          placeholderTextColor={theme.muted}
          style={[
            s.input,
            {
              minHeight: 120,
              color: theme.ink,
              borderColor: theme.line,
              backgroundColor: theme.card,
              textAlignVertical: "top",
            },
          ]}
        />

        <MediaPicker theme={theme} onSelected={setMedia} />

        {media.length > 0 && (
          <ScrollView horizontal>
            {media.map((m, i) => (
              <MediaPreview
                key={m.id}
                media={m}
                onRemove={() =>
                  setMedia(
                    media.filter((_, x) => x !== i)
                  )
                }
              />
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          onPress={() =>
            setMode(
              mode === "normal"
                ? "viewOnce"
                : "normal"
            )
          }
          style={s.toggleLine}
        >
          <Text
            style={{
              color: theme.ink,
              fontWeight: "800",
            }}
          >
            View once
          </Text>

          <Switch
            value={mode === "viewOnce"}
            onValueChange={(v) =>
              setMode(v ? "viewOnce" : "normal")
            }
          />
        </TouchableOpacity>

        <Button
          label="Send & open conversation"
          onPress={send}
        />
      </ScrollView>

      <QRScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onContact={addScannedContact}
      />
    </View>
  );
}

function StatusTicks({status,theme}:{status:MessageStatus;theme:any}){if(status==="failed")return <Text style={{fontSize:11,color:theme.danger}}>⚠</Text>;if(status==="sending")return <Text style={{fontSize:11,color:theme.muted}}>🕒</Text>;if(status==="sent")return <Text style={{fontSize:11,color:theme.muted}}>✓</Text>;if(status==="delivered")return <Text style={{fontSize:11,color:theme.muted}}>✓✓</Text>;return <Text style={{fontSize:11,color:theme.brand}}>✓✓</Text>;}
function bubbleTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#102A43";

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#102A43" : "#FFFFFF";
}

function MessageBubble({
  m,
  theme,
  onEdit,
  onDelete,
  onViewOnce,
  bubbleMeColor,
  bubbleThemColor,
}: {
  m: Message;
  theme: any;
  onEdit: () => void;
  onDelete: () => void;
  onViewOnce: () => void;
  bubbleMeColor?: string;
  bubbleThemColor?: string;
}) {
  const mine = m.sender === "me";
  const bubbleColor = mine
    ? (bubbleMeColor || theme.bubbleMe)
    : (bubbleThemColor || theme.bubbleThem);
  const bubbleInk = bubbleTextColor(bubbleColor);
  const bubbleMuted = bubbleTextColor(bubbleColor) === "#FFFFFF"
    ? "#D9E2EC"
    : "#66788A";
  const hidden = !!(m.viewOnce && m.viewedAt);
  const deleted = !!(m.deletedForEveryone || m.deletedForMe);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<ActionSheetOption[]>([]);

  const copyMessage = async () => {
    if (!m.text?.trim()) {
      Alert.alert(
        "Nothing to copy",
        "This message does not contain text."
      );
      return;
    }

    await Clipboard.setStringAsync(m.text);
    Alert.alert("Copied", "Message text copied to clipboard.");
  };

  const shareMessage = async () => {
    if (!m.text?.trim()) {
      Alert.alert(
        "Nothing to share",
        "This message does not contain text."
      );
      return;
    }

    try {
      await Share.share({
        message: m.text,
      });
    } catch (e) {
      Alert.alert(
        "Share unavailable",
        e instanceof Error
          ? e.message
          : "Unable to share this message."
      );
    }
  };

  const openActions = () => {
    if (deleted) {
      Alert.alert("Message", "This message has been deleted.");
      return;
    }

    const actions: {
      text: string;
      onPress?: () => void;
      style?: "cancel" | "destructive";
    }[] = [];

    if (m.text?.trim()) {
      actions.push({
        text: "Copy",
        onPress: copyMessage,
      });

      actions.push({
        text: "Share",
        onPress: shareMessage,
      });
    }

    if (mine && !m.viewOnce) {
      actions.push({
        text: "Edit",
        onPress: onEdit,
      });
    }

    actions.push({
      text: "Delete",
      onPress: onDelete,
      style: "destructive",
    });

    actions.push({
      text: "Cancel",
      style: "cancel",
    });

    setSheetOptions(actions);
    setActionsVisible(true);
  };

  return (
    <>
    <TouchableOpacity
      onLongPress={openActions}
      delayLongPress={350}
      activeOpacity={0.85}
      style={[
        s.bubble,
        {
          alignSelf: mine ? "flex-end" : "flex-start",
          backgroundColor: bubbleColor,
          borderColor: theme.line,
        },
      ]}
    >
      {deleted ? (
        <Text
          style={{
            fontStyle: "italic",
            color: theme.muted,
          }}
        >
          This message was deleted
        </Text>
      ) : hidden ? (
        <TouchableOpacity
          onPress={onViewOnce}
          activeOpacity={0.7}
        >
          <Text
            style={{
              fontWeight: "800",
              color: theme.ink,
            }}
          >
            👁 View once • tap to open
          </Text>
        </TouchableOpacity>
      ) : m.callInfo ? (
        <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
          <Text style={{fontSize:18}}>{m.callInfo.type==="video"?"🎥":"📞"}</Text>
          <View>
            <Text style={{color:theme.ink,fontWeight:"700"}}>
              {m.callInfo.type==="video"?"Video call":"Voice call"}
            </Text>
            <Text style={{color:theme.muted,fontSize:12}}>
              {m.callInfo.status==="completed"
                ? (m.callInfo.durationSeconds!=null?formatCallDuration(m.callInfo.durationSeconds):"Completed")
                : m.callInfo.status==="failed"?"Not connected"
                : m.callInfo.status==="missed"?"Missed"
                : "Declined"}
              {" • "}
              {new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
            </Text>
          </View>
        </View>
      ) : (
        <>
          {m.attachment && (
            <MediaPreview media={m.attachment} />
          )}

          {!!m.text && (
            <Text
              style={{
                color: bubbleInk,
                fontSize: 16,
                fontWeight: "500",
                marginTop: m.attachment ? 6 : 0,
              }}
            >
              {m.text}
            </Text>
          )}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-end",
              gap: 4,
              marginTop: 4,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: bubbleMuted,
              }}
            >
              {m.editedAt ? "edited • " : ""}
              {new Date(m.createdAt).toLocaleTimeString(
                [],
                {
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}
            </Text>

            {mine && (
              <StatusTicks
                status={m.status}
                theme={{
                  ...theme,
                  muted: bubbleMuted,
                  brand: bubbleInk,
                }}
              />
            )}
          </View>
        </>
      )}
    </TouchableOpacity>

    <ActionSheet
      visible={actionsVisible}
      title="Message actions"
      options={sheetOptions}
      onRequestClose={() => setActionsVisible(false)}
      theme={theme}
    />
    </>
  );
}

function Chat({
  peerId,
  theme,
  onBack,
  onInfo,
  onCall,
  onVideo,
}: {
  peerId: string;
  theme: any;
  onBack: () => void;
  onInfo: () => void;
  onCall: () => void;
  onVideo: () => void;
}) {
  const st = useNexChatStore();
  const c = st.conversations.find((x) => x.peerId === peerId);
  const contact = st.contacts.find((x) => x.id === peerId);

  const [text, setText] = useState("");
  const [media, setMedia] = useState<Attachment[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [voiceVisible, setVoiceVisible] = useState(false);

  /*
   * A per-chat theme override was already being saved by the
   * "Chat theme" picker in ContactInfo, but nothing ever read it
   * back — every chat rendered with the global app theme
   * regardless of what was chosen here. "system" means "follow
   * the app's global theme", which is exactly the `theme` prop.
   */
  const effectiveTheme: any =
    c?.theme && c.theme !== "system"
      ? themes[c.theme as keyof typeof themes] || theme
      : theme;

  const chatBackground =
    st.settings.chatBackground === "custom" &&
    st.settings.chatBackgroundColor
      ? st.settings.chatBackgroundColor
      : effectiveTheme.bg;

  const chatBackgroundImage = st.settings.chatBackgroundImage;

  const send = async () => {
    if (!text.trim() && !media.length) return;

    if (media.length === 0) {
      await st.sendMessage(peerId, text.trim());
    } else {
      for (const item of media) {
        await st.sendMessage(peerId, text.trim(), item);
      }
    }

    setText("");
    setMedia([]);
  };

  const openAttachments = () => {
    Alert.alert("Attachments", "Choose what to send", [
      {
        text: "Camera",
        onPress: async () => {
          try {
            const photo = await capturePhoto();
            if (photo) {
              setMedia((prev) => [...prev, photo]);
            }
          } catch (e) {
            Alert.alert(
              "Camera unavailable",
              e instanceof Error ? e.message : "Unable to use the camera."
            );
          }
        },
      },
      {
        text: "Photos / Videos",
        onPress: async () => {
          try {
            const picked = await pickMedia(true);
            if (picked.length) {
              setMedia((prev) => [...prev, ...picked]);
            }
          } catch (e) {
            Alert.alert(
              "Media unavailable",
              e instanceof Error ? e.message : "Unable to access media."
            );
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[s.flex, { backgroundColor: chatBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Header
        title={contact?.displayName || peerId}
        subtitle={contact?.online ? "online" : "offline"}
        onBack={onBack}
        onInfo={onInfo}
        onCall={onCall}
        onVideo={onVideo}
        theme={effectiveTheme}
      />

      <View
        style={[
          s.encryptedBar,
          {
            backgroundColor: effectiveTheme.card,
            borderBottomColor: effectiveTheme.line,
          },
        ]}
      >
        <Text style={{ fontSize: 12, color: effectiveTheme.muted }}>
          🔐 End-to-end encrypted • Local queue ready
        </Text>
      </View>

      <ImageBackground
        source={chatBackgroundImage ? { uri: chatBackgroundImage } : undefined}
        style={{ flex: 1, backgroundColor: chatBackground }}
        imageStyle={{ opacity: 0.92 }}
      >
        <FlatList
          inverted
          style={{ backgroundColor: "transparent" }}
          data={[...(c?.messages || [])]
            .filter(
              (m) => !m.expiresAt || new Date(m.expiresAt).getTime() > Date.now()
            )
            .reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            padding: 12,
            gap: 6,
            backgroundColor: "transparent",
            flexGrow: 1,
          }}
          renderItem={({ item }) => (
          <MessageBubble
            m={item}
            theme={effectiveTheme}
            bubbleMeColor={st.settings.messageColorMe}
            bubbleThemColor={st.settings.messageColorThem}
            onEdit={() => {
              setEdit(item.id);
              setEditText(item.text);
            }}
            onDelete={() =>
              Alert.alert(
                "Delete message",
                "Delete for everyone or only for you?",
                [
                  {
                    text: "For everyone",
                    onPress: () => st.deleteMessage(item.id, true),
                  },
                  {
                    text: "For me",
                    onPress: () => st.deleteMessage(item.id, false),
                  },
                  { text: "Cancel", style: "cancel" },
                ]
              )
            }
            onViewOnce={() => st.markViewOnce(item.id)}
          />
        )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ color: effectiveTheme.muted }}>
                Start the conversation.
              </Text>
            </View>
          }
        />
      </ImageBackground>

      {voiceVisible ? (
        <VoiceRecorder
          theme={effectiveTheme}
          onCancel={() => setVoiceVisible(false)}
          onRecorded={async (attachment) => {
            setVoiceVisible(false);
            await st.sendMessage(peerId, "", attachment);
          }}
        />
      ) : (
        <View
          style={[
            s.composer,
            {
              backgroundColor: effectiveTheme.card,
              borderTopColor: effectiveTheme.line,
            },
          ]}
        >
          {media.length > 0 && (
            <ScrollView horizontal>
              {media.map((m, i) => (
                <MediaPreview
                  key={m.id}
                  media={m}
                  onRemove={() =>
                    setMedia(media.filter((_, x) => x !== i))
                  }
                />
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={openAttachments}>
              <Text style={{ fontSize: 25, color: effectiveTheme.ink }}>＋</Text>
            </TouchableOpacity>

            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Message"
              placeholderTextColor={effectiveTheme.muted}
              style={[
                s.messageInput,
                {
                  color: effectiveTheme.ink,
                  borderColor: effectiveTheme.line,
                  backgroundColor: effectiveTheme.bg,
                },
              ]}
            />

            {text.trim() || media.length ? (
              <TouchableOpacity
                onPress={send}
                style={[s.send, { backgroundColor: effectiveTheme.brand }]}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>➤</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setVoiceVisible(true)}
                style={[s.send, { backgroundColor: effectiveTheme.brand }]}
              >
                <Text style={{ fontSize: 20 }}>🎙</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {edit && (
        <Modal transparent visible onRequestClose={() => setEdit(null)}>
          <View style={s.overlay}>
            <View style={[s.dialog, { backgroundColor: effectiveTheme.card }]}>
              <Text style={[s.dialogTitle, { color: effectiveTheme.ink }]}>
                Edit message
              </Text>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                style={[
                  s.input,
                  { color: effectiveTheme.ink, borderColor: effectiveTheme.line },
                ]}
              />
              <Button
                label="Save edit"
                onPress={async () => {
                  await st.editMessage(edit, editText);
                  setEdit(null);
                }}
              />
              <Button label="Cancel" secondary onPress={() => setEdit(null)} />
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

function ContactInfo({peerId,theme,onBack,onCall,onVideo,onDeleted}:{peerId:string;theme:any;onBack:()=>void;onCall:()=>void;onVideo:()=>void;onDeleted:()=>void}){const st=useNexChatStore();const [disappearingMenuVisible,setDisappearingMenuVisible]=useState(false);const disappearingMenuOptions:ActionSheetOption[]=[{text:"Off",onPress:()=>st.setConversation(peerId,{disappearingSeconds:0})},{text:"24 hours",onPress:()=>st.setConversation(peerId,{disappearingSeconds:86400})},{text:"7 days",onPress:()=>st.setConversation(peerId,{disappearingSeconds:604800})},{text:"Cancel",style:"cancel"}];const c=st.contacts.find(x=>x.id===peerId);const conv=st.conversations.find(x=>x.peerId===peerId);const media=(conv?.messages||[]).map(m=>m.attachment).filter(Boolean) as Attachment[];const links=(conv?.messages||[]).filter(m=>/https?:\/\//.test(m.text));return <View style={s.flex}><Header title="Contact info" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={{paddingBottom:40}}><View style={s.profileHead}><View
  style={[
    s.bigAvatar,
    {
      backgroundColor: theme.brand,
      overflow: "hidden",
    },
  ]}
>
  {c?.avatarUri ? (
    <Image
      source={{ uri: c.avatarUri }}
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
      }}
    />
  ) : (
    <Text
      style={{
        color: "white",
        fontSize: 32,
        fontWeight: "900",
      }}
    >
      {(c?.displayName || peerId)
        .slice(0, 1)
        .toUpperCase()}
    </Text>
  )}
</View><Text style={[s.profileName,{color:theme.ink}]}>{c?.displayName||peerId}</Text><Text style={{color:theme.muted}}>@{c?.username||"nexchat"}</Text><Text style={{color:theme.muted}}>{peerId}</Text><View style={{flexDirection:"row",gap:12,marginTop:14}}><Button label="📞 Voice" onPress={onCall}/><Button label="🎥 Video" onPress={onVideo}/></View></View><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><Row icon="🔐" title="Encryption" subtitle="End-to-end encrypted" theme={theme}/><Row icon="🔔" title="Notifications" subtitle={conv?.muted?"Muted":"On"} theme={theme}/><Row icon="⏱" title="Disappearing messages" subtitle={conv?.disappearingSeconds?`${conv.disappearingSeconds}s`:"Off"} onPress={()=>setDisappearingMenuVisible(true)} theme={theme}/><Row icon="👁" title="View-once media" subtitle="Available per message" theme={theme}/><Row icon="🎨" title="Chat theme" subtitle={conv?.theme||"Global theme"} onPress={()=>Alert.alert("Chat theme","Choose",[{text:"System",onPress:()=>st.setConversation(peerId,{theme:"system"})},{text:"Light",onPress:()=>st.setConversation(peerId,{theme:"light"})},{text:"Dark",onPress:()=>st.setConversation(peerId,{theme:"dark"})}])} theme={theme}/><Row icon="📌" title="Pin chat" right={<Switch value={!!conv?.pinned} onValueChange={v=>st.pinConversation(peerId,v)}/>} /><Row icon="📦" title="Archive chat" right={<Switch value={!!conv?.archived} onValueChange={v=>st.archiveConversation(peerId,v)}/>} /></View><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><Text style={[s.sectionTitle,{color:theme.ink}]}>Shared media</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}>{media.slice(-12).map(m=><MediaPreview key={m.id} media={m}/>)}</View>{media.length>0&&<Text style={{color:theme.muted,marginTop:6}}>{media.length} attachment(s) • retrievable from this chat</Text>}<Row icon="🔗" title="Links" subtitle={`${links.length} shared link(s)`} theme={theme}/><Row icon="📄" title="Files" subtitle={`${media.filter(m=>m.type==="file").length} file(s)`} theme={theme}/></View><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><Text style={[s.sectionTitle,{color:theme.ink}]}>Connection / P2P</Text><Row icon="🌐" title="Preferred route" subtitle="Automatic" theme={theme}/><Row icon="📶" title="Nearby" subtitle="Bluetooth / Wi-Fi Direct (native build)" theme={theme}/><Row icon="🛡" title="Relay preference" subtitle="Privacy-first when direct P2P is not required" theme={theme}/></View><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><Row icon="🚫" title="Block contact" onPress={()=>Alert.alert("Block contact?","They will not be able to message or call you.",[{text:"Block",style:"destructive",onPress:()=>st.block(peerId)},{text:"Cancel",style:"cancel"}])} theme={theme}/><Row icon="⚠" title="Report contact" onPress={()=>Alert.alert("Report","Report flow will be connected to moderation services in the services repository.")} theme={theme}/><Row icon="🗑" title="Clear chat" onPress={()=>Alert.alert("Clear chat","Local messages will be removed from this conversation.",[{text:"Clear",style:"destructive",onPress:()=>st.clearConversation(peerId)},{text:"Cancel",style:"cancel"}])} theme={theme}/><Row icon="⛔" title="Delete chat" onPress={()=>Alert.alert("Delete chat?","This removes the entire conversation from your chat list. This cannot be undone.",[{text:"Delete",style:"destructive",onPress:async()=>{await st.deleteConversation(peerId);onDeleted()}},{text:"Cancel",style:"cancel"}])} theme={theme}/></View></ScrollView><ActionSheet visible={disappearingMenuVisible} title="Disappearing messages" message="Choose a timer" options={disappearingMenuOptions} onRequestClose={()=>setDisappearingMenuVisible(false)} theme={theme}/></View>}

function Settings({theme,onSection,onBack}:{theme:any;onSection:(s:string)=>void;onBack:()=>void}){
  const st=useNexChatStore();

  return (
    <View style={s.flex}>
      <Header
        title="Settings"
        subtitle="Every item opens a real control"
        onBack={onBack}
        theme={theme}
      />

      <ScrollView contentContainerStyle={{padding:12,paddingBottom:40}}>

        <View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}>
          <Row
            icon="👤"
            title="Profile"
            subtitle="Name, username and NexChat ID"
            onPress={()=>onSection("profile")}
            theme={theme}
          />

          <Row
            icon="🔐"
            title="Account & Security"
            subtitle="Passcode, biometrics, trusted devices"
            onPress={()=>onSection("security")}
            theme={theme}
          />

          <Row
            icon="🛡"
            title="Privacy"
            subtitle="Presence, receipts, blocked contacts"
            onPress={()=>onSection("privacy")}
            theme={theme}
          />

          <Row
            icon="💾"
            title="Backup & Recovery"
            subtitle={`${st.settings.backupEnabled?st.settings.backupSchedule:"Off"} • encrypted`}
            onPress={()=>onSection("backup")}
            theme={theme}
          />
        </View>

        <View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}>
          <Row
            icon="💬"
            title="Chats"
            subtitle="Disappearing messages, view-once, storage"
            onPress={()=>onSection("chats")}
            theme={theme}
          />

          <Row
            icon="🎨"
            title="Appearance & Themes"
            subtitle={st.settings.theme}
            onPress={()=>onSection("appearance")}
            theme={theme}
          />

          <Row
            icon="🔔"
            title="Notifications & Calls"
            subtitle="Messages, calls and sounds"
            onPress={()=>onSection("notifications")}
            theme={theme}
          />

          <Row
            icon="📦"
            title="Media & Storage"
            subtitle="Downloads, cache and attachment behavior"
            onPress={()=>onSection("media")}
            theme={theme}
          />
        </View>

        <View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}>
          <Row
            icon="📡"
            title="Connections / P2P"
            subtitle="Internet, relay, Bluetooth and Wi-Fi Direct"
            onPress={()=>onSection("p2p")}
            theme={theme}
          />

          <Row
            icon="🚫"
            title="Blocked contacts"
            subtitle={`${st.blockedIds.length} blocked`}
            onPress={()=>onSection("blocked")}
            theme={theme}
          />

          <Row
            icon="📱"
            title="Devices"
            subtitle="Trusted devices and remote actions"
            onPress={()=>onSection("devices")}
            theme={theme}
          />
        </View>

      </ScrollView>
    </View>
  );
}

function SettingSection({section,theme,onBack}:{section:string;theme:any;onBack:()=>void}){const st=useNexChatStore();const [id,setId]=useState<Identity|null>(null);const [name,setName]=useState("");const [username,setUsername]=useState("");
const [bio,setBio]=useState("");
const [website,setWebsite]=useState("");
const [location,setLocation]=useState("");
const [pronouns,setPronouns]=useState("");
const [followersCount,setFollowersCount]=useState(0);
const [followingCount,setFollowingCount]=useState(0);

const [chatSettingsTab,setChatSettingsTab]=useState<"colors"|"background">("colors");useEffect(() => {
  getIdentity().then(async x => {
    setId(x);
    setName(x.displayName);
    setUsername(x.username);
    setBio(x.bio ?? "");
    setWebsite(x.website ?? "");
    setLocation(x.location ?? "");
    setPronouns(x.pronouns ?? "");

    const counts = await getFeedFollowCounts(x.id);
    setFollowersCount(counts.followers);
    setFollowingCount(counts.following);
  });
}, []);

const saveProfile = async () => {
  await updateIdentity({
    displayName: name.trim() || "NexChat User",
    username: username.trim().replace(/^@/, "") || "user",
    bio: bio.trim(),
    website: website.trim(),
    location: location.trim(),
    pronouns: pronouns.trim(),
  });

  const updated = await getIdentity();
  setId(updated);

  Alert.alert("Saved", "Profile updated locally.");
};if(section==="profile") {
  const profilePhoto = async () => {
    try {
      const uri = await pickProfilePhoto();

      if (!uri) {
        return;
      }

      await updateIdentity({
        avatarUri: uri,
      });

      setId(await getIdentity());

      Alert.alert(
        "Profile picture updated",
        "Your new profile picture is stored locally."
      );
    } catch (e) {
      Alert.alert(
        "Profile picture unavailable",
        e instanceof Error
          ? e.message
          : "Unable to access your photos."
      );
    }
  };

  const removeProfilePhoto = async () => {
    await updateIdentity({
      avatarUri: undefined,
    });

    setId(await getIdentity());

    Alert.alert(
      "Profile picture removed",
      "Your NexChat avatar will now use your initials."
    );
  };

  return (
    <View style={s.flex}>
      <Header
        title="Profile"
        onBack={onBack}
        theme={theme}
      />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[s.form, {paddingBottom: 220}]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
        <View
          style={{
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={[
              s.profilePhoto,
              {
                backgroundColor: theme.surface,
                borderColor: theme.line,
              },
            ]}
          >
            {id?.avatarUri ? (
              <Image
                source={{ uri: id.avatarUri }}
                style={s.profilePhotoImage}
              />
            ) : (
              <Text
                style={{
                  color: theme.brand,
                  fontSize: 42,
                  fontWeight: "900",
                }}
              >
                {(id?.displayName || "N")
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 12,
            }}
          >
            <Button
              label={
                id?.avatarUri
                  ? "Change photo"
                  : "Add photo"
              }
              onPress={profilePhoto}
              theme={theme}
            />

            {id?.avatarUri && (
              <Button
                label="Remove"
                secondary
                onPress={removeProfilePhoto}
                theme={theme}
              />
            )}
          </View>
        </View>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          NexChat ID
        </Text>

        <Text
          style={[
            s.idBox,
            {
              color: theme.ink,
              borderColor: theme.line,
              backgroundColor: theme.card,
            },
          ]}
        >
          {id?.id || "Generating…"}
        </Text>

        <Button
          label="Copy ID"
          secondary
          theme={theme}
          onPress={() =>
            id &&
            Clipboard.setStringAsync(id.id)
          }
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Personal NexChat Link
        </Text>

        <View
          style={[
            s.qrCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.line,
              alignItems: "stretch",
            },
          ]}
        >
          <Text
            style={{
              color: theme.ink,
              fontWeight: "900",
              fontSize: 16,
              textAlign: "center",
            }}
          >
            nexchat://user/{id?.id || "…"}
          </Text>

          <Text
            style={{
              color: theme.muted,
              textAlign: "center",
              marginTop: 6,
              marginBottom: 12,
            }}
          >
            Send this link to someone so they can open your NexChat profile and start a conversation.
          </Text>

          <View style={{gap: 8}}>
            <Button
              label="Copy personal link"
              secondary
              theme={theme}
              onPress={async () => {
                if (!id) {
                  return;
                }

                await Clipboard.setStringAsync(
                  `nexchat://user/${id.id}`
                );

                Alert.alert(
                  "Link copied",
                  "Your personal NexChat link is ready to paste and send."
                );
              }}
            />

            <Button
              label="Share personal link"
              theme={theme}
              onPress={async () => {
                if (!id) {
                  return;
                }

                try {
                  await Share.share({
                    message: `Chat with me on NexChat: nexchat://user/${id.id}`,
                  });
                } catch (e) {
                  Alert.alert(
                    "Share unavailable",
                    e instanceof Error
                      ? e.message
                      : "Unable to share your NexChat link."
                  );
                }
              }}
            />
          </View>
        </View>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          My NexChat QR
        </Text>

        <View
          style={[
            s.qrCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.line,
            },
          ]}
        >
          {id && (
            <QRCode
              value={createContactQR(id)}
              size={190}
              backgroundColor="white"
              color="black"
            />
          )}

          <Text
            style={[
              s.qrName,
              { color: theme.ink },
            ]}
          >
            {id?.displayName || "NexChat User"}
          </Text>

          <Text
            style={{
              color: theme.muted,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            Let another NexChat user scan this code
            to add you.
          </Text>
        </View>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Display name
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Username
        </Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Bio
        </Text>

        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={160}
          placeholder="Tell people a little about yourself"
          placeholderTextColor={theme.muted}
          textAlignVertical="top"
          returnKeyType="default"
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
              minHeight: 100,
              paddingTop: 12,
              paddingBottom: 12,
            },
          ]}
        />

        <Text
          style={{
            color: theme.muted,
            textAlign: "right",
            marginTop: -8,
            marginBottom: 8,
          }}
        >
          {bio.length}/160
        </Text>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Website
        </Text>

        <TextInput
          value={website}
          onChangeText={setWebsite}
          placeholder="https://example.com"
          placeholderTextColor={theme.muted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Location
        </Text>

        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="City or country"
          placeholderTextColor={theme.muted}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Pronouns
        </Text>

        <TextInput
          value={pronouns}
          onChangeText={setPronouns}
          placeholder="Optional"
          placeholderTextColor={theme.muted}
          maxLength={30}
          style={[
            s.input,
            {
              color: theme.ink,
              borderColor: theme.line,
            },
          ]}
        />

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Audience
        </Text>

        <View
          style={[
            {
              flexDirection: "row",
              borderWidth: 1,
              borderRadius: 12,
              borderColor: theme.line,
              backgroundColor: theme.card,
              overflow: "hidden",
              marginBottom: 12,
            },
          ]}
        >
          <View
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 14,
              borderRightWidth: 1,
              borderRightColor: theme.line,
            }}
          >
            <Text
              style={{
                color: theme.ink,
                fontSize: 20,
                fontWeight: "900",
              }}
            >
              {followersCount}
            </Text>
            <Text style={{ color: theme.muted, marginTop: 3 }}>
              Followers
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <Text
              style={{
                color: theme.ink,
                fontSize: 20,
                fontWeight: "900",
              }}
            >
              {followingCount}
            </Text>
            <Text style={{ color: theme.muted, marginTop: 3 }}>
              Following
            </Text>
          </View>
        </View>

        <Text
          style={[
            s.label,
            { color: theme.ink },
          ]}
        >
          Joined NexChat
        </Text>

        <Text
          style={{
            color: theme.muted,
            marginBottom: 12,
          }}
        >
          {id?.joinedAt
            ? new Date(id.joinedAt).toLocaleDateString([], {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </Text>

        <Button
          label="Save profile"
          onPress={saveProfile}
          theme={theme}
        />

        <Text
          style={{
            color: theme.muted,
          }}
        >
          Your NexChat ID remains independent of
          your phone number.
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

if(section==="backup")return <View style={s.flex}><Header title="Backup & Recovery" subtitle="Encrypted local-first recovery" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={{padding:12,paddingBottom:40}}><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><View style={{padding:14,paddingBottom:10}}><Text style={[s.bigStat,{color:theme.ink}]}>{(st.vaultBytes/1024).toFixed(1)} KB</Text><Text style={{color:theme.muted}}>Current encrypted vault estimate</Text></View><Row icon="💾" title="Automatic backup" theme={theme} subtitle={st.settings.backupEnabled?st.settings.backupSchedule:"Off"} right={<Switch value={st.settings.backupEnabled} onValueChange={v=>st.updateSettings({backupEnabled:v})}/>} /><View style={{paddingHorizontal:14,paddingTop:8}}><Text style={[s.label,{color:theme.ink}]}>Schedule</Text><View style={{flexDirection:"row",gap:8,flexWrap:"wrap",marginTop:8}}>{(["daily","weekly","monthly","off"] as const).map(x=><TouchableOpacity key={x} onPress={()=>st.updateSettings({backupSchedule:x,backupEnabled:x!=="off"})} style={[s.chip,{borderColor:theme.line,backgroundColor:st.settings.backupSchedule===x?theme.brand:theme.card}]}><Text style={{color:st.settings.backupSchedule===x?"white":theme.ink,fontWeight:"800"}}>{x}</Text></TouchableOpacity>)}</View></View><View style={{padding:14,paddingTop:8}}><Text style={[s.label,{color:theme.ink}]}>Destination</Text></View>{(["device","trusted-device","cloud"] as const).map(x=><Row key={x} icon={x==="cloud"?"☁️":"📱"} title={x} theme={theme} right={<Switch value={st.settings.backupDestination===x} onValueChange={()=>st.updateSettings({backupDestination:x})}/>} />)}</View><View style={{gap:10,marginTop:2}}><Button label="Back up now" onPress={async()=>{try{await createBackupSnapshot();Alert.alert("Backup created","Your encrypted vault has been backed up on this device.")}catch(e){Alert.alert("Backup failed",e instanceof Error?e.message:"Unable to create backup.")}}}/><Button label="Restore from backup" secondary onPress={()=>Alert.alert("Restore from backup","This will replace your current chats and settings with the last backup on this device. This cannot be undone.",[{text:"Restore",style:"destructive",onPress:async()=>{try{await restoreFromBackup();await st.hydrate();Alert.alert("Restore complete","Your data has been restored from backup.")}catch(e){Alert.alert("Restore failed",e instanceof Error?e.message:"Unable to restore backup.")}}},{text:"Cancel",style:"cancel"}])}/><Button label="Verify encrypted vault" onPress={async()=>Alert.alert("Vault verification",(await verifyVault())?"Vault encryption and decryption succeeded.":"Vault verification failed.")}/><Button label="Generate Recovery Kit" secondary onPress={async()=>{const path=`${FileSystem.cacheDirectory}nexchat-recovery-kit.txt`;await FileSystem.writeAsStringAsync(path,`NexChat Recovery Kit\n\nAccount: ${id?.id||"local"}\nGenerated: ${new Date().toISOString()}\n\nThis file contains recovery instructions only. It does not contain plaintext messages or the raw vault key.\n`);if(await Sharing.isAvailableAsync())await Sharing.shareAsync(path);else Alert.alert("Recovery Kit created",path)}}/><Text style={{color:theme.muted}}>Cloud backup remains optional. Recovery material must never expose plaintext chats or raw encryption keys.</Text></View></ScrollView></View>;
if(section==="appearance")return <View style={s.flex}><Header title="Appearance & Themes" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={s.form}>{(["system","light","dark"] as const).map(x=><Row key={x} icon="🎨" title={x} right={<Switch value={st.settings.theme===x} onValueChange={()=>st.updateSettings({theme:x})}/>}  theme={theme}/>)}</ScrollView></View>;
if(section==="privacy")return <View style={s.flex}><Header title="Privacy" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={{padding:12,paddingBottom:40}}><View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}><Row icon="✓" title="Read receipts" theme={theme} right={<Switch value={st.settings.readReceipts} onValueChange={v=>st.updateSettings({readReceipts:v})}/>} /><Row icon="●" title="Online status" theme={theme} right={<Switch value={st.settings.onlineStatus} onValueChange={v=>st.updateSettings({onlineStatus:v})}/>} /><Row icon="◷" title="Last seen" theme={theme} right={<Switch value={st.settings.lastSeen} onValueChange={v=>st.updateSettings({lastSeen:v})}/>} /><Row icon="🔗" title="Link previews" theme={theme} right={<Switch value={st.settings.linkPreviews} onValueChange={v=>st.updateSettings({linkPreviews:v})}/>} /><Row icon="🚫" title="Blocked contacts" theme={theme} subtitle={`${st.blockedIds.length}`} /></View></ScrollView></View>;
if(section==="chats"){
  const messageColors = [
    {name:"Green",color:"#25D366"},
    {name:"Blue",color:"#2F80ED"},
    {name:"Pink",color:"#E91E63"},
    {name:"Red",color:"#EF4444"},
    {name:"Purple",color:"#8B5CF6"},
    {name:"Orange",color:"#F97316"},
    {name:"Teal",color:"#14B8A6"},
    {name:"Gray",color:"#64748B"},
  ];

  const backgroundColors = [
    {name:"Green",color:"#25D366"},
    {name:"Blue",color:"#2F80ED"},
    {name:"Pink",color:"#E91E63"},
    {name:"Red",color:"#EF4444"},
    {name:"Purple",color:"#8B5CF6"},
    {name:"Orange",color:"#F97316"},
    {name:"Teal",color:"#14B8A6"},
    {name:"Gray",color:"#64748B"},
  ];

  const chooseChatBackgroundImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo access required",
          "Allow NexChat to access your photos so you can choose a chat background."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;

      const sourceUri = result.assets[0].uri;
      const documentDirectory = FileSystem.documentDirectory;

      if (!documentDirectory) {
        throw new Error("NexChat could not access local storage.");
      }

      const oldUri = st.settings.chatBackgroundImage;
      const extension = sourceUri.split(".").pop()?.split("?")[0] || "jpg";
      const destinationUri =
        `${documentDirectory}nexchat-chat-background-${Date.now()}.${extension}`;

      await FileSystem.copyAsync({
        from: sourceUri,
        to: destinationUri,
      });

      await st.updateSettings({
        chatBackground: "custom",
        chatBackgroundColor: undefined,
        chatBackgroundImage: destinationUri,
      });

      if (oldUri && oldUri !== destinationUri) {
        try {
          await FileSystem.deleteAsync(oldUri, { idempotent: true });
        } catch {}
      }
    } catch (e) {
      Alert.alert(
        "Background image",
        e instanceof Error ? e.message : "Unable to choose that image."
      );
    }
  };

  const removeChatBackgroundImage = async () => {
    const oldUri = st.settings.chatBackgroundImage;

    await st.updateSettings({
      chatBackgroundImage: undefined,
      chatBackground: "system",
      chatBackgroundColor: undefined,
    });

    if (oldUri) {
      try {
        await FileSystem.deleteAsync(oldUri, { idempotent: true });
      } catch {}
    }
  };

  const selectSolidBackground = async (color:string) => {
    await st.updateSettings({
      chatBackground: "custom",
      chatBackgroundColor: color,
      chatBackgroundImage: undefined,
    });

    if (st.settings.chatBackgroundImage) {
      try {
        await FileSystem.deleteAsync(st.settings.chatBackgroundImage, {
          idempotent: true,
        });
      } catch {}
    }
  };

  return (
    <View style={s.flex}>
      <Header title="Chat settings" onBack={onBack} theme={theme}/>

      <View
        style={{
          flexDirection:"row",
          marginHorizontal:12,
          marginTop:10,
          padding:4,
          borderRadius:12,
          backgroundColor:theme.surface,
        }}
      >
        {[
          {id:"colors" as const,label:"Message Colors"},
          {id:"background" as const,label:"Chat Background"},
        ].map(tab=>(
          <TouchableOpacity
            key={tab.id}
            onPress={()=>setChatSettingsTab(tab.id)}
            style={{
              flex:1,
              paddingVertical:11,
              borderRadius:9,
              alignItems:"center",
              backgroundColor:
                chatSettingsTab===tab.id ? theme.card : "transparent",
              borderWidth:chatSettingsTab===tab.id ? 1 : 0,
              borderColor:theme.line,
            }}
          >
            <Text
              style={{
                color:chatSettingsTab===tab.id ? theme.ink : theme.muted,
                fontWeight:"800",
                fontSize:12,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.form}>
        {chatSettingsTab==="colors" ? (
          <>
            <Row
              icon="⏱"
              title="Default disappearing messages"
              subtitle={
                st.settings.defaultDisappearingSeconds
                  ? `${st.settings.defaultDisappearingSeconds}s`
                  : "Off"
              }
              onPress={()=>Alert.alert("Default timer","Choose",[
                {
                  text:"Off",
                  onPress:()=>st.updateSettings({
                    defaultDisappearingSeconds:0
                  })
                },
                {
                  text:"24 hours",
                  onPress:()=>st.updateSettings({
                    defaultDisappearingSeconds:86400
                  })
                },
                {
                  text:"7 days",
                  onPress:()=>st.updateSettings({
                    defaultDisappearingSeconds:604800
                  })
                }
              ])}
              theme={theme}
            />

            <Row
              icon="👁"
              title="Default view-once"
              right={
                <Switch
                  value={st.settings.defaultViewOnce}
                  onValueChange={v=>st.updateSettings({
                    defaultViewOnce:v
                  })}
                />
              }
              theme={theme}
            />

            <View style={{marginTop:18}}>
              <Text style={[s.label,{color:theme.ink}]}>
                Message colors
              </Text>
              <Text style={{color:theme.muted,marginBottom:12}}>
                Choose the bubble color used for sent and received messages.
              </Text>

              <Text
                style={{
                  color:theme.ink,
                  fontWeight:"800",
                  marginBottom:8
                }}
              >
                Sent messages
              </Text>

              <View
                style={{
                  flexDirection:"row",
                  flexWrap:"wrap",
                  gap:10,
                  marginBottom:18
                }}
              >
                <TouchableOpacity
                  onPress={()=>st.updateSettings({
                    messageColorMe:undefined
                  })}
                  style={{
                    width:46,
                    height:46,
                    borderRadius:23,
                    borderWidth:3,
                    borderColor:
                      !st.settings.messageColorMe
                        ? theme.brand
                        : theme.line,
                    backgroundColor:theme.card,
                    alignItems:"center",
                    justifyContent:"center",
                  }}
                >
                  <Text
                    style={{
                      color:theme.ink,
                      fontSize:11,
                      fontWeight:"800"
                    }}
                  >
                    DEF
                  </Text>
                </TouchableOpacity>

                {messageColors.map(x=>(
                  <TouchableOpacity
                    key={`me-${x.color}`}
                    onPress={()=>st.updateSettings({
                      messageColorMe:x.color
                    })}
                    style={{
                      width:46,
                      height:46,
                      borderRadius:23,
                      backgroundColor:x.color,
                      borderWidth:3,
                      borderColor:
                        st.settings.messageColorMe===x.color
                          ? theme.ink
                          : theme.card,
                    }}
                  />
                ))}
              </View>

              <Text
                style={{
                  color:theme.ink,
                  fontWeight:"800",
                  marginBottom:8
                }}
              >
                Received messages
              </Text>

              <View
                style={{
                  flexDirection:"row",
                  flexWrap:"wrap",
                  gap:10
                }}
              >
                <TouchableOpacity
                  onPress={()=>st.updateSettings({
                    messageColorThem:undefined
                  })}
                  style={{
                    width:46,
                    height:46,
                    borderRadius:23,
                    borderWidth:3,
                    borderColor:
                      !st.settings.messageColorThem
                        ? theme.brand
                        : theme.line,
                    backgroundColor:theme.card,
                    alignItems:"center",
                    justifyContent:"center",
                  }}
                >
                  <Text
                    style={{
                      color:theme.ink,
                      fontSize:11,
                      fontWeight:"800"
                    }}
                  >
                    DEF
                  </Text>
                </TouchableOpacity>

                {messageColors.map(x=>(
                  <TouchableOpacity
                    key={`them-${x.color}`}
                    onPress={()=>st.updateSettings({
                      messageColorThem:x.color
                    })}
                    style={{
                      width:46,
                      height:46,
                      borderRadius:23,
                      backgroundColor:x.color,
                      borderWidth:3,
                      borderColor:
                        st.settings.messageColorThem===x.color
                          ? theme.ink
                          : theme.card,
                    }}
                  />
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[s.label,{color:theme.ink}]}>
              Chat Background
            </Text>

            <Text style={{color:theme.muted,marginBottom:14}}>
              Choose a solid wallpaper or use a photo stored on this device.
            </Text>

            <Text
              style={{
                color:theme.ink,
                fontWeight:"800",
                marginBottom:8
              }}
            >
              Solid colors
            </Text>

            <View
              style={{
                flexDirection:"row",
                flexWrap:"wrap",
                gap:12,
                marginBottom:22
              }}
            >
              <TouchableOpacity
                onPress={async()=>{
                  const oldUri=st.settings.chatBackgroundImage;
                  await st.updateSettings({
                    chatBackground:"system",
                    chatBackgroundColor:undefined,
                    chatBackgroundImage:undefined,
                  });
                  if(oldUri){
                    try{
                      await FileSystem.deleteAsync(oldUri,{idempotent:true});
                    }catch{}
                  }
                }}
                style={{
                  width:52,
                  height:52,
                  borderRadius:26,
                  borderWidth:3,
                  borderColor:
                    st.settings.chatBackground==="system"
                      ? theme.brand
                      : theme.line,
                  backgroundColor:theme.card,
                  alignItems:"center",
                  justifyContent:"center",
                }}
              >
                <Text
                  style={{
                    color:theme.ink,
                    fontSize:10,
                    fontWeight:"800"
                  }}
                >
                  DEF
                </Text>
              </TouchableOpacity>

              {backgroundColors.map(x=>{
                const selected =
                  st.settings.chatBackground==="custom" &&
                  st.settings.chatBackgroundColor===x.color &&
                  !st.settings.chatBackgroundImage;

                return (
                  <TouchableOpacity
                    key={x.color}
                    onPress={()=>selectSolidBackground(x.color)}
                    style={{
                      width:52,
                      height:52,
                      borderRadius:26,
                      backgroundColor:x.color,
                      borderWidth:3,
                      borderColor:
                        selected ? theme.ink : theme.card,
                    }}
                  />
                );
              })}
            </View>

            <View
              style={{
                borderTopWidth:1,
                borderTopColor:theme.line,
                paddingTop:18
              }}
            >
              <Text
                style={{
                  color:theme.ink,
                  fontWeight:"800",
                  marginBottom:8
                }}
              >
                Custom from device
              </Text>

              {st.settings.chatBackgroundImage ? (
                <View>
                  <Image
                    source={{uri:st.settings.chatBackgroundImage}}
                    style={{
                      width:"100%",
                      height:180,
                      borderRadius:14,
                      backgroundColor:theme.surface,
                    }}
                    resizeMode="cover"
                  />

                  <View style={{marginTop:10}}>
                    <Button
                      label="Remove custom image"
                      secondary
                      onPress={removeChatBackgroundImage}
                      theme={theme}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  label="Choose image from device"
                  onPress={chooseChatBackgroundImage}
                  theme={theme}
                />
              )}

              <Text
                style={{
                  color:theme.muted,
                  fontSize:12,
                  marginTop:10,
                  lineHeight:18
                }}
              >
                The selected image is copied into NexChat's private local
                storage so it remains available after restarting the app.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
if(section==="media")return <View style={s.flex}><Header title="Media & Storage" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={s.form}><Row icon="⬇" title="Auto-download media" right={<Switch value={st.settings.autoDownload} onValueChange={v=>st.updateSettings({autoDownload:v})}/>} theme={theme}/><Row icon="🔗" title="Link previews" right={<Switch value={st.settings.linkPreviews} onValueChange={v=>st.updateSettings({linkPreviews:v})}/>} theme={theme}/><Text style={{color:theme.muted}}>Media is indexed by attachment ID so shared photos/videos/files can be retrieved from the chat without scanning the entire message payload.</Text><Button label="Clear cache" secondary onPress={()=>Alert.alert("Cache","Cache clearing is safe: it does not delete your encrypted messages.")}/></ScrollView></View>;
if(section==="p2p"){
  const routes=["automatic","relay","bluetooth","wifi-direct"] as const;
  const labels:{
    [key:string]:{icon:string;title:string;subtitle:string}
  }={
    automatic:{icon:"🌐",title:"Automatic",subtitle:"Select the safest available route"},
    relay:{icon:"🛡",title:"Prefer relay",subtitle:"Avoid direct peer addressing when possible"},
    bluetooth:{icon:"📶",title:"Bluetooth",subtitle:"Requires native development build"},
    "wifi-direct":{icon:"📡",title:"Wi-Fi Direct",subtitle:"Requires native development build"}
  };

  return <View style={s.flex}>
    <Header title="Connections / P2P" subtitle="Privacy-first transport controls" onBack={onBack} theme={theme}/>
    <ScrollView contentContainerStyle={s.form}>
      <View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}>
        <Text style={[s.sectionTitle,{color:theme.ink}]}>Preferred route</Text>
        {routes.map(route=>(
          <Row
            key={route}
            icon={labels[route].icon}
            title={labels[route].title}
            subtitle={labels[route].subtitle}
            theme={theme}
            right={
              <Switch
                value={st.settings.p2pRoute===route}
                onValueChange={()=>st.updateSettings({p2pRoute:route})}
              />
            }
          />
        ))}
      </View>

      <View style={[s.section,{backgroundColor:theme.card,borderColor:theme.line}]}>
        <Row
          icon="🔗"
          title="Allow direct connections"
          subtitle="Permit direct peer transport when supported"
          theme={theme}
          right={
            <Switch
              value={!!st.settings.allowDirectP2P}
              onValueChange={v=>st.updateSettings({allowDirectP2P:v})}
            />
          }
        />

        <Row
          icon="👁"
          title="Hide direct address"
          subtitle="Do not expose direct network addressing"
          theme={theme}
          right={
            <Switch
              value={st.settings.hideDirectAddress!==false}
              onValueChange={v=>st.updateSettings({hideDirectAddress:v})}
            />
          }
        />
      </View>

      <Text style={{color:theme.muted}}>
        Expo Go can test these controls and local storage. Real Bluetooth,
        Wi-Fi Direct and WebRTC transport require the native development build.
      </Text>
    </ScrollView>
  </View>;
}if(section==="blocked")return <View style={s.flex}><Header title="Blocked contacts" onBack={onBack} theme={theme}/><FlatList data={st.blockedIds} keyExtractor={x=>x} contentContainerStyle={s.form} ListEmptyComponent={<Text style={{color:theme.muted}}>No blocked contacts.</Text>} renderItem={({item})=><Row icon="🚫" title={item} theme={theme} right={<Button label="Unblock" secondary onPress={()=>st.unblock(item)}/>}/>} /></View>;
if(section==="security")return <View style={s.flex}><Header title="Account & Security" onBack={onBack} theme={theme}/><ScrollView contentContainerStyle={s.form}><PasscodeManager theme={theme}/><Button label="Verify with device biometrics" onPress={async()=>{try{const enabled=await isBiometricEnabled();if(!enabled){Alert.alert("Biometric app lock","Enable Biometric app lock first.");return;}const verified=await authenticateBiometric();Alert.alert("Biometric verification",verified?"Verified.":"Verification cancelled or failed.")}catch(e){Alert.alert("Biometric verification",e instanceof Error?e.message:"Biometric verification failed.")}}}/><Row icon="🔒" title="Biometric app lock" theme={theme} subtitle={st.settings.biometricLock?"Locks NexChat when it leaves the foreground":"Require biometric authentication when NexChat returns"} right={<Switch value={st.settings.biometricLock} onValueChange={async v=>{try{await setBiometricEnabled(v);await st.updateSettings({biometricLock:v});if(v)Alert.alert("Biometric app lock","Biometric app lock is now enabled.");}catch(e){Alert.alert("Biometric app lock",e instanceof Error?e.message:"Biometric authentication is unavailable.");}}}/>} /><Row icon="📱" title="Trusted devices" theme={theme} subtitle="Device recovery architecture"/><Text style={{color:theme.muted}}>Recovery should prioritize device authentication and a user-created recovery PIN; phone OTP is optional rather than the primary identity mechanism.</Text></ScrollView></View>;
return <View style={s.flex}><Header title={section} onBack={onBack} theme={theme}/><View style={s.empty}><Text style={{color:theme.muted}}>This section is reserved for the next native/service layer.</Text></View></View>}

function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function Calls({theme,onStartCall}:{theme:any;onStartCall:(peerId:string,video:boolean)=>void}){
  const st=useNexChatStore();
  const [searchVisible,setSearchVisible]=useState(false);
  const [query,setQuery]=useState("");
  const filtered=st.contacts.filter(c=>{
    const q=query.trim().toLowerCase();
    if(!q) return true;
    return (c.displayName||"").toLowerCase().includes(q)||(c.username||"").toLowerCase().includes(q)||c.id.toLowerCase().includes(q);
  });
  const history=st.callHistory;
  return <View style={s.flex}>
    <Header title="Calls" subtitle="Voice and video call history" theme={theme}/>
    {history.length===0?(
      <View style={s.empty}>
        <Text style={{fontSize:40}}>📞</Text>
        <Text style={{color:theme.ink,fontWeight:"800"}}>No calls yet</Text>
        <Text style={{color:theme.muted,textAlign:"center",maxWidth:300}}>Calls you make will appear here. Real audio/video transport belongs in the native development build — NexChat will not fake a connected call in Expo Go, but it does track real call attempts and their outcome.</Text>
      </View>
    ):(
      <FlatList data={history} keyExtractor={h=>h.id} contentContainerStyle={{padding:12,paddingBottom:100}}
        renderItem={({item})=>{
          const c=st.contacts.find(x=>x.id===item.peerId);
          const label=item.status==="completed"?(item.durationSeconds!=null?formatCallDuration(item.durationSeconds):"Completed"):item.status==="failed"?"Not connected":item.status==="missed"?"Missed":"Declined";
          const labelColor=item.status==="completed"?theme.muted:theme.danger;
          return <TouchableOpacity onPress={()=>onStartCall(item.peerId,item.type==="video")} style={[s.chatRow,{backgroundColor:theme.card,borderColor:theme.line}]}>
            <View style={[s.avatar,{backgroundColor:theme.brand}]}>
              <Text style={{color:"white",fontWeight:"900"}}>{(c?.displayName||item.peerId).slice(0,1).toUpperCase()}</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={[s.chatName,{color:theme.ink}]}>{c?.displayName||item.peerId}</Text>
              <Text style={{color:labelColor,fontSize:12}}>{item.direction==="outgoing"?"↗":"↙"} {item.type==="video"?"Video":"Voice"} • {label}</Text>
            </View>
            <Text style={{color:theme.muted,fontSize:11,marginRight:8}}>{new Date(item.endedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</Text>
            <Text style={{fontSize:20}}>{item.type==="video"?"🎥":"📞"}</Text>
          </TouchableOpacity>;
        }}
      />
    )}
    <TouchableOpacity onPress={()=>setSearchVisible(true)} style={[s.fab,{backgroundColor:theme.brand}]}>
      <Text style={{color:"white",fontSize:28}}>＋</Text>
    </TouchableOpacity>
    <Modal visible={searchVisible} animationType="slide" onRequestClose={()=>setSearchVisible(false)}>
      <View style={[s.flex,{backgroundColor:theme.bg}]}>
        <Header title="New call" subtitle="Search contacts" onBack={()=>setSearchVisible(false)} theme={theme}/>
        <View style={{padding:12}}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search by name, username or ID" placeholderTextColor={theme.muted} style={[s.messageInput,{color:theme.ink,borderColor:theme.line,backgroundColor:theme.card}]}/>
        </View>
        <FlatList data={filtered} keyExtractor={c=>c.id} contentContainerStyle={{padding:12,paddingBottom:40}}
          ListEmptyComponent={<View style={s.empty}><Text style={{color:theme.muted}}>No contacts match your search.</Text></View>}
          renderItem={({item})=>(
            <View style={[s.chatRow,{backgroundColor:theme.card,borderColor:theme.line}]}>
              <View style={[s.avatar,{backgroundColor:theme.brand}]}>
                <Text style={{color:"white",fontWeight:"900"}}>{(item.displayName||item.id).slice(0,1).toUpperCase()}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={[s.chatName,{color:theme.ink}]}>{item.displayName||item.id}</Text>
                <Text style={{color:theme.muted,fontSize:12}}>{item.username?`@${item.username}`:item.id}</Text>
              </View>
              <TouchableOpacity onPress={()=>{setSearchVisible(false);setQuery("");onStartCall(item.id,false)}} style={{padding:8}}>
                <Text style={{fontSize:22}}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{setSearchVisible(false);setQuery("");onStartCall(item.id,true)}} style={{padding:8}}>
                <Text style={{fontSize:22}}>🎥</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </Modal>
  </View>
}

function CallOverlay({contact,video,onEnd,theme}:{contact:NexContact|undefined;video:boolean;onEnd:(outcome:{status:CallHistoryEntry["status"];connectedAt?:string;durationSeconds?:number})=>void;theme:any}){
  const [status,setStatus]=useState<"calling"|"ringing"|"connected">("calling");
  const [connectedAt,setConnectedAt]=useState<string|null>(null);
  const [elapsed,setElapsed]=useState(0);

  useEffect(()=>{
    const t1=setTimeout(()=>setStatus("ringing"),1000);
    const t2=setTimeout(()=>{
      setStatus("connected");
      setConnectedAt(new Date().toISOString());
    },2500);
    return ()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);

  useEffect(()=>{
    if(status!=="connected") return;
    const interval=setInterval(()=>setElapsed(e=>e+1),1000);
    return ()=>clearInterval(interval);
  },[status]);

  const end=()=>{
    onEnd({
      status:status==="connected"?"completed":"failed",
      connectedAt:connectedAt??undefined,
      durationSeconds:status==="connected"?elapsed:undefined,
    });
  };

  const statusLabel=status==="calling"?"Calling…":status==="ringing"?"Ringing…":formatCallDuration(elapsed);

  return <Modal transparent visible onRequestClose={end}>
    <View style={s.callOverlay}>
      <View style={[s.callCard,{backgroundColor:theme.card}]}>
        <View style={[s.bigAvatar,{backgroundColor:theme.brand}]}>
          <Text style={{color:"white",fontSize:34,fontWeight:"900"}}>{(contact?.displayName||"N").slice(0,1)}</Text>
        </View>
        <Text style={[s.profileName,{color:theme.ink}]}>{contact?.displayName||"NexChat contact"}</Text>
        <Text style={{color:theme.muted,fontSize:16}}>{video?"🎥 Video":"📞 Voice"}</Text>
        <View style={{flexDirection:"row",alignItems:"center",gap:8,marginTop:18}}><Text style={{color:theme.ink,fontWeight:"800",fontVariant:["tabular-nums"]}}>{statusLabel}</Text>{status!=="connected"&&<TypingDots color={theme.ink}/>}</View>

        {video&&(
          <View style={{width:"100%",height:150,borderRadius:16,backgroundColor:theme.bg,alignItems:"center",justifyContent:"center",marginTop:14,borderWidth:1,borderColor:theme.line}}>
            <Text style={{fontSize:26}}>🎥</Text>
            <Text style={{color:theme.muted,fontSize:12,marginTop:6,textAlign:"center",paddingHorizontal:16}}>Camera preview requires the native development build</Text>
          </View>
        )}

        <Text style={{color:theme.muted,textAlign:"center",marginTop:14,fontSize:12}}>Real audio/video transport requires the native WebRTC build. This is a local call attempt, honestly tracked — not a live connection.</Text>
        <Button label="End call" danger onPress={end}/>
      </View>
    </View>
  </Modal>;
}


function IdentitySetup({
  theme,
  onComplete,
}: {
  theme: any;
  onComplete: (identity: Identity) => void;
}) {
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const normalized = username.trim().replace(/^@/, "").toLowerCase();

    if (!normalized) {
      setError("Choose a username to continue.");
      return;
    }

    if (normalized.length < 3) {
      setError("Your username must be at least 3 characters.");
      return;
    }

    if (normalized.length > 20) {
      setError("Your username can be at most 20 characters.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(normalized)) {
      setError("Use only lowercase letters, numbers, and underscores.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await updateIdentity({
        username: normalized,
        displayName: normalized,
      });

      const updated = await getIdentity();
      onComplete(updated);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save your NexChat identity."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={[
        s.safe,
        {
          backgroundColor: theme.bg,
        },
      ]}
    >
      <StatusBar
        barStyle={
          theme.ink === "#FFFFFF"
            ? "light-content"
            : "dark-content"
        }
      />

      <ScrollView
        contentContainerStyle={[
          s.form,
          {
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 28,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <View
            style={[
              s.bigAvatar,
              {
                backgroundColor: theme.brand,
                marginBottom: 18,
              },
            ]}
          >
            <Text
              style={{
                color: "white",
                fontSize: 30,
                fontWeight: "900",
              }}
            >
              N
            </Text>
          </View>

          <Text
            style={{
              color: theme.ink,
              fontSize: 27,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            Create your NexChat identity
          </Text>

          <Text
            style={{
              color: theme.muted,
              fontSize: 14,
              textAlign: "center",
              marginTop: 10,
              lineHeight: 21,
            }}
          >
            Choose the username people will use to
            identify you on NexChat.
          </Text>
        </View>

        <Text
          style={[
            s.label,
            {
              color: theme.ink,
            },
          ]}
        >
          Username
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: theme.line,
            backgroundColor: theme.card,
            borderRadius: 14,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              color: theme.muted,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            @
          </Text>

          <TextInput
            value={username}
            onChangeText={(value) => {
              setUsername(
                value
                  .replace(/^@/, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "")
              );
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            placeholder="your_username"
            placeholderTextColor={theme.muted}
            style={{
              flex: 1,
              color: theme.ink,
              fontSize: 16,
              paddingVertical: 14,
              paddingHorizontal: 6,
            }}
          />
        </View>

        {!!error && (
          <Text
            style={{
              color: theme.danger,
              fontSize: 12,
              fontWeight: "700",
              marginTop: 4,
            }}
          >
            {error}
          </Text>
        )}

        <Text
          style={{
            color: theme.muted,
            fontSize: 12,
            lineHeight: 18,
            marginTop: 6,
          }}
        >
          3–20 characters. Letters, numbers and
          underscores only.
        </Text>

        <View
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 16,
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.line,
          }}
        >
          <Text
            style={{
              color: theme.ink,
              fontWeight: "900",
              marginBottom: 5,
            }}
          >
            Your NexChat ID
          </Text>

          <Text
            style={{
              color: theme.muted,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            Your device-generated NexChat ID will remain
            separate from your username and phone number.
          </Text>
        </View>

        <View style={{ marginTop: 22 }}>
          <Button
            label={saving ? "Creating identity…" : "Continue"}
            onPress={save}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function AppContent(){const insets=useSafeAreaInsets();const [securityLocked,setSecurityLocked]=useState(false);const biometricPromptRef=useRef(false);const [tab,setTab]=useState<Tab>("Chats");const [screen,setScreen]=useState<Screen>({name:"home"});const [identity,setIdentity]=useState<Identity|null>(null);const st=useNexChatStore();const [call,setCall]=useState<{id:string;peerId:string;video:boolean;startedAt:string}|null>(null);const beginCall=(peerId:string,video:boolean)=>setCall({id:`call-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,peerId,video,startedAt:new Date().toISOString()});const endCall=async(outcome:{status:CallHistoryEntry["status"];connectedAt?:string;durationSeconds?:number})=>{if(!call)return;const entry:CallHistoryEntry={id:call.id,peerId:call.peerId,type:call.video?"video":"voice",direction:"outgoing",status:outcome.status,startedAt:call.startedAt,connectedAt:outcome.connectedAt,endedAt:new Date().toISOString(),durationSeconds:outcome.durationSeconds};setCall(null);await st.logCall(entry);};const [startupError,setStartupError]=useState<string|null>(null);const [startupRetry,setStartupRetry]=useState(0);const [splashMinDone,setSplashMinDone]=useState(false);useEffect(()=>{(async()=>{try{await initIdentity();await initVault();await st.hydrate();setIdentity(await getIdentity());const bs=getPersistedSettingsSnapshot();const cfg={enabled:bs.backupEnabled,schedule:bs.backupSchedule,destination:bs.backupDestination};if(shouldRunBackup(cfg,bs.lastBackupRunAt??null)){const result=await runBackup(cfg);await st.updateSettings(result.success?{lastBackupRunAt:result.startedAt,lastBackupAttemptAt:result.startedAt,lastBackupError:undefined}:{lastBackupAttemptAt:result.startedAt,lastBackupError:result.error});}setStartupError(null)}catch(e){setStartupError(e instanceof Error?e.message:"NexChat failed to start for an unknown reason.")}})();},[startupRetry]);const mode=st.settings.theme==="system"?"light":st.settings.theme;const theme=themes[mode as keyof typeof themes]||themes.light;const contact=call?st.contacts.find(c=>c.id===call.peerId):undefined;const body=useMemo(()=>{if(screen.name==="chat")return <Chat peerId={screen.peerId} theme={theme} onBack={()=>setScreen({name:"home"})} onInfo={()=>setScreen({name:"contact",peerId:screen.peerId})} onCall={()=>beginCall(screen.peerId,false)} onVideo={()=>beginCall(screen.peerId,true)}/>;if(screen.name==="new")return <NewMessage theme={theme} onBack={()=>setScreen({name:"home"})} onOpen={id=>setScreen({name:"chat",peerId:id})}/>;if(screen.name==="contact")return <ContactInfo peerId={screen.peerId} theme={theme} onBack={()=>setScreen({name:"chat",peerId:screen.peerId})} onCall={()=>beginCall(screen.peerId,false)} onVideo={()=>beginCall(screen.peerId,true)} onDeleted={()=>setScreen({name:"home"})}/>;if(screen.name==="settings")return <Settings theme={theme} onBack={()=>setScreen({name:"home"})} onSection={s=>setScreen({name:"settingsSection",section:s})}/>;if(screen.name==="settingsSection")return <SettingSection section={screen.section} theme={theme} onBack={()=>setScreen({name:"settings"})}/>;switch(tab){case"Chats":return <ChatListScreen theme={theme} identity={identity} onOpen={id=>setScreen({name:"chat",peerId:id})} onNew={()=>setScreen({name:"new"})}/>;case"Calls":return <Calls theme={theme} onStartCall={beginCall}/>;case"Settings":return <Settings theme={theme} onBack={()=>setTab("Chats")} onSection={s=>setScreen({name:"settingsSection",section:s})}/>;case"Stories":return <StoriesScreen theme={theme} identity={identity}/>;default:return <FeedScreen theme={theme} identity={identity}/>}},[screen,tab,theme,st]);const appReady=identity!==null||startupError!==null;

useEffect(()=>{
  const subscription=AppState.addEventListener("change",async nextState=>{
    if((nextState==="background"||nextState==="inactive")&&st.settings.biometricLock){
      setSecurityLocked(true);
      return;
    }

    if(nextState==="active"&&securityLocked&&st.settings.biometricLock&&!biometricPromptRef.current){
      biometricPromptRef.current=true;
      try{
        const unlocked=await authenticateBiometric();
        if(unlocked)setSecurityLocked(false);
      }finally{
        biometricPromptRef.current=false;
      }
    }
  });

  return()=>subscription.remove();
},[securityLocked,st.settings.biometricLock]);
const needsIdentitySetup =
  identity?.displayName === "NexChat User" &&
  identity?.username === "user";if(!splashMinDone||!appReady){return <BootSplash onMinimumDurationElapsed={()=>setSplashMinDone(true)}/>;}
if(!startupError&&needsIdentitySetup&&identity){
  return <IdentitySetup theme={theme} onComplete={updated=>setIdentity(updated)}/>;
}
if(startupError){return <View style={[s.safe,{backgroundColor:theme.bg}]}><StatusBar barStyle={mode==="light"?"dark-content":"light-content"}/><View style={{flex:1,alignItems:"center",justifyContent:"center",padding:28,gap:14}}><Text style={{fontSize:44}}>⚠️</Text><Text style={{fontSize:19,fontWeight:"900",color:theme.ink,textAlign:"center"}}>NexChat couldn't start</Text><Text style={{color:theme.muted,textAlign:"center"}}>{startupError}</Text><View style={{width:"100%",gap:10,marginTop:10}}><Button label="Try again" onPress={()=>setStartupRetry(k=>k+1)}/><Button label="Reset local vault (this device only)" danger onPress={()=>Alert.alert("Reset local vault?","This permanently deletes all chats, contacts and settings stored on this device. This cannot be undone, and only helps if the vault itself is what's broken.",[{text:"Reset",style:"destructive",onPress:async()=>{try{await clearVault();setStartupRetry(k=>k+1)}catch(e){Alert.alert("Reset failed",e instanceof Error?e.message:"Unable to reset local vault.")}}},{text:"Cancel",style:"cancel"}])}/></View></View></View>}return <View style={[s.safe,{backgroundColor:theme.bg}]}><StatusBar barStyle={mode==="light"?"dark-content":"light-content"}/>{securityLocked&&st.settings.biometricLock?<View style={{flex:1,backgroundColor:theme.bg,alignItems:"center",justifyContent:"center",padding:28}}><Text style={{fontSize:52}}>🔒</Text><Text style={{fontSize:22,fontWeight:"900",color:theme.ink,marginTop:14}}>NexChat is locked</Text><Text style={{color:theme.muted,textAlign:"center",marginTop:8}}>Authenticate with your device biometrics to continue.</Text><View style={{width:"100%",marginTop:22}}><Button label="Unlock with biometrics" onPress={async()=>{if(biometricPromptRef.current)return;biometricPromptRef.current=true;try{const unlocked=await authenticateBiometric();if(unlocked)setSecurityLocked(false);}finally{biometricPromptRef.current=false;}}}/></View></View>:<>{body}{screen.name==="home"&&<View style={[s.nav,{backgroundColor:theme.card,borderTopColor:theme.line,paddingBottom:insets.bottom}]}>{(["Chats","Stories","Feed","Calls","Settings"] as Tab[]).map(x=><TouchableOpacity key={x} onPress={()=>x==="Settings"?setScreen({name:"settings"}):setTab(x)} style={s.navItem}><Text style={{fontSize:18,color:theme.ink}}>{x==="Chats"?"💬":x==="Stories"?"◉":x==="Feed"?"▦":x==="Calls"?"📞":"⚙"}</Text><Text style={{fontSize:11,color:tab===x?theme.brand:theme.muted,fontWeight:"800"}}>{x}</Text></TouchableOpacity>)}</View>}{call&&<CallOverlay contact={contact} video={call.video} onEnd={endCall} theme={theme}/>}</>}</View>}

export default function App(){return <SafeAreaProvider><AppContent/></SafeAreaProvider>}

const s=StyleSheet.create({safe:{flex:1},flex:{flex:1},header:{minHeight:68,paddingHorizontal:8,flexDirection:"row",alignItems:"center",borderBottomWidth:1},headBack:{width:42,alignItems:"center"},headTitle:{fontSize:18,fontWeight:"900"},headSub:{fontSize:11,marginTop:2},headAction:{width:42,alignItems:"center"},empty:{flex:1,alignItems:"center",justifyContent:"center",padding:30,gap:8},chatRow:{padding:12,borderWidth:1,borderRadius:16,marginBottom:8,flexDirection:"row",gap:12},avatar:{width:48,height:48,borderRadius:24,alignItems:"center",justifyContent:"center"},chatName:{fontWeight:"900",fontSize:16},fab:{position:"absolute",right:18,bottom:78,width:58,height:58,borderRadius:29,alignItems:"center",justifyContent:"center",elevation:4},nav:{minHeight:66,borderTopWidth:1,flexDirection:"row",justifyContent:"space-around",paddingTop:8},navItem:{alignItems:"center",gap:2,minWidth:55},form:{padding:16,gap:12},label:{fontWeight:"900",marginTop:8},input:{borderWidth:1,borderRadius:14,padding:13,fontSize:15},chip:{borderWidth:1,borderRadius:14,padding:10,marginRight:8,minWidth:120},button:{backgroundColor:"#0C5A8D",paddingVertical:13,paddingHorizontal:16,borderRadius:14,alignItems:"center",justifyContent:"center"},secondary:{backgroundColor:"#E7EEF4"},danger:{backgroundColor:"#B42318"},buttonText:{color:"white",fontWeight:"900"},toggleLine:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},bubble:{maxWidth:"82%",padding:10,borderRadius:16,borderWidth:1,marginVertical:2},composer:{padding:8,borderTopWidth:1},messageInput:{flex:1,maxHeight:120,minHeight:44,borderWidth:1,borderRadius:22,paddingHorizontal:15,paddingVertical:10},send:{width:44,height:44,borderRadius:22,alignItems:"center",justifyContent:"center"},encryptedBar:{padding:7,alignItems:"center",borderBottomWidth:1},section:{marginBottom:12,borderWidth:1,borderRadius:16,overflow:"hidden"},row:{minHeight:58,paddingHorizontal:14,paddingVertical:9,flexDirection:"row",alignItems:"center",gap:12},rowIcon:{fontSize:19,width:25,textAlign:"center"},rowTitle:{fontWeight:"800",fontSize:15},rowSub:{fontSize:11,marginTop:2},chevron:{fontSize:25},sectionTitle:{fontWeight:"900",fontSize:16,padding:14,paddingBottom:4},profileHead:{alignItems:"center",padding:24},bigAvatar:{width:96,height:96,borderRadius:48,alignItems:"center",justifyContent:"center"},profileName:{fontSize:23,fontWeight:"900",marginTop:10},idBox:{borderWidth:1,borderRadius:14,padding:15,fontWeight:"900",textAlign:"center"},bigStat:{fontSize:30,fontWeight:"900"},overlay:{flex:1,backgroundColor:"#0009",alignItems:"center",justifyContent:"center",padding:24},dialog:{width:"92%",padding:20,borderRadius:20,gap:12},dialogTitle:{fontSize:20,fontWeight:"900"},callOverlay:{flex:1,backgroundColor:"#000B",alignItems:"center",justifyContent:"center",padding:20},callCard:{width:"90%",borderRadius:26,padding:28,alignItems:"center",gap:10},profilePhoto:{width:120,height:120,borderRadius:60,borderWidth:2,alignItems:"center",justifyContent:"center",overflow:"hidden"},profilePhotoImage:{width:120,height:120,borderRadius:60},qrCard:{alignItems:"center",justifyContent:"center",padding:20,borderWidth:1,borderRadius:20},qrName:{fontSize:18,fontWeight:"900",marginTop:14}})
