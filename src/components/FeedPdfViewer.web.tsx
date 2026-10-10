import React from "react";
import InlineDocumentViewer from "./InlineDocumentViewer";

type FeedPdfViewerProps = {
  id?: string;
  uri: string;
  style?: any;
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

export default function FeedPdfViewer({
  id,
  uri,
  theme,
  name,
}: FeedPdfViewerProps) {
  if (!theme) {
    return null;
  }

  return (
    <InlineDocumentViewer
      id={id}
      uri={uri}
      name={name}
      mimeType="application/pdf"
      theme={theme}
    />
  );
}
