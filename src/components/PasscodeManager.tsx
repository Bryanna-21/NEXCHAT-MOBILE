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

  useEffect(() => {
    checkHasPasscode().then(setHasCode);
  }, []);

  const reset = () => {
    setStep("closed");
    setInput("");
    setPendingNew("");
  };

  const startFlow = () => {
    setInput("");
    setStep(hasCode ? "verifyCurrent" : "createNew");
  };

  const submitCurrent = async () => {
    const ok = await verifyPasscode(input);
    if (!ok) {
      Alert.alert("Incorrect passcode", "Please try again.");
      return;
    }
    setInput("");
    setStep("createNew");
  };

  const submitNew = () => {
    if (input.trim().length < 4) {
      Alert.alert("Too short", "Use at least 4 characters.");
      return;
    }
    setPendingNew(input);
    setInput("");
    setStep("confirmNew");
  };

  const submitConfirm = async () => {
    if (input !== pendingNew) {
      Alert.alert("Passcodes don't match", "Try again.");
      setInput("");
      setStep("createNew");
      return;
    }
    await setPasscode(pendingNew);
    setHasCode(true);
    reset();
    Alert.alert("Passcode saved", "Your NexChat passcode has been updated.");
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
              {step === "createNew" &&
                (hasCode ? "Enter new passcode" : "Create a passcode")}
              {step === "confirmNew" && "Confirm new passcode"}
            </Text>

            <TextInput
              value={input}
              onChangeText={setInput}
              secureTextEntry
              autoFocus
              placeholder="Passcode"
              placeholderTextColor={theme.muted}
              style={[
                styles.input,
                { color: theme.ink, borderColor: theme.line },
              ]}
            />

            <TouchableOpacity
              onPress={() => {
                if (step === "verifyCurrent") submitCurrent();
                else if (step === "createNew") submitNew();
                else if (step === "confirmNew") submitConfirm();
              }}
              style={[styles.button, { backgroundColor: theme.brand }]}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                Continue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={reset} style={styles.cancelButton}>
              <Text style={{ color: theme.muted }}>Cancel</Text>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },

  rowIcon: {
    fontSize: 20,
    width: 26,
    textAlign: "center",
  },

  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
  },

  overlay: {
    flex: 1,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  dialog: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
  },

  dialogTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    marginBottom: 12,
  },

  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },

  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
});
