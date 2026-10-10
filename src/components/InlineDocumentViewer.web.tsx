import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getAttachmentBlob } from "../core/attachmentStore";

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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function getKind(name: string, mimeType: string) {
  const extension = getExtension(name);

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    extension === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }

  if (
    extension === "xlsx" ||
    extension === "xls" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "xlsx";
  }

  if (
    extension === "pptx" ||
    extension === "ppt" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.ms-powerpoint"
  ) {
    return "pptx";
  }

  if (extension === "txt" || mimeType === "text/plain") {
    return "txt";
  }

  return "unknown";
}

function buildViewerHtml(
  kind: string,
  fileName: string,
  fileUri: string,
  landscape = false,
) {
  const safeName = escapeHtml(fileName);
  const encodedUri = JSON.stringify(fileUri);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111;
  font-family: Arial, sans-serif;
}

#status {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 14px;
  z-index: 10;
}

#pages {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

#pages::-webkit-scrollbar {
  display: none;
}

.page {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px;
  background: #222;
  touch-action: pan-x;
}

.page-content {
  width: 100%;
  min-height: 100%;
  background: white;
  overflow: auto;
  box-shadow: 0 1px 6px rgba(0,0,0,.3);
}

.docx-page {
  width: 100% !important;
  max-width: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  box-shadow: none !important;
}

.docx-wrapper {
  padding: 0 !important;
  background: #222 !important;
}

.sheet-page {
  overflow: auto;
  padding: 12px;
}

.sheet-page table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-size: 12px;
  color: #111;
}

.sheet-page td,
.sheet-page th {
  border: 1px solid #ccc;
  padding: 6px 8px;
  min-width: 60px;
  vertical-align: top;
}

.slide-page {
  align-items: center;
  justify-content: center;
}

.slide-page svg {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: auto;
}

.text-page {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.55;
  color: #111;
  padding: 24px;
}

#error {
  color: #f88;
  padding: 24px;
  text-align: center;
}
</style>
</head>

<body>
<div id="status">Loading ${safeName}…</div>
<div id="pages"></div>

<script>
const FILE_URI = ${encodedUri};
const KIND = ${JSON.stringify(kind)};
const LANDSCAPE = ${JSON.stringify(landscape)};

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function loadBase64() {
  const response = await fetch(FILE_URI);

  if (!response.ok) {
    throw new Error("Unable to load document.");
  }

  const buffer = await response.arrayBuffer();

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length))
    );
  }

  return btoa(binary);
}

function createPage(html, className = "") {
  const page = document.createElement("div");
  page.className = "page " + className;

  const content = document.createElement("div");
  content.className = "page-content";

  if (html instanceof Node) {
    content.appendChild(html);
  } else {
    content.innerHTML = html;
  }

  page.appendChild(content);
  document.getElementById("pages").appendChild(page);
}

function finish() {
  document.getElementById("status").style.display = "none";

  window.parent.postMessage(
    {
      source: "nexchat-document-viewer",
      type: "loaded",
    },
    "*"
  );
}

function fail(error) {
  console.error(error);

  document.getElementById("status").innerHTML =
    '<div id="error">This document could not be displayed.</div>';

  window.parent.postMessage(
    {
      source: "nexchat-document-viewer",
      type: "error",
    },
    "*"
  );
}

async function renderPdf(bytes) {
  const pdfjs = await import(
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs"
  );

  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({
    data: bytes,
  }).promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const pdfPage = await pdf.getPage(pageNumber);

    const baseViewport = pdfPage.getViewport({ scale: 1 });

    const availableWidth =
      window.innerWidth - 16;

    const availableHeight =
      window.innerHeight - 16;

    const scale = Math.min(
      availableWidth / baseViewport.width,
      availableHeight / baseViewport.height
    );

    const viewport = pdfPage.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");

    await pdfPage.render({
      canvasContext: context,
      viewport,
    }).promise;

    createPage(canvas);
  }

  finish();
}

async function renderDocx(bytes) {
  await import(
    "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js"
  );

  const temp = document.createElement("div");

  temp.style.position = "absolute";
  temp.style.left = "-100000px";
  temp.style.width = "100%";

  document.body.appendChild(temp);

  await window.docx.renderAsync(
    bytes,
    temp,
    temp,
    {
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    }
  );

  const sections = temp.querySelectorAll(
    ".docx-wrapper > section"
  );

  if (!sections.length) {
    createPage(temp.innerHTML);
  } else {
    sections.forEach((section) => {
      const clone = section.cloneNode(true);
      clone.classList.add("docx-page");
      createPage(clone);
    });
  }

  temp.remove();
  finish();
}

async function renderXlsx(bytes) {
  const XLSX = await import(
    "https://cdn.sheetjs.com/xlsx-0.18.5/package/xlsx.mjs"
  );

  const workbook = XLSX.read(bytes, {
    type: "array",
  });

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];

    const wrapper = document.createElement("div");
    wrapper.className = "sheet-page";

    const title = document.createElement("h3");
    title.textContent = sheetName;
    title.style.marginTop = "0";

    const table = document.createElement("div");
    table.innerHTML = XLSX.utils.sheet_to_html(worksheet);

    wrapper.appendChild(title);
    wrapper.appendChild(table);

    createPage(wrapper);
  });

  finish();
}

async function renderPptx(bytes) {
  const viewer = await import(
    "https://cdn.jsdelivr.net/npm/pptx-viewer@0.2.2/+esm"
  );

  const presentation = await viewer.loadPresentation(bytes);

  for (let i = 0; i < presentation.slides.length; i++) {
    const svg = viewer.renderSlide(
      presentation.slides[i],
      presentation.slideSize,
      {
        width: Math.max(window.innerWidth - 16, 320),
      }
    );

    const wrapper = document.createElement("div");
    wrapper.className = "slide-page";
    wrapper.appendChild(svg);

    createPage(wrapper);
  }

  presentation.cleanup?.();
  finish();
}

async function renderTxt(bytes) {
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(bytes);

  const lines = text.split("\\n");
  const linesPerPage = 48;

  for (let i = 0; i < lines.length; i += linesPerPage) {
    const wrapper = document.createElement("div");
    wrapper.className = "text-page";
    wrapper.textContent = lines
      .slice(i, i + linesPerPage)
      .join("\\n");

    createPage(wrapper);
  }

  if (!lines.length) {
    createPage("");
  }

  finish();
}

async function main() {
  try {
    const base64 = await loadBase64();
    const bytes = base64ToBytes(base64);

    if (KIND === "pdf") {
      await renderPdf(bytes);
    } else if (KIND === "docx") {
      await renderDocx(bytes);
    } else if (KIND === "xlsx") {
      await renderXlsx(bytes);
    } else if (KIND === "pptx") {
      await renderPptx(bytes);
    } else if (KIND === "txt") {
      await renderTxt(bytes);
    } else {
      throw new Error("Unsupported document type");
    }
  } catch (error) {
    fail(error);
  }
}

main();
</script>
</body>
</html>`;
}

export default function InlineDocumentViewer({
  uri,
  id,
  name = "Document",
  mimeType = "application/octet-stream",
  theme,
}: InlineDocumentViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    let active = true;

    const blobToDataUrl = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(
              new Error(
                "Unable to convert document for web rendering.",
              ),
            );
            return;
          }

          resolve(reader.result);
        };

        reader.onerror = () => {
          reject(
            reader.error ||
              new Error(
                "Unable to read document for web rendering.",
              ),
          );
        };

        reader.readAsDataURL(blob);
      });

    const recoverDocument = async () => {
      try {
        let blob: Blob | null = null;

        if (id) {
          blob = await getAttachmentBlob(id);
        }

        /*
         * The attachment is stored as a Blob in IndexedDB on web.
         * Recover that Blob directly instead of creating a blob: URL
         * and then trying to fetch that URL again.
         */
        if (!blob && uri && !uri.startsWith("blob:")) {
          const response = await fetch(uri);

          if (!response.ok) {
            throw new Error(
              `Unable to recover document (${response.status}).`,
            );
          }

          blob = await response.blob();
        }

        if (!blob) {
          throw new Error(
            "The stored document could not be recovered.",
          );
        }

        const dataUrl = await blobToDataUrl(blob);

        if (active) {
          console.log(
            "[NEXCHAT DOCUMENT] WEB RECOVERY COMPLETE",
            {
              id,
              name,
              mimeType,
              size: blob.size,
              type: blob.type,
            },
          );

          setDocumentUri(dataUrl);
          setLoaded(false);
        }
      } catch (error) {
        console.error(
          "[NEXCHAT DOCUMENT] RECOVERY ERROR",
          error,
        );

        if (active) {
          setDocumentUri(null);
          setLoaded(true);
        }
      }
    };

    setLoaded(false);
    recoverDocument();

    return () => {
      active = false;
    };
  }, [id, uri, name, mimeType]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;

      if (
        !data ||
        data.source !== "nexchat-document-viewer"
      ) {
        return;
      }

      if (data.type === "loaded") {
        setLoaded(true);
      }

      if (data.type === "error") {
        setLoaded(true);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const kind = useMemo(
    () => getKind(name, mimeType),
    [name, mimeType],
  );

  const html = useMemo(
    () =>
      documentUri
        ? buildViewerHtml(
            kind,
            name,
            documentUri,
            landscape,
          )
        : "",
    [kind, name, documentUri, landscape],
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.bg,
          borderColor: theme.line,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.line,
          },
        ]}
      >
        <View style={styles.headerInfo}>
          <Text
            style={[styles.name, { color: theme.ink }]}
            numberOfLines={1}
          >
            {name}
          </Text>

          <Text style={[styles.hint, { color: theme.muted }]}>
            Swipe left to continue
          </Text>
        </View>

        <View style={styles.orientationControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Portrait document view"
            onPress={() => setLandscape(false)}
            style={[
              styles.orientationButton,
              !landscape && {
                backgroundColor: theme.brand,
              },
            ]}
          >
            <Text
              style={[
                styles.orientationText,
                {
                  color: !landscape
                    ? "#fff"
                    : theme.muted,
                },
              ]}
            >
              Portrait
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Landscape document view"
            onPress={() => setLandscape(true)}
            style={[
              styles.orientationButton,
              landscape && {
                backgroundColor: theme.brand,
              },
            ]}
          >
            <Text
              style={[
                styles.orientationText,
                {
                  color: landscape
                    ? "#fff"
                    : theme.muted,
                },
              ]}
            >
              Landscape
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.viewer,
          landscape && styles.viewerLandscape,
        ]}
      >
        {documentUri ? (
          <iframe
            key={`${documentUri}-${landscape ? "landscape" : "portrait"}`}
            title={name}
            srcDoc={html}
          onLoad={() => {
            // The iframe itself loading is not the same as
            // the document finishing its rendering.
          }}
            style={{
              width: "100%",
              height: "100%",
              border: "0",
              display: "block",
              backgroundColor: "#222",
            }}
          />
        ) : null}

        {!loaded || !documentUri ? (
          <View
            pointerEvents="none"
            style={styles.loading}
          >
            <ActivityIndicator
              size="large"
              color={theme.brand}
            />

            <Text
              style={[
                styles.loadingText,
                { color: theme.muted },
              ]}
            >
              Loading document…
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },

  header: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  headerInfo: {
    flex: 1,
    minWidth: 0,
  },

  orientationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 10,
  },

  orientationButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  orientationText: {
    fontSize: 12,
    fontWeight: "700",
  },

  name: {
    fontSize: 15,
    fontWeight: "700",
  },

  hint: {
    marginTop: 3,
    fontSize: 12,
  },

  viewer: {
    width: "100%",
    height: Math.min(
      Math.max(SCREEN_WIDTH * 1.15, 420),
      620,
    ),
    position: "relative",
  },

  viewerLandscape: {
    height: Math.min(
      Math.max(SCREEN_WIDTH * 0.62, 420),
      760,
    ),
  },

  loading: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },

  loadingText: {
    marginTop: 8,
    fontSize: 13,
  },
});
