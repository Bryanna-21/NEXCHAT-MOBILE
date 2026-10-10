import type { ComponentType, ReactNode } from "react";

type PostMenuModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  backdropStyle: any;
  cardStyle: any;
};

declare const PostMenuModal: ComponentType<PostMenuModalProps>;

export default PostMenuModal;
