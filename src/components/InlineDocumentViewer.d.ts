import type { ComponentType } from "react";

type InlineDocumentViewerProps = {
  uri: string;
  id?: string;
  name?: string;
  mimeType?: string;
  theme: {
    bg: string;
    ink: string;
    muted: string;
    line: string;
    brand: string;
  };
};

declare const InlineDocumentViewer: ComponentType<InlineDocumentViewerProps>;

export default InlineDocumentViewer;
