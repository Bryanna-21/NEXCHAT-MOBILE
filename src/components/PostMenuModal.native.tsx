import React from "react";
import { Modal, Pressable } from "react-native";

type PostMenuModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  backdropStyle: any;
  cardStyle: any;
};

export default function PostMenuModal({
  visible,
  onRequestClose,
  children,
  backdropStyle,
  cardStyle,
}: PostMenuModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onRequestClose}
    >
      <Pressable
        style={backdropStyle}
        onPress={onRequestClose}
      >
        <Pressable
          style={cardStyle}
          onPress={(event) => event.stopPropagation()}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
