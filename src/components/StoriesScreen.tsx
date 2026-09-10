import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useNexChatStore } from "../core/store";
import { Identity } from "../core/identity";
import { addStory, createStory } from "../core/stories";
import { capturePhoto, captureVideo, pickMedia } from "../core/media";
import { StoryShortcut } from "./StoryShortcut";
import { StoryViewer } from "./StoryViewer";
import { ChannelsScreen } from "./ChannelsScreen";
import { ActionSheet, ActionSheetOption } from "./ActionSheet";

type StoriesScreenProps = {
  theme: any;
  identity: Identity | null;
};

export function StoriesScreen({ theme, identity }: StoriesScreenProps) {
  const st = useNexChatStore();

  const [tab, setTab] = useState<"stories" | "channels">("stories");
  const [composerVisible, setComposerVisible] = useState(false);
  const [draft, setDraft] = useState("");
  const [viewerOwnerId, setViewerOwnerId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [posting, setPosting] = useState(false);

  const myId = identity?.id;
  const myName = identity?.displayName || "You";

  const postTextStory = async () => {
    if (!myId) {
      Alert.alert("Not ready", "Your identity is still loading.");
      return;
    }

    const text = draft.trim();

    if (!text) {
      Alert.alert("Nothing to post", "Write something for your story first.");
      return;
    }

    const story = createStory(myId, {
      type: "text",
      text,
      background: theme.brand,
    });

    await addStory(story);

    setDraft("");
    setComposerVisible(false);
    setRefreshKey((k) => k + 1);
  };

  const postMediaStory = async (
    getMedia: () => Promise<{ uri: string; type: "image" | "video" } | null>
  ) => {
    if (!myId) {
      Alert.alert("Not ready", "Your identity is still loading.");
      return;
    }

    setPosting(true);

    try {
      const media = await getMedia();

      if (!media) {
        return;
      }

      const story = createStory(myId, {
        type: media.type,
        uri: media.uri,
      });

      await addStory(story);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      Alert.alert(
        "Couldn't post story",
        e instanceof Error ? e.message : "Something went wrong."
      );
    } finally {
      setPosting(false);
    }
  };

  const [composerMenuVisible, setComposerMenuVisible] = useState(false);
  const composerMenuOptions: ActionSheetOption[] = [
    {
      text: "Camera photo",
      onPress: () =>
        postMediaStory(async () => {
          const attachment = await capturePhoto();
          return attachment ? { uri: attachment.uri, type: "image" } : null;
        }),
    },
    {
      text: "Camera video",
      onPress: () =>
        postMediaStory(async () => {
          const attachment = await captureVideo();
          return attachment ? { uri: attachment.uri, type: "video" } : null;
        }),
    },
    {
      text: "Photo / video from gallery",
      onPress: () =>
        postMediaStory(async () => {
          const picked = await pickMedia(false);
          const attachment = picked[0];
          if (!attachment) return null;
          if (attachment.type !== "image" && attachment.type !== "video") {
            throw new Error("Only photos and videos can be used for a story.");
          }
          return { uri: attachment.uri, type: attachment.type };
        }),
    },
    {
      text: "Text",
      onPress: () => setComposerVisible(true),
    },
    { text: "Cancel", style: "cancel" },
  ];

  const openComposerMenu = () => {
    setComposerMenuVisible(true);
  };

  return (
    <View style={s.flex}>
      <View
        style={[
          s.header,
          { backgroundColor: theme.card, borderBottomColor: theme.line },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.headTitle, { color: theme.ink }]}>Stories</Text>
          <Text style={[s.headSub, { color: theme.muted }]}>
            Photos, videos and text updates that disappear after 24 hours
          </Text>
        </View>
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity
          onPress={() => setTab("stories")}
          style={[
            s.tabButton,
            tab === "stories" && { borderBottomColor: theme.brand, borderBottomWidth: 2 },
          ]}
        >
          <Text style={{ color: tab === "stories" ? theme.brand : theme.muted, fontWeight: "700" }}>
            Stories
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab("channels")}
          style={[
            s.tabButton,
            tab === "channels" && { borderBottomColor: theme.brand, borderBottomWidth: 2 },
          ]}
        >
          <Text style={{ color: tab === "channels" ? theme.brand : theme.muted, fontWeight: "700" }}>
            Channels
          </Text>
        </TouchableOpacity>
      </View>

      {tab === "channels" ? (
        <ChannelsScreen theme={theme} identity={identity} />
      ) : (
      <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ padding: 16 }}
        key={refreshKey}
      >
        {myId && (
          <TouchableOpacity
            onPress={openComposerMenu}
            disabled={posting}
            style={{ alignItems: "center", marginRight: 12 }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                borderWidth: 2,
                borderColor: theme.brand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 28, color: theme.brand }}>
                {posting ? "…" : "＋"}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: theme.ink, marginTop: 5 }}>
              Add story
            </Text>
          </TouchableOpacity>
        )}

        {myId && (
          <StoryShortcut
            ownerId={myId}
            ownerName={myName}
            onPress={() => setViewerOwnerId(myId)}
            theme={theme}
          />
        )}

        {st.contacts
          .filter((c) => c.id !== myId)
          .map((c) => (
            <StoryShortcut
              key={c.id}
              ownerId={c.id}
              ownerName={c.displayName || c.id}
              avatarUri={c.avatarUri}
              onPress={() => setViewerOwnerId(c.id)}
              theme={theme}
            />
          ))}
      </ScrollView>

      <View style={s.emptyHint}>
        <Text style={{ color: theme.muted, textAlign: "center" }}>
          Stories from your contacts will appear here as circles above.
        </Text>
      </View>

      {composerVisible && (
        <View style={s.composerOverlay}>
          <View
            style={[
              s.composerCard,
              { backgroundColor: theme.card, borderColor: theme.line },
            ]}
          >
            <Text style={[s.composerTitle, { color: theme.ink }]}>
              New story
            </Text>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What's on your mind?"
              placeholderTextColor={theme.muted}
              style={[
                s.composerInput,
                { color: theme.ink, borderColor: theme.line },
              ]}
              multiline
              autoFocus
            />

            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setComposerVisible(false);
                  setDraft("");
                }}
                style={[s.composerButton, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={postTextStory}
                style={[
                  s.composerButton,
                  { backgroundColor: theme.brand, marginLeft: 8 },
                ]}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Post
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <StoryViewer
        visible={viewerOwnerId !== null}
        ownerId={viewerOwnerId}
        ownerName={
          viewerOwnerId === myId
            ? myName
            : st.contacts.find((c) => c.id === viewerOwnerId)?.displayName ||
              viewerOwnerId ||
              ""
        }
        onClose={() => {
          setViewerOwnerId(null);
          setRefreshKey((k) => k + 1);
        }}
      />
      </>
      )}

      <ActionSheet
        visible={composerMenuVisible}
        title="New story"
        message="Choose what to share"
        options={composerMenuOptions}
        onRequestClose={() => setComposerMenuVisible(false)}
        theme={theme}
      />
    </View>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },

  tabButton: {
    paddingVertical: 10,
    marginRight: 20,
  },

  header: {
    padding: 16,
    borderBottomWidth: 1,
  },

  headTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  headSub: {
    fontSize: 12,
    marginTop: 2,
  },

  emptyHint: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  composerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  composerCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },

  composerTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },

  composerInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    textAlignVertical: "top",
  },

  composerButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
});
