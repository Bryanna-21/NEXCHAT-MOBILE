import type { StyleProp, ViewStyle } from "react-native";

type FeedPdfViewerProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  onLoadComplete?: (numberOfPages: number) => void;
  onPageChanged?: (page: number, numberOfPages: number) => void;
  onError?: (error: unknown) => void;
  theme?: {
    bg: string;
    ink: string;
    muted: string;
    line: string;
    brand: string;
  };
  name?: string;
};

declare const FeedPdfViewer: React.ComponentType<FeedPdfViewerProps>;

export default FeedPdfViewer;
