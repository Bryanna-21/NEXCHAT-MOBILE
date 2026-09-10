import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { parseContactQR } from "../core/qr";

export function QRScanner({
  visible,
  onClose,
  onContact,
}: {
  visible: boolean;
  onClose: () => void;
  onContact: (contact: {
    id: string;
    displayName: string;
    username?: string;
    avatarUri?: string;
  }) => void;
}) {
  const [permission, requestPermission] =
    useCameraPermissions();

  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);

      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible]);

  const handleBarcodeScanned = ({
    data,
  }: {
    data: string;
  }) => {
    if (scanned) {
      return;
    }

    setScanned(true);

    try {
      const contact = parseContactQR(data);

      onContact(contact);
      onClose();
    } catch (error) {
      Alert.alert(
        "Invalid QR code",
        error instanceof Error
          ? error.message
          : "This QR code cannot be used as a NexChat contact.",
        [
          {
            text: "Scan again",
            onPress: () => setScanned(false),
          },
          {
            text: "Cancel",
            style: "cancel",
            onPress: onClose,
          },
        ]
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={
                scanned ? undefined : handleBarcodeScanned
              }
            />

            <View style={styles.overlay}>
              <Text style={styles.title}>
                Scan NexChat QR
              </Text>

              <Text style={styles.subtitle}>
                Place the contact's QR code inside the frame.
              </Text>

              <View style={styles.frame} />

              <TouchableOpacity
                onPress={onClose}
                style={styles.close}
              >
                <Text style={styles.closeText}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionTitle}>
              Camera permission required
            </Text>

            <Text style={styles.permissionText}>
              NexChat needs camera access to scan contact QR
              codes.
            </Text>

            <TouchableOpacity
              onPress={requestPermission}
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>
                Allow camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  overlay: {
    flex: 1,
    alignItems: "center",
    paddingTop: 70,
  },

  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "900",
  },

  subtitle: {
    color: "white",
    opacity: 0.85,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 30,
  },

  frame: {
    width: 260,
    height: 260,
    borderWidth: 4,
    borderColor: "white",
    borderRadius: 24,
    marginTop: 60,
  },

  close: {
    position: "absolute",
    bottom: 45,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 30,
    backgroundColor: "#000B",
  },

  closeText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },

  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },

  permissionTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },

  permissionText: {
    color: "white",
    opacity: 0.8,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },

  permissionButton: {
    backgroundColor: "#0C5A8D",
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 14,
  },

  permissionButtonText: {
    color: "white",
    fontWeight: "900",
  },

  cancelText: {
    color: "white",
    marginTop: 20,
  },
});
