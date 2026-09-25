import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FeedProfileScreen } from "./FeedProfileScreen";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Clipboard from "expo-clipboard";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";

import {
  createFeedPost,
  updateFeedPost,
  incrementFeedShare,
  FeedAttachment,
  FeedCreator,
  FeedPost,
  FeedPostAudience,
  FeedPostType,
  loadFeedPosts,
  setFeedPostAudience,
  toggleFeedLike,
  getFeedComments,
  addFeedComment,
  FeedComment,
  toggleFeedCommentLike,
  toggleFeedCommentReaction,
  getFeedCommentReaction,
  toggleFeedPostPinned,
  toggleFeedPostNotifications,
  archiveFeedPost,
  deleteFeedPost,
} from "../core/feed";

type FeedTheme = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
};

type FeedScreenProps = {
  theme: FeedTheme;
  identity?: unknown;
  onOpenProfile?: (creator: FeedCreator) => void;
};

function identityValue(
  identity: unknown,
  keys: string[],
): string | undefined {
  if (!identity || typeof identity !== "object") return undefined;

  const source = identity as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();

    }

  return undefined;
  }
}

function getCreator(identity: unknown): FeedCreator {
  const id =
    identityValue(identity, ["id", "userId", "identityId"]) ??
    "local-user";

  const name =
    identityValue(identity, ["displayName", "name", "fullName"]) ??
    "NEXCHAT User";

  const username = identityValue(identity, [
    "username",
    "handle",
    "userName",
  ]);

  const avatarUri = identityValue(identity, [
    "avatarUri",
    "avatar",
    "photoUri",
    "photoURL",
    "photoUrl",
  ]);

  const bio = identityValue(identity, ["bio"]);
  const website = identityValue(identity, ["website"]);
  const location = identityValue(identity, ["location"]);
  const pronouns = identityValue(identity, ["pronouns"]);
  const joinedAt = identityValue(identity, ["joinedAt"]);

  return {
    id,
    name,
    username,
    avatarUri,
    bio,
    website,
    location,
    pronouns,
    joinedAt,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let activeFeedVideoPlayer: ReturnType<typeof useVideoPlayer> | null = null;

function safelyPauseFeedVideo(
  player: ReturnType<typeof useVideoPlayer> | null
) {
  if (!player) return;

  try {
    player.pause();
  } catch {
    // Expo may release the native player during unmount/navigation.
  }
}

function FeedMediaCarousel({
  attachments,
  theme,
  isActive = false,
  onVideoEnd,
  onDoubleTapLike,
}: {
  attachments: FeedAttachment[];
  theme: FeedTheme;
  isActive?: boolean;
  onVideoEnd?: () => boolean;
  onDoubleTapLike?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const containerWidth = event.nativeEvent.layoutMeasurement.width;

    if (!containerWidth) return;

    const nextPage = Math.round(offsetX / containerWidth);

    if (
      nextPage >= 0 &&
      nextPage < attachments.length
    ) {
      setPage(nextPage);
    }
  };

  const handleVideoEnd = (index: number): boolean => {
    if (index + 1 < attachments.length) {
      const nextPage = index + 1;

      setPage(nextPage);

      if (carouselWidth > 0) {
        carouselRef.current?.scrollTo({
          x: nextPage * carouselWidth,
          animated: true,
        });
      }

      return true;
    }

    return onVideoEnd?.() ?? false;
  };

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;

        if (width > 0 && width !== carouselWidth) {
          setCarouselWidth(width);
        }
      }}
    >
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={(event) => {
          const offsetX = event.nativeEvent.contentOffset.x;
          const containerWidth = event.nativeEvent.layoutMeasurement.width;

          if (!containerWidth) return;

          const finalPage = Math.round(offsetX / containerWidth);

          if (
            finalPage >= 0 &&
            finalPage < attachments.length
          ) {
            setPage(finalPage);
          }
        }}
        scrollEventThrottle={16}
      >
        {attachments.map((item, index) => (
          <View
            key={`${item.uri}-${index}`}
            style={[
              styles.carouselPage,
              { width: carouselWidth || "100%" },
            ]}
          >
            {isActive && page !== index && item.kind === "video" ? (
              <View style={[styles.feedVideo, { backgroundColor: theme.bg }]} />
            ) : (
              <FeedMedia
                attachment={item}
                theme={theme}
                isActive={isActive && page === index}
                onVideoEnd={() => handleVideoEnd(index)}
                onDoubleTapLike={onDoubleTapLike}
              />
            )}
          </View>
        ))}
      </ScrollView>

      {attachments.length > 1 && (
        <View style={styles.carouselIndicator}>
          <Text style={styles.carouselIndicatorText}>
            {page + 1} / {attachments.length}
          </Text>
        </View>
      )}
    </View>
  );
}

function formatAttachmentSize(size?: number) {
  if (!size || size <= 0) return "File";

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}


function FeedMedia({
  attachment,
  theme,
  isActive = false,
  onVideoEnd,
  onDoubleTapLike,
}: {
  attachment: FeedAttachment;
  theme: FeedTheme;
  isActive?: boolean;
  onVideoEnd?: () => boolean;
  onDoubleTapLike?: () => void;
}) {
  const kind =
    attachment.kind ??
    (attachment.mimeType?.startsWith("image/")
      ? "image"
      : attachment.mimeType?.startsWith("video/")
        ? "video"
        : attachment.mimeType?.startsWith("audio/")
          ? "audio"
          : "file");

  if (kind === "image") {
    return (
      <View style={styles.feedMediaOverlayContainer}>
        <Image
          source={{ uri: attachment.uri }}
          style={styles.feedImage}
          resizeMode="cover"
        />

        <View
          pointerEvents="none"
          style={styles.feedImageBrandLeft}
        >
          <Image
            source={require("../../assets/icon.png")}
            style={styles.feedImageBrandIcon}
            resizeMode="contain"
          />
        </View>

        <View
          pointerEvents="none"
          style={styles.feedBrandWatermark}
        >
          <Text style={styles.feedBrandWatermarkText}>
            NEXCHAT • EXILE
          </Text>
        </View>

        {attachment.overlayText?.trim() ? (
          <View
            pointerEvents="none"
            style={[
              styles.mediaOverlayPreview,
              {
                left: `${(attachment.overlayX ?? 0.5) * 100}%`,
                top: `${(attachment.overlayY ?? 0.5) * 100}%`,
              },
            ]}
          >
            <Text style={styles.mediaOverlayText}>
              {attachment.overlayText}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (kind === "video") {
    return (
      <FeedVideo
        attachment={attachment}
        theme={theme}
        autoPlay={isActive}
        onVideoEnd={onVideoEnd}
        onDoubleTapLike={onDoubleTapLike}
      />
    );
  }

  if (kind === "audio") {
    return <FeedAudio attachment={attachment} theme={theme} />;
  }

  return null;
}

function FeedVideo({
  attachment,
  theme,
  autoPlay = false,
  onVideoEnd,
  onDoubleTapLike,
}: {
  attachment: FeedAttachment;
  theme: FeedTheme;
  autoPlay?: boolean;
  onVideoEnd?: () => boolean;
  onDoubleTapLike?: () => void;
}) {
  const player = useVideoPlayer(attachment.uri, (videoPlayer) => {
    videoPlayer.loop = false;
    safelyPauseFeedVideo(videoPlayer);
  });

  const [playing, setPlaying] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [showVideoEndCard, setShowVideoEndCard] = useState(false);
  const endCardOpacity = useRef(new Animated.Value(0)).current;
  const endCardScale = useRef(new Animated.Value(0.92)).current;
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const subscription = player.addListener(
      "playingChange",
      ({ isPlaying }) => {
        console.log("[NEXCHAT VIDEO] PLAYING CHANGE", {
          uri: attachment.uri,
          isPlaying,
        });

        setPlaying(isPlaying);

        if (isPlaying) {
          setShowVideoEndCard(false);
          endCardOpacity.stopAnimation();
          endCardScale.stopAnimation();
          endCardOpacity.setValue(0);
          endCardScale.setValue(0.92);
        }

        if (!isPlaying && activeFeedVideoPlayer === player) {
          activeFeedVideoPlayer = null;
        }
      },
    );

    return () => {
      subscription.remove();

      if (activeFeedVideoPlayer === player) {
        activeFeedVideoPlayer = null;
      }

      safelyPauseFeedVideo(player);
    };
  }, [player, attachment.uri]);

  useEffect(() => {
    if (!autoPlay) {
      setManualPaused(false);

      if (activeFeedVideoPlayer === player) {
        activeFeedVideoPlayer = null;
      }

      safelyPauseFeedVideo(player);

      console.log("[NEXCHAT VIDEO] AUTO PAUSE / OUT OF VIEW", {
        uri: attachment.uri,
      });

      setPlaying(false);

      return;
    }

    if (manualPaused) {
      return;
    }

    if (activeFeedVideoPlayer && activeFeedVideoPlayer !== player) {
      safelyPauseFeedVideo(activeFeedVideoPlayer);
    }

    activeFeedVideoPlayer = player;

    /*
     * If this player previously reached the end, reset it before
     * auto-playing again. Otherwise Expo can remain at the end
     * position and appear to play silently.
     */
    try {
      if (
        player.duration > 0 &&
        player.currentTime >= player.duration - 0.15
      ) {
        console.log("[NEXCHAT VIDEO] RESET AFTER END", {
          uri: attachment.uri,
        });

        player.currentTime = 0;
      }

      console.log("[NEXCHAT VIDEO] AUTO PLAY", {
        uri: attachment.uri,
        currentTime: player.currentTime,
        duration: player.duration,
      });

      setPlaying(true);
      player.play();
    } catch (error) {
      console.log("[NEXCHAT VIDEO] AUTO PLAY ERROR", error);
      setPlaying(false);
    }
  }, [autoPlay, manualPaused, player, attachment.uri]);

  useEffect(() => {
    const subscription = player.addListener(
      "playToEnd",
      () => {
        console.log("[NEXCHAT VIDEO] PLAY TO END", {
          uri: attachment.uri,
        });

        setPlaying(false);

        endCardOpacity.stopAnimation();
        endCardScale.stopAnimation();
        endCardOpacity.setValue(0);
        endCardScale.setValue(0.92);

        setShowVideoEndCard(true);

        Animated.parallel([
          Animated.timing(endCardOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(endCardScale, {
              toValue: 1.04,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.spring(endCardScale, {
              toValue: 1,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }),
          ]),
        ]).start();

        setTimeout(() => {
          Animated.timing(endCardOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            setShowVideoEndCard(false);
          });

          const handled = onVideoEnd?.() ?? false;

          if (handled) {
            console.log("[NEXCHAT VIDEO] MOVING TO NEXT VIDEO", {
              uri: attachment.uri,
            });

            return;
          }

          /*
           * No later video exists.
           * Replay this video from the beginning instead of
           * manually setting currentTime and calling play().
           */
          console.log("[NEXCHAT VIDEO] LAST VIDEO - REPLAY", {
            uri: attachment.uri,
          });

          try {
            activeFeedVideoPlayer = player;
            setManualPaused(false);
            setPlaying(true);
            player.replay();
          } catch (error) {
            console.log("[NEXCHAT VIDEO] REPLAY ERROR", error);
            setPlaying(false);
          }
        }, 2000);
      },
    );

    return () => {
      subscription.remove();
    };
  }, [player, attachment.uri, onVideoEnd]);

  const togglePlayback = () => {
    console.log("[NEXCHAT VIDEO] TAP", {
      uri: attachment.uri,
      playing,
      playerPlaying: player.playing,
      activeSamePlayer: activeFeedVideoPlayer === player,
      hasActivePlayer: !!activeFeedVideoPlayer,
    });

    if (playing) {
      console.log("[NEXCHAT VIDEO] ACTION = PAUSE");

      setManualPaused(true);
      setPlaying(false);

      try {
        player.pause();
      } catch (error) {
        console.log("[NEXCHAT VIDEO] PAUSE ERROR", error);
      }

      return;
    }

    if (activeFeedVideoPlayer && activeFeedVideoPlayer !== player) {
      console.log("[NEXCHAT VIDEO] PAUSING OTHER VIDEO");
      safelyPauseFeedVideo(activeFeedVideoPlayer);
    }

    activeFeedVideoPlayer = player;
    setManualPaused(false);

    console.log("[NEXCHAT VIDEO] ACTION = PLAY");

    setPlaying(true);

    try {
      player.play();
    } catch (error) {
      console.log("[NEXCHAT VIDEO] PLAY ERROR", error);
      setPlaying(false);
    }
  };

  return (
    <View
      style={[
        styles.videoContainer,
        {
          backgroundColor: theme.bg,
          borderColor: theme.line,
        },
      ]}
    >
      <View style={styles.feedVideoStage}>
        {autoPlay || manualPaused ? (
          <VideoView
            player={player}
            style={styles.feedVideo}
            contentFit="contain"
            nativeControls={false}
          />
        ) : (
          <View
            style={[
              styles.feedVideo,
              {
                backgroundColor: theme.bg,
              },
            ]}
          />
        )}

        {showVideoEndCard ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.feedVideoEndCard,
              {
                opacity: endCardOpacity,
                transform: [{ scale: endCardScale }],
              },
            ]}
          >
            <Image
              source={require("../../assets/icon.png")}
              style={styles.feedVideoEndCardLogo}
              resizeMode="contain"
            />

            <Text style={styles.feedVideoEndCardApp}>
              NEXCHAT
            </Text>

            <Text style={styles.feedVideoEndCardExile}>
              • EXILE
            </Text>

            <Text style={styles.feedVideoEndCardCreator}>
              PRIVATE • LOCAL-FIRST
            </Text>
          </Animated.View>
        ) : null}

        {attachment.overlayText?.trim() ? (
          <View
            pointerEvents="none"
            style={[
              styles.mediaOverlayPreview,
              {
                left: `${(attachment.overlayX ?? 0.5) * 100}%`,
                top: `${(attachment.overlayY ?? 0.5) * 100}%`,
              },
            ]}
          >
            <Text style={styles.mediaOverlayText}>
              {attachment.overlayText}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            playing ? "Pause video" : "Play video"
          }
          onPress={() => {
            const now = Date.now();
            const sinceLastTap = now - lastTapRef.current;

            if (sinceLastTap < 280) {
              lastTapRef.current = 0;

              if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
              }

              onDoubleTapLike?.();
              return;
            }

            lastTapRef.current = now;

            singleTapTimeoutRef.current = setTimeout(() => {
              lastTapRef.current = 0;
              singleTapTimeoutRef.current = null;
              togglePlayback();
            }, 280);
          }}
          style={StyleSheet.absoluteFillObject}
        >
          {!playing ? (
            <View
              pointerEvents="none"
              style={styles.feedVideoPausedOverlay}
            >
              <View
                style={[
                  styles.feedVideoPlayOverlay,
                  { backgroundColor: theme.brand },
                ]}
              >
                <Text style={styles.feedVideoPlayOverlayText}>
                  ▶
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Text style={[styles.mediaCaption, { color: theme.muted }]}>
        {attachment.name || "Video"}
      </Text>
    </View>
  );
}

function FeedAudio({
  attachment,
  theme,
}: {
  attachment: FeedAttachment;
  theme: FeedTheme;
}) {
  const player = useAudioPlayer(attachment.uri);
  const status = useAudioPlayerStatus(player);

  const playing = status.playing;

  const togglePlayback = () => {
    if (playing) {
      player.pause();
    } else {
      player.play();
}
  };

  return (
    <View
      style={[
        styles.audioCard,
        {
          backgroundColor: theme.bg,
          borderColor: theme.line,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause audio" : "Play audio"}
        onPress={togglePlayback}
        style={[
          styles.audioPlayButton,
          { backgroundColor: theme.brand },
        ]}
      >
        <Text style={styles.audioPlayText}>
          {playing ? "Ⅱ" : "▶"}
        </Text>
      </Pressable>

      <View style={styles.audioInfo}>
        <Text
          style={[styles.attachmentName, { color: theme.ink }]}
          numberOfLines={2}
        >
          {attachment.name || "Audio"}
        </Text>

        <Text style={[styles.attachmentType, { color: theme.muted }]}>
          {playing ? "Playing" : "Tap to play"}
        </Text>
      </View>
    </View>
  );
    }

function PostCard({
  post,
  theme,
  userId,
  onLike,
  onComments,
  onShare,
  onProfile,
  onPostMenu,
  isActive = false,
  onVideoEnd,
  onLayout,
}: {
  post: FeedPost;
  theme: FeedTheme;
  userId: string;
  onLike: (post: FeedPost) => void;
  onComments: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onProfile?: (creator: FeedCreator) => void;
  onPostMenu: (post: FeedPost) => void;
  isActive?: boolean;
  onVideoEnd?: () => boolean;
  onLayout?: (event: any) => void;
}) {
  const initials = post.creator.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const openLink = async () => {
    if (!post.linkUrl) return;

    try {
      await Linking.openURL(post.linkUrl);
    } catch {
      // Link errors will be handled by the feed interaction layer.
}
  };

  const handleLike = async () => {
    const result = await toggleFeedLike(post.id, userId);

    if (result.post) {
      onLike(result.post);
    }
  };

  const attachments =
    post.attachments && post.attachments.length > 0
      ? post.attachments
      : post.attachment
        ? [post.attachment]
        : [];

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.post,
        {
          backgroundColor: theme.card,
          borderColor: theme.line,
        },
      ]}
    >
      <View style={styles.creatorRow}>
        <Pressable
          onPress={() => onProfile?.(post.creator)}
          disabled={!onProfile}
          accessibilityRole={onProfile ? "button" : undefined}
          accessibilityLabel={
            onProfile
              ? `Open ${post.creator.name}'s profile`
              : undefined
    }
          style={styles.creatorProfileButton}
        >
          {post.creator.avatarUri ? (
          <Image
            source={{ uri: post.creator.avatarUri }}
            style={styles.avatar}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.initialAvatar,
              { backgroundColor: theme.brand },
            ]}
          >
            <Text style={styles.initials}>{initials || "N"}</Text>
          </View>
        )}

        <View style={styles.creatorInfo}>
          <Text style={[styles.creatorName, { color: theme.ink }]}>
            {post.creator.name}
          </Text>

          <Text style={[styles.postMeta, { color: theme.muted }]}>
            {post.creator.username
              ? `@${post.creator.username} · `
              : ""}
            {formatDate(post.createdAt)}
            {post.updatedAt ? " · edited" : ""}
          </Text>
        </View>

        </Pressable>

        <Pressable
          onPress={() => onPostMenu(post)}
          accessibilityRole="button"
          accessibilityLabel="Post options"
          hitSlop={10}
          style={styles.moreButton}
        >
          <Text style={[styles.moreText, { color: theme.muted }]}>
            •••
          </Text>
        </Pressable>
      </View>

      {!!post.text && (
        <Text style={[styles.postText, { color: theme.ink }]}>
          {post.text}
        </Text>
      )}

      {post.type === "link" && post.linkUrl && (
        <Pressable
          onPress={openLink}
          style={[
            styles.linkCard,
            {
              backgroundColor: theme.bg,
              borderColor: theme.line,
            },
          ]}
        >
          <Text style={[styles.linkLabel, { color: theme.brand }]}>
            LINK
          </Text>

          <Text
            style={[styles.linkText, { color: theme.ink }]}
            numberOfLines={3}
          >
            {post.linkUrl}
          </Text>
        </Pressable>
      )}

      {attachments.length > 1 ? (
        <View style={styles.mediaWrapper}>
          <FeedMediaCarousel
            attachments={attachments}
            theme={theme}
            isActive={isActive}
            onVideoEnd={onVideoEnd}
            onDoubleTapLike={
              post.likedBy?.includes(userId)
                ? undefined
                : handleLike
            }
          />
        </View>
      ) : attachments.length === 1 ? (
        <View style={styles.mediaWrapper}>
          <FeedMedia
            attachment={attachments[0]}
            theme={theme}
            isActive={isActive}
            onVideoEnd={onVideoEnd}
            onDoubleTapLike={
              post.likedBy?.includes(userId)
                ? undefined
                : handleLike
            }
          />
        </View>
      ) : null}

      {!!post.music && (
        <View style={styles.musicWrapper}>
          <Text style={[styles.musicLabel, { color: theme.muted }]}>
            🎵 Attached music
          </Text>

          <FeedAudio attachment={post.music} theme={theme} />
        </View>
      )}

      <View style={[styles.actionBar, { borderTopColor: theme.line }]}>
        <Pressable
          onPress={handleLike}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={
            post.likedBy?.includes(userId)
              ? "Unlike post"
              : "Like post"
          }
        >
          <Text
            style={[
              styles.actionText,
              {
                color: post.likedBy?.includes(userId)
                  ? theme.brand
                  : theme.muted,
              },
            ]}
          >
            {post.likedBy?.includes(userId) ? "♥" : "♡"} Like{" "}
            {post.likedBy?.length ? post.likedBy.length : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onComments(post)}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
        >
          <Text style={[styles.actionText, { color: theme.muted }]}>
            ◯ Comment {post.commentCount ? post.commentCount : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onShare(post)}
          style={styles.actionButton}
        >
          <Text style={[styles.actionText, { color: theme.muted }]}>
            ↗ Share {post.shareCount ? post.shareCount : ""}
          </Text>
        </Pressable>
      </View>
    </View>
  );
          }

export function FeedScreen({
  theme,
  identity,
  onOpenProfile,
}: FeedScreenProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activeCommentPost, setActiveCommentPost] =
    useState<FeedPost | null>(null);
  const [profileCreator, setProfileCreator] = useState<FeedCreator | null>(null);
  const [postMenuPost, setPostMenuPost] = useState<FeedPost | null>(null);
  const [audiencePost, setAudiencePost] = useState<FeedPost | null>(null);

  const feedScrollRef = useRef<ScrollView>(null);
  const feedScrollYRef = useRef(0);
  const feedViewportHeightRef = useRef(0);
  const postLayoutsRef = useRef<
    Record<string, { y: number; height: number }>
  >({});
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(
    null,
  );
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<FeedComment | null>(null);
  const [reactionCommentId, setReactionCommentId] = useState<string | null>(null);
  const [commentUserReactions, setCommentUserReactions] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [attachment, setAttachment] = useState<FeedAttachment | undefined>();
  const [overlayText, setOverlayText] = useState("");
  const [overlayX, setOverlayX] = useState(0.5);
  const [overlayY, setOverlayY] = useState(0.5);
  const [overlayEditorOpen, setOverlayEditorOpen] = useState(false);

  const overlayDragStart = useRef({ x: 0.5, y: 0.5 });

  const overlayPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        overlayDragStart.current = {
          x: overlayX,
          y: overlayY,
        };
      },

      onPanResponderMove: (_, gestureState) => {
        const nextX = Math.max(
          0.08,
          Math.min(
            0.92,
            overlayDragStart.current.x + gestureState.dx / 300,
          ),
        );

        const nextY = Math.max(
          0.08,
          Math.min(
            0.92,
            overlayDragStart.current.y + gestureState.dy / 240,
          ),
        );

        setOverlayX(nextX);
        setOverlayY(nextY);
      },

      onPanResponderRelease: () => {
        setAttachment((current) =>
          current
            ? {
                ...current,
                overlayText,
                overlayX,
                overlayY,
              }
            : current,
        );
      },
    }),
  ).current;

  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);

  const creator = useMemo(
    () => getCreator(identity),
    [identity],
  );
  const handleOpenProfile = useCallback(
    (selectedCreator: FeedCreator) => {
      if (onOpenProfile) {
        onOpenProfile(selectedCreator);
        return;
}

      setProfileCreator(selectedCreator);
    },
    [onOpenProfile],
  );


  const handlePostLike = useCallback((updatedPost: FeedPost) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === updatedPost.id ? updatedPost : post,
      ),
    );
  }, []);

  const openPostMenu = useCallback((post: FeedPost) => {
    setPostMenuPost(post);
  }, []);

  const closePostMenu = useCallback(() => {
    setPostMenuPost(null);
  }, []);

  const openAudienceSelector = useCallback(() => {
    if (!postMenuPost) return;

    setAudiencePost(postMenuPost);
    setPostMenuPost(null);
  }, [postMenuPost]);

  const updatePostInFeed = useCallback((updatedPost: FeedPost | null) => {
    if (!updatedPost) return;

    setPosts((current) =>
      current
        .map((post) =>
          post.id === updatedPost.id ? updatedPost : post,
        )
        .filter((post) => !post.archived),
    );

    setPostMenuPost(null);
  }, []);

  const handleSetPostAudience = useCallback(
    async (audience: FeedPostAudience) => {
      if (!audiencePost) return;

      const updatedPost = await setFeedPostAudience(
        audiencePost.id,
        audience,
      );

      updatePostInFeed(updatedPost);
      setAudiencePost(null);
    },
    [audiencePost, updatePostInFeed],
  );

  const handleTogglePostPinned = useCallback(async () => {
    if (!postMenuPost) return;

    const updatedPost = await toggleFeedPostPinned(postMenuPost.id);
    updatePostInFeed(updatedPost);
  }, [postMenuPost, updatePostInFeed]);

  const handleTogglePostNotifications = useCallback(async () => {
    if (!postMenuPost) return;

    const updatedPost = await toggleFeedPostNotifications(postMenuPost.id);
    updatePostInFeed(updatedPost);
  }, [postMenuPost, updatePostInFeed]);

  const handleArchivePost = useCallback(async () => {
    if (!postMenuPost) return;

    const updatedPost = await archiveFeedPost(postMenuPost.id);
    updatePostInFeed(updatedPost);
  }, [postMenuPost, updatePostInFeed]);

  const handleDeletePost = useCallback(() => {
    if (!postMenuPost) return;

    const postToDelete = postMenuPost;

    Alert.alert(
      "Delete post?",
      "This permanently removes the post and its comments.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteFeedPost(postToDelete.id);

            setPosts((current) =>
              current.filter((post) => post.id !== postToDelete.id),
            );

            setPostMenuPost(null);
          },
        },
      ],
    );
  }, [postMenuPost]);

  const openShareMenu = useCallback((post: FeedPost) => {
    setSharePost(post);
    setShareMenuVisible(true);
  }, []);

  const closeShareMenu = useCallback(() => {
    setShareMenuVisible(false);
    setSharePost(null);
  }, []);

  const getPostLink = useCallback((post: FeedPost) => {
    return `nexchat://feed/${encodeURIComponent(post.id)}`;
  }, []);

  const handleCopyPostLink = useCallback(async (post: FeedPost) => {
    try {
      const postLink = getPostLink(post);
      await Clipboard.setStringAsync(postLink);
      closeShareMenu();
      Alert.alert("Link copied", "The NexChat post link is ready to share.");
    } catch {
      Alert.alert("Copy failed", "NexChat could not copy the post link.");
    }
  }, [closeShareMenu, getPostLink]);

  const handlePostShare = useCallback(async (post: FeedPost) => {
    setPublishing(true);
    try {
      const message = [
        post.text.trim(),
        post.linkUrl?.trim(),
        post.attachment?.name
          ? `Attachment: ${post.attachment.name}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");

      await Share.share({
        message: message || "Shared from NexChat",
      });

      const updatedPost = await incrementFeedShare(post.id);

      if (!updatedPost) return;

      setPosts((current) =>
        current.map((item) =>
          item.id === updatedPost.id ? updatedPost : item,
        ),
      );
    } catch {
      // User cancelled the native share sheet or sharing failed.
    } finally {
      setPublishing(false);
    }
  }, []);

  const handlePostDownload = useCallback(async (post: FeedPost) => {
    const attachment =
      post.attachment ??
      post.attachments?.[0] ??
      post.music;

    setPublishing(true);

    try {
      /*
       * Text-only posts are exported as a real .txt file.
       */
      if (!attachment) {
        const cleanText = post.text.trim();

        if (!cleanText) {
          Alert.alert(
            "Nothing to download",
            "This post does not contain downloadable content.",
          );
          return;
        }

        const fileName =
          `nexchat-post-${post.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;

        const destination =
          `${FileSystem.cacheDirectory}${fileName}`;

        const textContent = [
          "NexChat Feed Post",
          "",
          `Author: ${post.creator.name}`,
          post.creator.username
            ? `Username: @${post.creator.username}`
            : undefined,
          `Created: ${post.createdAt}`,
          "",
          cleanText,
          post.linkUrl?.trim()
            ? `\nLink: ${post.linkUrl.trim()}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n");

        await FileSystem.writeAsStringAsync(
          destination,
          textContent,
        );

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(destination, {
            mimeType: "text/plain",
            dialogTitle: "Save NexChat post",
            UTI: "public.plain-text",
          });
        } else {
          Alert.alert(
            "Text file created",
            `The post was exported as ${fileName}.`,
          );
        }

        return;
      }

      const kind =
        attachment.kind ??
        (attachment.mimeType?.startsWith("image/")
          ? "image"
          : attachment.mimeType?.startsWith("video/")
            ? "video"
            : attachment.mimeType?.startsWith("audio/")
              ? "audio"
              : "file");

      if (!attachment.uri) {
        Alert.alert(
          "Download failed",
          "This attachment does not have a valid local file.",
        );
        return;
      }

      /*
       * Photos and videos belong in the device media library.
       */
      if (kind === "image" || kind === "video") {
        const permission =
          await MediaLibrary.requestPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            "Permission required",
            "NexChat needs permission to save this media to your device.",
          );
          return;
        }

        await MediaLibrary.saveToLibraryAsync(
          attachment.uri,
        );

        Alert.alert(
          "Downloaded",
          `${attachment.name || (kind === "video" ? "Video" : "Image")} was saved to your device.`,
        );

        return;
      }

      /*
       * Documents and audio files are exported through the
       * native Android/iOS share/save sheet.
       */
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(attachment.uri, {
          mimeType:
            attachment.mimeType ||
            (kind === "audio"
              ? "audio/*"
              : "application/octet-stream"),
          dialogTitle: `Save ${attachment.name || "NexChat file"}`,
        });

        return;
      }

      Alert.alert(
        "Download unavailable",
        "NexChat could not open the device save/share system for this file.",
      );
    } catch (error) {
      console.error(
        "[NEXCHAT FEED] DOWNLOAD ERROR",
        error,
      );

      Alert.alert(
        "Download failed",
        error instanceof Error
          ? error.message
          : "NexChat could not save this post.",
      );
    } finally {
      setPublishing(false);
    }
  }, []);

  const openComments = useCallback(async (post: FeedPost) => {
    setActiveCommentPost(post);
    setCommentText("");
    setReplyingTo(null);
    setReactionCommentId(null);
    setCommentUserReactions({});
    setCommentsLoading(true);

    try {
      const loadedComments = await getFeedComments(post.id);
      setComments(loadedComments);

      const reactions: Record<string, string> = {};

      for (const comment of loadedComments) {
        const reaction = await getFeedCommentReaction(
          comment.id,
          creator.id,
        );

        if (reaction) {
          reactions[comment.id] = reaction;
        }
      }

      setCommentUserReactions(reactions);
    } finally {
      setCommentsLoading(false);
    }
  }, [creator.id]);

  const handleCommentLike = useCallback(
    async (commentId: string) => {
      const updated = await toggleFeedCommentLike(
        commentId,
        creator.id,
      );

      if (!updated) return;

      setComments((current) =>
        current.map((comment) =>
          comment.id === updated.id ? updated : comment,
        ),
      );
    },
    [creator.id],
  );

  const handleCommentReaction = useCallback(
    async (commentId: string, emoji: string) => {
      const updated = await toggleFeedCommentReaction(
        commentId,
        creator.id,
        emoji,
      );

      if (!updated) return;

      setComments((current) =>
        current.map((comment) =>
          comment.id === updated.id ? updated : comment,
        ),
      );

      setCommentUserReactions((current) => {
        const next = { ...current };

        if (next[commentId] === emoji) {
          delete next[commentId];
        } else {
          next[commentId] = emoji;
        }

        return next;
      });

      setReactionCommentId(null);
    },
    [creator.id],
  );

  const handleCopyComment = useCallback(async (comment: FeedComment) => {
    try {
      await Clipboard.setStringAsync(comment.text);
      Alert.alert("Copied", "Comment copied to your clipboard.");
    } catch {
      Alert.alert("Copy failed", "NexChat could not copy this comment.");
    }
  }, []);

  const submitComment = useCallback(async () => {
    if (!activeCommentPost || !commentText.trim() || commentSubmitting) {
      return;
    }

    setCommentSubmitting(true);
    setPublishing(true);

    try {
      const comment = await addFeedComment({
        postId: activeCommentPost.id,
        author: creator,
        text: commentText,
        parentId: replyingTo?.id,
      });

      if (!comment) return;

      setComments((current) => [...current, comment]);
      setCommentText("");
      setReplyingTo(null);
      setReactionCommentId(null);

      setPosts((current) =>
        current.map((post) =>
          post.id === activeCommentPost.id
            ? {
                ...post,
                commentCount: (post.commentCount ?? 0) + 1,
              }
            : post,
        ),
      );

      setActiveCommentPost((current) =>
        current
          ? {
              ...current,
              commentCount: (current.commentCount ?? 0) + 1,
            }
          : current,
      );
    } finally {
      setCommentSubmitting(false);
      setPublishing(false);
    }
  }, [
    activeCommentPost,
    commentText,
    commentSubmitting,
    creator,
    replyingTo,
  ]);

  const refresh = useCallback(async () => {
    console.log("[NEXCHAT FEED] refresh START");
    setLoading(true);

    try {
      console.log("[NEXCHAT FEED] calling loadFeedPosts");
      const loadedPosts = await loadFeedPosts();
      console.log(
        "[NEXCHAT FEED] loadFeedPosts DONE",
        loadedPosts.length,
      );
      setPosts(loadedPosts.filter((post) => !post.archived));
    } catch (error) {
      console.log("[NEXCHAT FEED] refresh ERROR", error);
    } finally {
      console.log("[NEXCHAT FEED] refresh FINALLY - setting loading FALSE");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    console.log("[NEXCHAT FEED] loading STATE =", loading);
  }, [loading]);

  const resetComposer = () => {
    setText("");
    setLinkUrl("");
    setAttachment(undefined);
    setOverlayText("");
    setOverlayX(0.5);
    setOverlayY(0.5);
    setOverlayEditorOpen(false);
    setEditingPost(null);
  };

  const closeComposer = () => {
    if (publishing) return;

    resetComposer();
    setComposerOpen(false);
  };

  const pickMedia = async (mediaType: "image" | "video") => {
    setPublishing(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "NexChat needs photo and video access to select media.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          mediaType === "image"
            ? ["images"]
            : ["videos"],
        allowsMultipleSelection: false,
        quality: 1,
      });

      console.log(
        `[NEXCHAT FEED] ${mediaType.toUpperCase()} PICKER RESULT`,
        result,
      );

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];

      console.log("[NEXCHAT FEED] PICKED MEDIA", {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        type: asset.type,
      });

      setAttachment({
        uri: asset.uri,
        name: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        size: asset.fileSize ?? undefined,
        kind: mediaType,
        durationMs:
          asset.duration != null
            ? Math.round(asset.duration * 1000)
            : undefined,
        overlayText: "",
        overlayX: 0.5,
        overlayY: 0.5,
      });

      setOverlayText("");
      setOverlayX(0.5);
      setOverlayY(0.5);
    } catch (error) {
      console.log(
        `[NEXCHAT FEED] ${mediaType.toUpperCase()} PICKER ERROR`,
        error,
      );
      Alert.alert(
        "Media picker error",
        `NexChat could not open the ${mediaType === "image" ? "photo" : "video"} picker.`,
      );
    } finally {
      setPublishing(false);
    }
  };

  const beginEditPost = useCallback((post: FeedPost) => {
    setPostMenuPost(null);
    setEditingPost(post);
    setText(post.text ?? "");
    setLinkUrl(post.linkUrl ?? "");

    const primaryAttachment =
      post.attachment ??
      post.attachments?.[0];

    setAttachment(primaryAttachment);

    setOverlayText(primaryAttachment?.overlayText ?? "");
    setOverlayX(primaryAttachment?.overlayX ?? 0.5);
    setOverlayY(primaryAttachment?.overlayY ?? 0.5);
    setOverlayEditorOpen(false);
    setComposerOpen(true);
  }, []);

  const saveEditedPost = async (type: FeedPostType) => {
    if (!editingPost) return;

    const cleanText = text.trim();

    if (!cleanText && !attachment && !linkUrl.trim()) {
      return;
    }

    const editedAttachment = attachment
      ? {
          ...attachment,
          overlayText: overlayText.trim() || undefined,
          overlayX,
          overlayY,
        }
      : undefined;

    setPublishing(true);

    try {
      const updatedPost = await updateFeedPost(
        editingPost.id,
        {
          type,
          text: cleanText,
          linkUrl: linkUrl.trim(),
          attachment: editedAttachment,
          attachments: editedAttachment
            ? [editedAttachment]
            : [],
        },
      );

      if (updatedPost) {
        setPosts((current) =>
          current.map((post) =>
            post.id === updatedPost.id
              ? updatedPost
              : post,
          ),
        );
      }

      resetComposer();
      setComposerOpen(false);
    } finally {
      setPublishing(false);
    }
  };

  const publish = async (type: FeedPostType) => {
    const cleanText = text.trim();

    if (!cleanText && !attachment) {
      return;
    }

    const publishAttachment = attachment
      ? {
          ...attachment,
          overlayText: overlayText.trim() || undefined,
          overlayX,
          overlayY,
        }
      : undefined;

    setPublishing(true);
    try {
      await createFeedPost({
        type,
        creator,
        text: cleanText,
        attachment: publishAttachment,
      });

      await refresh();
      resetComposer();
      setComposerOpen(false);
    } finally {
      setPublishing(false);
    }
  };

  const postHasVideo = useCallback((post: FeedPost) => {
    const attachments =
      post.attachments?.length
        ? post.attachments
        : post.attachment
          ? [post.attachment]
          : [];

    return attachments.some(
      (item) =>
        item.kind === "video" ||
        item.mimeType?.startsWith("video/"),
    );
  }, []);

  const updateActiveVideo = useCallback(() => {
    const scrollY = feedScrollYRef.current;
    const viewportHeight = feedViewportHeightRef.current;

    if (!viewportHeight || !posts.length) return;

    const visibilityByPost: Record<string, number> = {};

    let bestId: string | null = null;
    let bestVisibility = 0;

    for (const post of posts) {
      if (!postHasVideo(post)) continue;

      const layout = postLayoutsRef.current[post.id];

      if (!layout || layout.height <= 0) continue;

      const top = layout.y - scrollY;
      const bottom = top + layout.height;

      const visibleHeight = Math.max(
        0,
        Math.min(bottom, viewportHeight) -
          Math.max(top, 0),
      );

      const visibility = visibleHeight / layout.height;

      visibilityByPost[post.id] = visibility;

      if (visibility > bestVisibility) {
        bestVisibility = visibility;
        bestId = post.id;
      }
    }

    setActiveVideoPostId((current) => {
      if (!current) {
        return bestVisibility >= 0.5 ? bestId : null;
      }

      const currentVisibility =
        visibilityByPost[current] ?? 0;

      /*
       * Keep the current video active while it is still
       * reasonably visible. This prevents rapid switching
       * when the ScrollView/layout is settling.
       */
      if (currentVisibility >= 0.35) {
        return current;
      }

      return bestVisibility >= 0.5 ? bestId : null;
    });
  }, [posts, postHasVideo]);

  const handleFeedScroll = useCallback(
    (event: any) => {
      feedScrollYRef.current =
        event.nativeEvent.contentOffset.y;

      updateActiveVideo();
    },
    [updateActiveVideo],
  );

  const handleFeedViewportLayout = useCallback(
    (event: any) => {
      feedViewportHeightRef.current =
        event.nativeEvent.layout.height;

      updateActiveVideo();
    },
    [updateActiveVideo],
  );

  const handlePostLayout = useCallback(
    (postId: string) => (event: any) => {
      const { y, height } = event.nativeEvent.layout;

      postLayoutsRef.current[postId] = {
        y,
        height,
      };

      updateActiveVideo();
    },
    [updateActiveVideo],
  );

  const handleVideoEnd = useCallback(
    (postId: string): boolean => {
      const currentIndex = posts.findIndex(
        (post) => post.id === postId,
      );

      if (currentIndex === -1) {
        return false;
      }

      const nextVideoIndex = posts.findIndex(
        (post, index) =>
          index > currentIndex &&
          postHasVideo(post),
      );

      if (nextVideoIndex === -1) {
        return false;
      }

      const nextPost = posts[nextVideoIndex];
      const nextLayout =
        postLayoutsRef.current[nextPost.id];

      if (!nextLayout) {
        return false;
      }

      feedScrollRef.current?.scrollTo({
        y: Math.max(0, nextLayout.y),
        animated: true,
      });

      return true;
    },
    [posts, postHasVideo],
  );

  if (profileCreator) {
    return (
      <FeedProfileScreen
        theme={theme}
        creator={profileCreator}
        posts={posts}
        currentUserId={creator.id}
        onBack={() => setProfileCreator(null)}
        renderPostMedia={(post) => {
          const attachments =
            post.attachments && post.attachments.length > 0
              ? post.attachments
              : post.attachment
                ? [post.attachment]
                : [];

          if (attachments.length === 0) {
            return null;
          }

          return (
            <View style={styles.profilePostMedia}>
              {attachments.length > 1 ? (
                <FeedMediaCarousel
                  attachments={attachments}
                  theme={theme}
                />
              ) : (
                <FeedMedia
                  attachment={attachments[0]}
                  theme={theme}
                />
              )}
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.line,
          },
        ]}
      >
        <View>
          <Text style={[styles.title, { color: theme.ink }]}>Feed</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Your social space
          </Text>
        </View>

      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.stateText, { color: theme.muted }]}>
            Loading feed…
          </Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyIcon, { color: theme.brand }]}>▦</Text>

          <Text style={[styles.emptyTitle, { color: theme.ink }]}>
            Your feed is empty
          </Text>

          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Start the conversation. Share a thought, photo, video, or link.
          </Text>

          <Pressable
            onPress={() => {
              resetComposer();
              setComposerOpen(true);
            }}
            style={[styles.emptyButton, { backgroundColor: theme.brand }]}

          >
            <Text style={styles.emptyButtonText}>Create your first post</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={feedScrollRef}
          contentContainerStyle={styles.feed}
          onLayout={handleFeedViewportLayout}
          onScroll={handleFeedScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              theme={theme}
              userId={creator.id}
              onLike={handlePostLike}
              onComments={openComments}
              onShare={openShareMenu}
              onProfile={handleOpenProfile}
              onPostMenu={openPostMenu}
              isActive={activeVideoPostId === post.id}
              onVideoEnd={() => handleVideoEnd(post.id)}
              onLayout={handlePostLayout(post.id)}
            />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={!!postMenuPost}
        animationType="fade"
        transparent
        onRequestClose={closePostMenu}
      >
        <Pressable
          style={styles.postMenuBackdrop}
          onPress={closePostMenu}
        >
          <Pressable
            style={[
              styles.postMenuCard,
              { backgroundColor: theme.card },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.postMenuHandle} />

            <Text
              style={[
                styles.postMenuTitle,
                { color: theme.ink },
              ]}
            >
              {postMenuPost?.creator.id === creator.id
                ? "Manage post"
                : "Post options"}
            </Text>

            {postMenuPost?.creator.id === creator.id ? (
              <>
                <Pressable
                  style={styles.postMenuItem}
                  onPress={() => {
                    if (postMenuPost) {
                      beginEditPost(postMenuPost);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Edit post
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={handleTogglePostPinned}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    {postMenuPost?.pinned
                      ? "Unpin post"
                      : "Pin post"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={handleTogglePostNotifications}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    {postMenuPost?.notificationsEnabled
                      ? "Turn off post notifications"
                      : "Turn on post notifications"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={openAudienceSelector}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Audience
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={handleArchivePost}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Archive post
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={handleDeletePost}
                >
                  <Text
                    style={[
                      styles.postMenuItemTextDanger,
                    ]}
                  >
                    Delete post
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={styles.postMenuItem}
                  onPress={() => {
                    closePostMenu();
                    Alert.alert(
                      "Save for later",
                      "Post saving will be connected to your saved posts library.",
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Save for later
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={() => {
                    closePostMenu();
                    Alert.alert(
                      "Not interested",
                      "We'll use this preference to improve your feed.",
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Not interested
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={() => {
                    closePostMenu();
                    Alert.alert(
                      "Mute creator",
                      `Posts from ${postMenuPost?.creator.name ?? "this creator"} can be muted from your feed preferences.`,
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Mute creator
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={handleTogglePostNotifications}
                >
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    {postMenuPost?.notificationsEnabled
                      ? "Turn off post notifications"
                      : "Turn on post notifications"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.postMenuItem}
                  onPress={() => {
                    closePostMenu();
                    Alert.alert(
                      "Report post",
                      "Report handling will be connected to the NexChat moderation system.",
                    );
                  }}
                >
                  <Text
                    style={styles.postMenuItemTextDanger}
                  >
                    Report post
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={styles.postMenuCancel}
              onPress={closePostMenu}
            >
              <Text
                style={[
                  styles.postMenuCancelText,
                  { color: theme.muted },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!audiencePost}
        animationType="slide"
        transparent
        onRequestClose={() => setAudiencePost(null)}
      >
        <Pressable
          style={styles.postMenuBackdrop}
          onPress={() => setAudiencePost(null)}
        >
          <Pressable
            style={[
              styles.postMenuCard,
              { backgroundColor: theme.card },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.postMenuHandle} />

            <Text
              style={[
                styles.postMenuTitle,
                { color: theme.ink },
              ]}
            >
              Post audience
            </Text>

            <Text
              style={[
                styles.audienceSubtitle,
                { color: theme.muted },
              ]}
            >
              Choose who can see this post.
            </Text>

            <Pressable
              style={styles.postMenuItem}
              onPress={() => handleSetPostAudience("everyone")}
            >
              <View style={styles.audienceOptionRow}>
                <View style={styles.audienceOptionText}>
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Everyone
                  </Text>
                  <Text
                    style={[
                      styles.audienceOptionDescription,
                      { color: theme.muted },
                    ]}
                  >
                    Anyone who can access your feed
                  </Text>
                </View>

                {(audiencePost?.audience ?? "everyone") === "everyone" ? (
                  <Text style={[styles.audienceCheck, { color: theme.brand }]}>
                    ✓
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              style={styles.postMenuItem}
              onPress={() => handleSetPostAudience("my_university")}
            >
              <View style={styles.audienceOptionRow}>
                <View style={styles.audienceOptionText}>
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    My university
                  </Text>
                  <Text
                    style={[
                      styles.audienceOptionDescription,
                      { color: theme.muted },
                    ]}
                  >
                    People from your university
                  </Text>
                </View>

                {audiencePost?.audience === "my_university" ? (
                  <Text style={[styles.audienceCheck, { color: theme.brand }]}>
                    ✓
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              style={styles.postMenuItem}
              onPress={() => handleSetPostAudience("connections")}
            >
              <View style={styles.audienceOptionRow}>
                <View style={styles.audienceOptionText}>
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Connections
                  </Text>
                  <Text
                    style={[
                      styles.audienceOptionDescription,
                      { color: theme.muted },
                    ]}
                  >
                    People you are connected with
                  </Text>
                </View>

                {audiencePost?.audience === "connections" ? (
                  <Text style={[styles.audienceCheck, { color: theme.brand }]}>
                    ✓
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              style={styles.postMenuItem}
              onPress={() => handleSetPostAudience("only_me")}
            >
              <View style={styles.audienceOptionRow}>
                <View style={styles.audienceOptionText}>
                  <Text
                    style={[
                      styles.postMenuItemText,
                      { color: theme.ink },
                    ]}
                  >
                    Only me
                  </Text>
                  <Text
                    style={[
                      styles.audienceOptionDescription,
                      { color: theme.muted },
                    ]}
                  >
                    Only you can see this post
                  </Text>
                </View>

                {audiencePost?.audience === "only_me" ? (
                  <Text style={[styles.audienceCheck, { color: theme.brand }]}>
                    ✓
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              style={styles.postMenuCancel}
              onPress={() => setAudiencePost(null)}
            >
              <Text
                style={[
                  styles.postMenuCancelText,
                  { color: theme.muted },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!activeCommentPost}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveCommentPost(null)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
            style={styles.commentsKeyboard}
          >
            <View
              style={[
                styles.commentsSheet,
                { backgroundColor: theme.card },
              ]}
            >
            <View style={styles.commentsHandle} />

            <View style={styles.commentsHeader}>
              <View style={styles.commentsHeaderText}>
                <Text style={[styles.commentsTitle, { color: theme.ink }]}>
                  Comments
                </Text>
                <Text style={[styles.commentsSubtitle, { color: theme.muted }]}>
                  {(activeCommentPost?.commentCount ?? comments.length) === 1
                    ? "1 comment"
                    : `${activeCommentPost?.commentCount ?? comments.length} comments`}
                </Text>
              </View>

              <Pressable
                onPress={() => setActiveCommentPost(null)}
                style={({ pressed }) => [
                  styles.commentsCloseButton,
                  {
                    backgroundColor: pressed ? theme.bg : "transparent",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close comments"
              >
                <Text style={[styles.commentsCloseText, { color: theme.ink }]}>
                  ×
                </Text>
              </Pressable>
            </View>

            {replyingTo ? (
              <View
                style={[
                  styles.replyIndicator,
                  {
                    backgroundColor: theme.bg,
                    borderTopColor: theme.line,
                  },
                ]}
              >
                <View style={styles.replyIndicatorText}>
                  <Text
                    style={[
                      styles.replyIndicatorTitle,
                      { color: theme.ink },
                    ]}
                  >
                    Replying to{" "}
                    {replyingTo.author.username
                      ? `@${replyingTo.author.username}`
                      : replyingTo.author.name}
                  </Text>
                  <Text
                    style={[
                      styles.replyIndicatorBody,
                      { color: theme.muted },
                    ]}
                    numberOfLines={1}
                  >
                    {replyingTo.text}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setReplyingTo(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.55 : 1,
                  })}
                >
                  <Text
                    style={[
                      styles.replyIndicatorClose,
                      { color: theme.ink },
                    ]}
                  >
                    ×
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View
              style={[
                styles.commentComposer,
                { borderTopColor: theme.line },
              ]}
            >
              <View
                style={[
                  styles.commentInputWrap,
                  {
                    backgroundColor: theme.bg,
                    borderColor: theme.line,
                  },
                ]}
              >
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Write a comment..."
                  placeholderTextColor={theme.muted}
                  editable={!commentSubmitting}
                  multiline
                  maxLength={1000}
                  style={[
                    styles.commentInput,
                    { color: theme.ink },
                  ]}
                />
              </View>

              <Pressable
                onPress={submitComment}
                disabled={commentSubmitting || !commentText.trim()}
                style={({ pressed }) => [
                  styles.commentSendButton,
                  {
                    backgroundColor:
                      commentSubmitting || !commentText.trim()
                        ? theme.line
                        : theme.brand,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send comment"
              >
                {commentSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.commentSendText}>↑</Text>
                )}
              </Pressable>
            </View>

            {commentsLoading ? (
              <View style={styles.commentsLoading}>
                <ActivityIndicator color={theme.brand} />
              </View>
            ) : (
              <ScrollView
                style={styles.commentsList}
                contentContainerStyle={styles.commentsListContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {comments.length === 0 ? (
                  <View style={styles.emptyComments}>
                    <View
                      style={[
                        styles.emptyCommentsIcon,
                        { backgroundColor: theme.bg },
                      ]}
                    >
                      <Text style={styles.emptyCommentsIconText}>💬</Text>
                    </View>

                    <Text
                      style={[
                        styles.emptyCommentsTitle,
                        { color: theme.ink },
                      ]}
                    >
                      No comments yet
                    </Text>

                    <Text
                      style={[
                        styles.emptyCommentsText,
                        { color: theme.muted },
                      ]}
                    >
                      Start the conversation by leaving the first comment.
                    </Text>
                  </View>
                ) : (
                  comments
                    .filter((comment) => !comment.parentId)
                    .map((comment) => {
                      const renderComment = (
                        currentComment: FeedComment,
                        depth = 0,
                      ): React.ReactNode => {
                        const replies = comments.filter(
                          (child) => child.parentId === currentComment.id,
                        );

                        const likeCount =
                          currentComment.likedBy?.length ?? 0;

                        const reactionEntries = Object.entries(
                          currentComment.reactions ?? {},
                        ).filter(([, count]) => count > 0);

                        const selectedReaction =
                          commentUserReactions[currentComment.id];

                        return (
                          <React.Fragment key={currentComment.id}>
                            <View
                              style={[
                                styles.commentRow,
                                depth > 0 && styles.commentReplyRow,
                              ]}
                            >
                              <Pressable
                                onPress={() =>
                                  handleOpenProfile(currentComment.author)
                                }
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${currentComment.author.name}'s profile`}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.65 : 1,
                                })}
                              >
                                <View
                                  style={[
                                    styles.commentAvatar,
                                    { backgroundColor: theme.brand },
                                  ]}
                                >
                                  <Text style={styles.commentAvatarText}>
                                    {(currentComment.author.name || "?")
                                      .trim()
                                      .charAt(0)
                                      .toUpperCase()}
                                  </Text>
                                </View>
                              </Pressable>

                              <View
                                style={[
                                  styles.commentBubble,
                                  { backgroundColor: theme.bg },
                                ]}
                              >
                                <View style={styles.commentAuthorRow}>
                                  <View style={styles.commentAuthorInfo}>
                                    <Pressable
                                      onPress={() =>
                                        handleOpenProfile(
                                          currentComment.author,
                                        )
                                      }
                                      accessibilityRole="button"
                                      accessibilityLabel={`Open ${currentComment.author.name}'s profile`}
                                    >
                                      <Text
                                        style={[
                                          styles.commentAuthor,
                                          { color: theme.ink },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {currentComment.author.name}
                                      </Text>
                                    </Pressable>

                                    {currentComment.author.username ? (
                                      <Text
                                        style={[
                                          styles.commentUsername,
                                          { color: theme.muted },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        @{currentComment.author.username}
                                      </Text>
                                    ) : null}
                                  </View>

                                  <Text
                                    style={[
                                      styles.commentTimestamp,
                                      { color: theme.muted },
                                    ]}
                                  >
                                    {new Date(
                                      currentComment.createdAt,
                                    ).toLocaleString()}
                                  </Text>
                                </View>

                                <Text
                                  style={[
                                    styles.commentBody,
                                    { color: theme.ink },
                                  ]}
                                >
                                  {currentComment.text}
                                </Text>

                                <View style={styles.commentActions}>
                                  <Pressable
                                    onPress={() =>
                                      void handleCommentLike(
                                        currentComment.id,
                                      )
                                    }
                                    style={({ pressed }) => [
                                      styles.commentAction,
                                      {
                                        opacity: pressed ? 0.55 : 1,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.commentActionText,
                                        {
                                          color:
                                            currentComment.likedBy?.includes(
                                              creator.id,
                                            )
                                              ? theme.brand
                                              : theme.muted,
                                        },
                                      ]}
                                    >
                                      {currentComment.likedBy?.includes(
                                        creator.id,
                                      )
                                        ? "♥"
                                        : "♡"}{" "}
                                      Like
                                      {likeCount ? ` ${likeCount}` : ""}
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    onPress={() =>
                                      setReactionCommentId((current) =>
                                        current === currentComment.id
                                          ? null
                                          : currentComment.id,
                                      )
                                    }
                                    style={({ pressed }) => [
                                      styles.commentAction,
                                      {
                                        opacity: pressed ? 0.55 : 1,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.commentActionText,
                                        { color: theme.muted },
                                      ]}
                                    >
                                      {selectedReaction ?? "☺"} React
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    onPress={() => {
                                      setReactionCommentId(null);
                                      setReplyingTo(currentComment);
                                    }}
                                    hitSlop={8}
                                    style={({ pressed }) => [
                                      styles.commentAction,
                                      {
                                        opacity: pressed ? 0.55 : 1,
                                      },
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Reply to ${currentComment.author.name}`}
                                  >
                                    <Text
                                      style={[
                                        styles.commentActionText,
                                        { color: theme.muted },
                                      ]}
                                    >
                                      ↩ Reply
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    onPress={() =>
                                      void handleCopyComment(currentComment)
                                    }
                                    style={({ pressed }) => [
                                      styles.commentAction,
                                      {
                                        opacity: pressed ? 0.55 : 1,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.commentActionText,
                                        { color: theme.muted },
                                      ]}
                                    >
                                      Copy
                                    </Text>
                                  </Pressable>
                                </View>

                                {reactionCommentId === currentComment.id ? (
                                  <View
                                    style={[
                                      styles.reactionPicker,
                                      {
                                        backgroundColor: theme.card,
                                        borderColor: theme.line,
                                      },
                                    ]}
                                  >
                                    {["❤️", "😂", "😮", "😢", "👍", "🔥"].map(
                                      (emoji) => (
                                        <Pressable
                                          key={emoji}
                                          onPress={() =>
                                            void handleCommentReaction(
                                              currentComment.id,
                                              emoji,
                                            )
                                          }
                                          style={({ pressed }) => [
                                            styles.reactionButton,
                                            {
                                              backgroundColor:
                                                pressed || selectedReaction === emoji
                                                  ? theme.bg
                                                  : "transparent",
                                            },
                                          ]}
                                          accessibilityRole="button"
                                          accessibilityLabel={`React ${emoji}`}
                                        >
                                          <Text
                                            style={styles.reactionEmoji}
                                          >
                                            {emoji}
                                          </Text>
                                        </Pressable>
                                      ),
                                    )}
                                  </View>
                                ) : null}

                                {reactionEntries.length > 0 ? (
                                  <View style={styles.commentReactionCounts}>
                                    {reactionEntries.map(([emoji, count]) => (
                                      <Text
                                        key={emoji}
                                        style={[
                                          styles.commentReactionCount,
                                          {
                                            color: theme.muted,
                                            backgroundColor: theme.card,
                                          },
                                        ]}
                                      >
                                        {emoji} {count}
                                      </Text>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            </View>

                            {replies.length > 0
                              ? replies.map((reply) =>
                                  renderComment(
                                    reply,
                                    Math.min(depth + 1, 3),
                                  ),
                                )
                              : null}
                          </React.Fragment>
                        );
                      };

                      return renderComment(comment);
                    })
                )}
              </ScrollView>
            )}


          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

      <Pressable
        onPress={() => {
          resetComposer();
          setComposerOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Create post"
        style={[
          styles.floatingAddButton,
          { backgroundColor: theme.brand },
        ]}
      >
        <Text style={styles.addButtonText}>+</Text>
      </Pressable>

      <Modal
        visible={composerOpen}
        animationType="slide"
        transparent
        onRequestClose={closeComposer}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
            style={styles.composerKeyboard}
          >
            <View
              style={[
                styles.composer,
                { backgroundColor: theme.card },
              ]}
            >
            <View style={styles.composerHeader}>
              <View>
                <Text style={[styles.composerTitle, { color: theme.ink }]}>
                  {editingPost ? "Edit post" : "Create post"}
                </Text>
                <Text style={[styles.composerSubtitle, { color: theme.muted }]}>
                  {editingPost
                    ? "Update your post"
                    : "Share something with your feed"}
                </Text>
              </View>

              <Pressable onPress={closeComposer} disabled={publishing}>
                <Text style={[styles.closeText, { color: theme.muted }]}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.composerCreator}>
                <View
                  style={[
                    styles.smallAvatar,
                    { backgroundColor: theme.brand },
                  ]}
                >
                  <Text style={styles.initials}>
                    {creator.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </Text>
                </View>

                <View>
                  <Text style={[styles.creatorName, { color: theme.ink }]}>
                    {creator.name}
                  </Text>
                  <Text style={[styles.postMeta, { color: theme.muted }]}>
                    Posting to Feed
                  </Text>
                </View>
              </View>

              <View style={styles.createPostEditor}>
                {attachment ? (
                  <View
                    style={[
                      styles.mediaEditorPreview,
                      { backgroundColor: theme.bg, borderColor: theme.line },
                    ]}
                  >
                    {attachment.kind === "image" ? (
                      <Image
                        source={{ uri: attachment.uri }}
                        style={styles.mediaEditorImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.mediaEditorVideoPlaceholder}>
                        <Text style={styles.mediaEditorVideoIcon}>🎥</Text>
                        <Text
                          style={[
                            styles.mediaEditorVideoText,
                            { color: theme.ink },
                          ]}
                        >
                          Video selected
                        </Text>
                      </View>
                    )}

                    {overlayText.trim() ? (
                      <View
                        {...overlayPanResponder.panHandlers}
                        style={[
                          styles.mediaOverlayPreview,
                          {
                            left: `${overlayX * 100}%`,
                            top: `${overlayY * 100}%`,
                          },
                        ]}
                      >
                        <Text style={styles.mediaOverlayText}>
                          {overlayText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <Text
                  style={[
                    styles.createPostCaption,
                    { color: theme.muted },
                  ]}
                >
                  Caption
                </Text>

                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="What's on your mind?"
                  placeholderTextColor={theme.muted}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.textInput,
                    {
                      color: theme.ink,
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                />
              </View>

              <View style={styles.composerTools}>
                {attachment ? (
                  <Pressable
                    onPress={() => setOverlayEditorOpen(true)}
                    disabled={publishing}
                    style={[
                      styles.toolButton,
                      {
                        borderColor: theme.line,
                        backgroundColor: theme.bg,
                      },
                    ]}
                  >
                    <Text style={[styles.toolText, { color: theme.ink }]}>
                      📝 Add text
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void pickMedia("image")}
                  disabled={publishing}
                  style={[
                    styles.toolButton,
                    {
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  <Text style={[styles.toolText, { color: theme.ink }]}>
                    🖼️ Photo
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void pickMedia("video")}
                  disabled={publishing}
                  style={[
                    styles.toolButton,
                    {
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  <Text style={[styles.toolText, { color: theme.ink }]}>
                    🎥 Video
                  </Text>
                </Pressable>
              </View>

              <View style={styles.publishRow}>
                <Pressable
                  onPress={closeComposer}
                  disabled={publishing}
                  style={[
                    styles.cancelButton,
                    { borderColor: theme.line },
                  ]}
                >
                  <Text style={[styles.cancelText, { color: theme.ink }]}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const attachmentKind = attachment?.kind;

                    const postType: FeedPostType =
                      attachmentKind === "image" ||
                      attachmentKind === "video"
                        ? "media"
                        : "text";

                    if (editingPost) {
                      void saveEditedPost(postType);
                    } else {
                      void publish(postType);
                    }
                  }}
                  disabled={
                    publishing ||
                    (!text.trim() && !attachment)
                  }
                  style={[
                    styles.publishButton,
                    {
                      backgroundColor:
                        publishing ||
                        (!text.trim() && !attachment)
                          ? theme.muted
                          : theme.brand,
                    },
                  ]}
                >
                  {publishing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.publishText}>
                      {editingPost ? "Save changes" : "Post"}
                    </Text>
                  )}
                </Pressable>
              </View>

              {overlayEditorOpen ? (
                <View style={styles.overlayEditorBackdrop}>
                  <View
                    style={[
                      styles.overlayEditorCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.line,
                      },
                    ]}
                  >
                    <View style={styles.overlayEditorHeader}>
                      <Text
                        style={[
                          styles.overlayEditorTitle,
                          { color: theme.ink },
                        ]}
                      >
                        Add text
                      </Text>

                      <Pressable
                        onPress={() => setOverlayEditorOpen(false)}
                      >
                        <Text
                          style={[
                            styles.closeText,
                            { color: theme.ink },
                          ]}
                        >
                          ×
                        </Text>
                      </Pressable>
                    </View>

                    <TextInput
                      value={overlayText}
                      onChangeText={setOverlayText}
                      placeholder="Type text to place on your media"
                      placeholderTextColor={theme.muted}
                      multiline
                      autoFocus
                      style={[
                        styles.overlayEditorInput,
                        {
                          color: theme.ink,
                          borderColor: theme.line,
                          backgroundColor: theme.bg,
                        },
                      ]}
                    />

                    <View style={styles.overlayEditorActions}>
                      <Pressable
                        onPress={() => {
                          setOverlayText("");
                          setOverlayEditorOpen(false);
                        }}
                        style={[
                          styles.cancelButton,
                          { borderColor: theme.line },
                        ]}
                      >
                        <Text
                          style={[
                            styles.cancelText,
                            { color: theme.ink },
                          ]}
                        >
                          Cancel
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setAttachment((current) =>
                            current
                              ? {
                                  ...current,
                                  overlayText: overlayText.trim(),
                                  overlayX,
                                  overlayY,
                                }
                              : current,
                          );
                          setOverlayText(overlayText.trim());
                          setOverlayEditorOpen(false);
                        }}
                        style={[
                          styles.publishButton,
                          { backgroundColor: theme.brand },
                        ]}
                      >
                        <Text style={styles.publishText}>Done</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={shareMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={closeShareMenu}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.shareMenu,
              {
                backgroundColor: theme.card,
                borderColor: theme.line,
              },
            ]}
          >
            <View style={styles.shareMenuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareMenuTitle, { color: theme.ink }]}>
                  Share post
                </Text>

                <Text style={[styles.shareMenuSubtitle, { color: theme.muted }]}>
                  Choose how you want to share this post.
                </Text>
              </View>

              <Pressable onPress={closeShareMenu}>
                <Text style={[styles.closeText, { color: theme.ink }]}>
                  ×
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {
                if (sharePost) {
                  void handleCopyPostLink(sharePost);
                }
              }}
            >
              <Text style={styles.shareOptionIcon}>🔗</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Copy link
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Copy this post's NexChat link
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {
                if (sharePost) {
                  closeShareMenu();
                  void handlePostDownload(sharePost);
                  }
              }}
            >
              <Text style={styles.shareOptionIcon}>↓</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Download
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Save the post media to your device
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {}}
            >
              <Text style={styles.shareOptionIcon}>💬</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Share to Chat
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Send it to a one-to-one conversation
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {}}
            >
              <Text style={styles.shareOptionIcon}>👥</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Share to Group
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Send it to one of your groups
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {}}
            >
              <Text style={styles.shareOptionIcon}>◉</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Share to Status
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Post it to your 24-hour status
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {}}
            >
              <Text style={styles.shareOptionIcon}>↻</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Reshare
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Repost this content like a reshared post
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.shareOption, { borderColor: theme.line }]}
              onPress={() => {}}
            >
              <Text style={styles.shareOptionIcon}>✎</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  Share to My Feed
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Publish this content to your own feed
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.shareOption,
                styles.shareNativeOption,
                { borderColor: theme.line },
              ]}
              onPress={() => {
                if (sharePost) {
                  closeShareMenu();
                  void handlePostShare(sharePost);
                }
              }}
            >
              <Text style={styles.shareOptionIcon}>↗</Text>
              <View style={styles.shareOptionText}>
                <Text style={[styles.shareOptionTitle, { color: theme.ink }]}>
                  More…
                </Text>
                <Text style={[styles.shareOptionSubtitle, { color: theme.muted }]}>
                  Use Android's sharing options
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
                }

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
  },

  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },

  floatingAddButton: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },

  addButtonText: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "400",
  },

  feed: {
    padding: 12,
    paddingBottom: 110,
    gap: 12,
  },

  post: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
  },

  creatorRow: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  creatorProfileButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  initialAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },

  initials: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  creatorInfo: {
    flex: 1,
    marginLeft: 11,
  },

  creatorName: {
    fontSize: 15,
    fontWeight: "800",
  },

  postMeta: {
    fontSize: 12,
    marginTop: 3,
  },

  postMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
    padding: 14,
  },

  postMenuCard: {
    borderRadius: 20,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: "hidden",
  },

  postMenuHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128, 128, 128, 0.45)",
    marginBottom: 8,
  },

  postMenuTitle: {
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  audienceSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },

  audienceOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
  },

  audienceOptionText: {
    flex: 1,
    paddingRight: 12,
  },

  audienceOptionDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },

  audienceCheck: {
    fontSize: 20,
    fontWeight: "800",
  },

  postMenuItem: {
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  postMenuItemText: {
    fontSize: 15,
    fontWeight: "600",
  },

  postMenuItemTextDanger: {
    color: "#D92D20",
    fontSize: 15,
    fontWeight: "700",
  },

  postMenuCancel: {
    marginTop: 6,
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128, 128, 128, 0.25)",
  },

  postMenuCancelText: {
    fontSize: 15,
    fontWeight: "700",
  },

  moreButton: {
    paddingLeft: 10,
  },

  moreText: {
    fontSize: 16,
    letterSpacing: 2,
  },

  postText: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 16,
    lineHeight: 24,
  },

  linkCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },

  linkLabel: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 6,
  },

  linkText: {
    fontSize: 14,
    lineHeight: 20,
  },

  attachmentCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },

  attachmentIcon: {
    fontSize: 27,
    marginRight: 12,
  },

  attachmentInfo: {
    flex: 1,
  },

  attachmentName: {
    fontSize: 14,
    fontWeight: "800",
  },

  attachmentType: {
    fontSize: 12,
    marginTop: 3,
  },

  feedImage: {
    width: "100%",
    height: 260,
    borderRadius: 12,
  },

  videoContainer: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },

  feedVideo: {
    width: "100%",
    height: 260,
  },

  feedVideoStage: {
    width: "100%",
    height: 260,
    position: "relative",
    overflow: "hidden",
  },

  feedVideoPausedOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
  },

  feedVideoPlayOverlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  feedVideoPlayOverlayText: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginLeft: 3,
  },

  mediaCaption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },

  audioCard: {
    width: "100%",
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  audioPlayButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },

  audioPlayText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },

  audioInfo: {
    flex: 1,
    marginLeft: 12,
  },

  mediaWrapper: {
    marginTop: 12,
  },

  profilePostMedia: {
    marginTop: 12,
  },

  carouselPage: {
    width: "100%",
  },

  carouselIndicator: {
    position: "absolute",
    right: 10,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },

  carouselIndicatorText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  musicWrapper: {
    marginTop: 12,
  },

  musicLabel: {
    fontSize: 12,
    marginBottom: 6,
  },

  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
  },

  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },

  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  stateText: {
    marginTop: 10,
    fontSize: 13,
  },

  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
  },

  emptyText: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontSize: 14,
  },

  emptyButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },

  emptyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },

  commentsKeyboard: {
    width: "100%",
    flex: 1,
    justifyContent: "flex-end",
  },

  commentsSheet: {
    width: "100%",
    height: "82%",
    maxHeight: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    overflow: "hidden",
  },

  commentsHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.45)",
    marginTop: 2,
    marginBottom: 4,
  },

  commentsHeader: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  commentsTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  commentsHeaderText: {
    flex: 1,
  },


  commentsSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },

  commentsCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  commentsCloseText: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "300",
  },

  commentsLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  commentsList: {
    flex: 1,
  },

  commentsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  emptyComments: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  emptyCommentsIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyCommentsIconText: {
    fontSize: 23,
  },


  emptyCommentsTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },

  emptyCommentsText: {
    fontSize: 13,
    textAlign: "center",
  },

  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  commentReplyRow: {
    marginLeft: 34,
  },

  commentAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentAuthorInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },


  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  commentAvatarText: {
    fontSize: 14,
    fontWeight: "800",
  },

  commentBubble: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  commentAuthor: {
    fontSize: 13,
    fontWeight: "800",
  },

  commentUsername: {
    fontSize: 11,
    marginTop: 1,
  },

  commentTimestamp: {
    flexShrink: 0,
    fontSize: 10,
  },


  commentBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },

  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 10,
  },

  commentAction: {
    minHeight: 24,
    justifyContent: "center",
  },

  commentActionText: {
    fontSize: 11,
    fontWeight: "700",
  },

  reactionPicker: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 5,
    paddingVertical: 4,
    marginTop: 7,
  },

  reactionButton: {
    width: 34,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  reactionEmoji: {
    fontSize: 18,
  },

  commentReactionCounts: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
  },

  commentReactionCount: {
    overflow: "hidden",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
  },

  replyIndicator: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  replyIndicatorText: {
    flex: 1,
    minWidth: 0,
  },

  replyIndicatorTitle: {
    fontSize: 11,
    fontWeight: "800",
  },

  replyIndicatorBody: {
    fontSize: 11,
    marginTop: 2,
  },

  replyIndicatorClose: {
    fontSize: 24,
    lineHeight: 26,
    paddingHorizontal: 8,
  },

  commentComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  commentInputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 18,
    marginRight: 8,
    overflow: "hidden",
  },

  commentInput: {
    minHeight: 42,
    maxHeight: 98,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },

  commentSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  commentSendText: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  shareMenu: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },

  shareMenuHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  shareMenuTitle: {
    fontSize: 22,
    fontWeight: "900",
  },

  shareMenuSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },

  shareOption: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginTop: 8,
  },

  shareOptionIcon: {
    width: 36,
    textAlign: "center",
    fontSize: 22,
    marginRight: 10,
  },

  shareOptionText: {
    flex: 1,
  },

  shareOptionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },

  shareOptionSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },

  shareNativeOption: {
    marginTop: 12,
  },

  composerKeyboard: {
    width: "100%",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 24,
  },

  composer: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "86%",
    borderRadius: 26,
    padding: 20,
    overflow: "hidden",
  },

  composerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },

  composerTitle: {
    fontSize: 23,
    fontWeight: "900",
  },

  composerSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },

  closeText: {
    fontSize: 22,
    padding: 4,
  },

  composerCreator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  smallAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  createPostEditor: {
    minHeight: 270,
    justifyContent: "center",
    marginTop: 10,
  },

  createPostCaption: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  feedMediaOverlayContainer: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },

  mediaEditorPreview: {
    width: "100%",
    height: 240,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
    marginBottom: 14,
  },

  mediaEditorImage: {
    width: "100%",
    height: "100%",
  },

  mediaEditorVideoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaEditorVideoIcon: {
    fontSize: 38,
    marginBottom: 8,
  },

  mediaEditorVideoText: {
    fontSize: 14,
    fontWeight: "800",
  },

  feedImageBrandLeft: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 34,
    height: 34,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.30)",
  },

  feedImageBrandIcon: {
    width: "100%",
    height: "100%",
  },

  feedBrandWatermark: {
    position: "absolute",
    right: 14,
    bottom: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.30)",
  },

  feedBrandWatermarkText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  feedVideoEndCard: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 24,
  },

  feedVideoEndCardLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 12,
  },

  feedVideoEndCardApp: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2.2,
  },

  feedVideoEndCardExile: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 3,
    opacity: 0.78,
  },

  feedVideoEndCardCreator: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
    opacity: 0.92,
  },

  mediaOverlayPreview: {
    position: "absolute",
    transform: [{ translateX: -50 }, { translateY: -18 }],
    maxWidth: "88%",
  },

  mediaOverlayText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },

  textInput: {
    minHeight: 230,
    maxHeight: 300,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 17,
    lineHeight: 25,
  },




  selectedAttachment: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectedName: {
    flex: 1,
    marginRight: 10,
    fontSize: 13,
    fontWeight: "700",
  },

  composerTools: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 18,
  },

  toolButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },

  toolText: {
    fontWeight: "800",
    fontSize: 13,
  },

  publishRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    marginBottom: 8,
  },

  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    fontWeight: "800",
  },

  publishButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  publishText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  overlayEditorBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 20,
    zIndex: 20,
  },

  overlayEditorCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    elevation: 10,
  },

  overlayEditorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  overlayEditorTitle: {
    fontSize: 18,
    fontWeight: "900",
  },

  overlayEditorInput: {
    minHeight: 110,
    maxHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    lineHeight: 23,
    textAlignVertical: "top",
  },

  overlayEditorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
});
