import React from "react";
import { Pressable } from "react-native";

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
  if (!visible) {
    return null;
  }

  return (
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
  );
}
