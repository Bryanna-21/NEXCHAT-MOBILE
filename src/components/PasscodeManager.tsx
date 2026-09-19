import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  hasPasscode as checkHasPasscode,
  setPasscode,
  verifyPasscode,
  clearPasscode,
  getRecoveryCode,
} from "../core/appSecurity";

type Step = "closed" | "verifyCurrent" | "createNew" | "confirmNew";

export function PasscodeManager({ theme }: { theme: any }) {
  const [hasCode, setHasCode] = useState(false);
  const [step, setStep] = useState<Step>("closed");
  const [input, setInput] = useState("");
  const [pendingNew, setPendingNew] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkHasPasscode().then(setHasCode);
  }, []);

  const reset = () => {
    setStep("closed");
    setInput("");
    setPendingNew("");
    setBusy(false);
  };

  const startFlow = () => {
    setInput("");
    setPendingNew("");
    setStep(hasCode ? "verifyCurrent" : "createNew");
  };

  const submitCurrent = async () => {
    if (input.trim().length < 4) {
      Alert.alert("Too short", "Use at least 4 characters.");
      return;
    }

    setBusy(true);
    try {
      const ok = await verifyPasscode(input);

      if (!ok) {
        Alert.alert("Incorrect passcode", "Please try again.");
        setInput("");
        return;
      }

      setInput("");
      setPendingNew("");
      setStep("createNew");
    } catch (e) {
      Alert.alert(
        "Couldn't verify passcode",
        e instanceof Error ? e.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  };

  const saveNewPasscode = async () => {
    if (input.trim().length < 4) {
      Alert.alert("Too short", "Use at least 4 characters.");
      return;
    }

    if (pendingNew !== input) {
      Alert.alert("Passcodes don't match", "Make sure both passcodes are identical.");
      return;
    }

    setBusy(true);

    try {
      await setPasscode(pendingNew);
      setHasCode(true);

      // Close and clear immediately after a successful save.
      setInput("");
      setPendingNew("");
      setStep("closed");
    } catch (e) {
      Alert.alert(
        "Couldn't save passcode",
        e instanceof Error ? e.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  };

  const removePasscode = () => {
    Alert.alert(
      "Remove passcode",
      "You will no longer be asked for a passcode to open NexChat.",
      [
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await clearPasscode();
            setHasCode(false);
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const showRecovery = async () => {
    const code = await getRecoveryCode();

    Alert.alert(
      "Recovery code",
      "Keep this safe. You can use it to reset your passcode if you forget it:\n\n" +
        code
    );
  };

  const creatingNew = step === "createNew";

  return (
    <View>
      <TouchableOpacity
        onPress={startFlow}
        style={[styles.row, { borderColor: theme.line }]}
      >
        <Text style={styles.rowIcon}>🔑</Text>

        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.ink }]}>
            App passcode
          </Text>

          <Text style={{ color: theme.muted, fontSize: 12 }}>
            {hasCode ? "Change your passcode" : "Create a passcode"}
          </Text>
        </View>

        <Text style={{ color: theme.muted, fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      {hasCode && (
        <TouchableOpacity
          onPress={removePasscode}
          style={[styles.row, { borderColor: theme.line }]}
        >
          <Text style={styles.rowIcon}>🗑</Text>

          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.ink }]}>
              Remove passcode
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={showRecovery}
        style={[styles.row, { borderColor: theme.line }]}
      >
        <Text style={styles.rowIcon}>🆘</Text>

        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.ink }]}>
            View recovery code
          </Text>

          <Text style={{ color: theme.muted, fontSize: 12 }}>
            Use this if you forget your passcode
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        transparent
        visible={step !== "closed"}
        onRequestClose={reset}
        animationType="fade"
      >
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: theme.card }]}>
            <Text style={[styles.dialogTitle, { color: theme.ink }]}>
              {step === "verifyCurrent" && "Enter current passcode"}
              {creatingNew &&
                (hasCode ? "Create new passcode" : "Create a passcode")}
            </Text>

            {step === "verifyCurrent" ? (
              <>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  secureTextEntry
                  autoFocus
                  editable={!busy}
                  placeholder="Current passcode"
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    { color: theme.ink, borderColor: theme.line },
                  ]}
                />

                <TouchableOpacity
                  disabled={busy}
                  onPress={submitCurrent}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>
                    {busy ? "Checking..." : "Continue"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: theme.muted }]}>
                  Passcode
                </Text>

                <TextInput
                  value={pendingNew}
                  onChangeText={setPendingNew}
                  secureTextEntry
                  autoFocus
                  editable={!busy}
                  placeholder="Enter passcode"
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    { color: theme.ink, borderColor: theme.line },
                  ]}
                />

                <Text style={[styles.fieldLabel, { color: theme.muted }]}>
                  Confirm passcode
                </Text>

                <TextInput
                  value={input}
                  onChangeText={setInput}
                  secureTextEntry
                  editable={!busy}
                  placeholder="Enter passcode again"
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    { color: theme.ink, borderColor: theme.line },
                  ]}
                />

                <TouchableOpacity
                  disabled={busy}
                  onPress={saveNewPasscode}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>
                    {busy ? "Saving..." : "Set Passcode"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              disabled={busy}
              onPress={reset}
              style={styles.cancelButton}
            >
              <Text style={[styles.cancelText, { color: theme.muted }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  rowIcon: {
    fontSize: 21,
    width: 38,
    textAlign: "center",
    marginRight: 10,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  dialog: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 18,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
    marginTop: 4,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
