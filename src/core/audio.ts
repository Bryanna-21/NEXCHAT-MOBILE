import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

export async function requestMicrophonePermission(): Promise<boolean> {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  return permission.granted;
}

export async function configureRecordingAudio(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });
}

export {
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
};
