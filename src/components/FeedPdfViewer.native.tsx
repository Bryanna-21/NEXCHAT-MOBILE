import React from "react";
import Pdf from "react-native-pdf";

type FeedPdfViewerProps = {
  uri: string;
  style: any;
  onLoadComplete: (numberOfPages: number) => void;
  onPageChanged: (page: number, numberOfPages: number) => void;
  onError: (error: unknown) => void;
};

export default function FeedPdfViewer({
  uri,
  style,
  onLoadComplete,
  onPageChanged,
  onError,
}: FeedPdfViewerProps) {
  return (
    <Pdf
      source={{
        uri,
        cache: false,
      }}
      style={style}
      enablePaging={true}
      horizontal={true}
      fitPolicy={0}
      page={1}
      onLoadComplete={onLoadComplete}
      onPageChanged={onPageChanged}
      onError={onError}
    />
  );
}
