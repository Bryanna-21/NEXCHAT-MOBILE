import type React from "react";

export type PdftronDocumentViewProps = {
  ref?: React.Ref<PdftronDocumentViewHandle>;
  document?: string;
  source?: string;
  style?: object;
  fitMode?: string | number;
  layoutMode?: string | number;
  pageChangeOnTap?: boolean;
  pageIndicatorEnabled?: boolean;
  hideTopToolbars?: boolean;
  hideTopAppNavBar?: boolean;
  hideToolbarsOnTap?: boolean;
  readOnly?: boolean;
  onDocumentLoaded?: (path: string) => void;
  onLoadComplete?: (path: string) => void;
  onDocumentError?: (error: unknown) => void;
  onError?: (error: unknown) => void;
  onPageChanged?: (event: {
    previousPageNumber?: number;
    pageNumber?: number;
  }) => void;
};

export type PdftronDocumentViewHandle = {
  getPageCount?: () => Promise<number>;
};

// PDFTron 3.0.4-33 ships compiled runtime JS but its TypeScript
// declarations are incompatible with TypeScript 6.
// Keep the compatibility boundary isolated here.
const PDFTron = require("@pdftron/react-native-pdf/lib/index.js") as {
  DocumentView: React.ComponentType<PdftronDocumentViewProps>;
  Config: {
    FitMode: {
      FitPage: string | number;
      FitWidth: string | number;
      FitHeight: string | number;
      Zoom: string | number;
    };
    LayoutMode: {
      Single: string | number;
      Continuous: string | number;
      Facing: string | number;
      FacingContinuous: string | number;
      FacingCover: string | number;
      FacingCoverContinuous: string | number;
    };
  };
};

export const DocumentView = PDFTron.DocumentView;
export const Config = PDFTron.Config;
