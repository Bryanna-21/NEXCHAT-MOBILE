import React, { useEffect, useState } from "react";
import {
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { Attachment } from "../../core/store";
import { ingestAttachment } from "../../core/attachmentIngestion";

type Props = {
  theme: any;
  onCancel: () => void;
  onRecorded: (attachment: Attachment) => void;
};

export default function VoiceRecorder({
  theme,
  onCancel,
  onRecorded,
}: Props) {
  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY
  );

  const state = useAudioRecorderState(recorder);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const permission =
          await AudioModule.requestRecordingPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            "Microphone permission required",
            "NexChat needs microphone access to record voice messages."
          );

          onCancel();
          return;
        }

        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });

        if (mounted) {
          setReady(true);
        }
      } catch (error) {
        console.error("Voice recorder initialization failed:", error);

        Alert.alert(
          "Recorder unavailable",
          "NexChat could not initialize the microphone."
        );

        onCancel();
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const startRecording = async () => {
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      console.error("Voice recording failed:", error);

      Alert.alert(
        "Recording failed",
        "NexChat could not start the microphone."
      );
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();

      if (!recorder.uri) {
        Alert.alert(
          "Recording unavailable",
          "NexChat could not obtain the recorded audio file."
        );
        return;
      }

      const duration =
        Math.round(state.durationMillis / 1000) || 1;

      /*
       * Voice recordings use the same durable attachment
       * ingestion boundary as photos and files.
       *
       * The recorder URI is treated as temporary input.
       * The ingestion layer validates it, copies it into
       * NexChat's durable attachment store, and returns
       * the canonical attachment reference.
       */
      const result =
        await ingestAttachment({
          uri: recorder.uri,
          type: "audio",
          name: `voice-${Date.now()}.m4a`,
          mimeType: "audio/mp4",
          duration,
        });

      onRecorded(result.attachment);
    } catch (error) {
      console.error("Stopping voice recording failed:", error);

      Alert.alert(
        "Recording failed",
        "NexChat could not save the voice message."
      );
    }
  };

  const seconds = Math.floor(
    state.durationMillis / 1000
  );

  return (
    <View
      style={{
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: theme.line,
        backgroundColor: theme.card,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={onCancel}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 22 }}>✕</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.ink,
              fontWeight: "900",
            }}
          >
            {state.isRecording
              ? "Recording voice message"
              : "Voice message"}
          </Text>

          <Text style={{ color: theme.muted }}>
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </Text>
        </View>

        {!state.isRecording ? (
          <TouchableOpacity
            disabled={!ready}
            onPress={startRecording}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: ready
                ? theme.brand
                : theme.line,
            }}
          >
            <Text style={{ fontSize: 22 }}>🎙</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={stopRecording}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#B42318",
            }}
          >
            <Text style={{ color: "white", fontSize: 20 }}>
              ■
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
