import {
  Directory,
  File,
  Paths,
} from "expo-file-system";

export type ResolvedLinkKind =
  | "image"
  | "video"
  | "audio"
  | "file"
  | "tiktok"
  | "youtube"
  | "website";

export type ResolvedLink = {
  url: string;
  kind: ResolvedLinkKind;
  isDirectMedia: boolean;
  mimeType?: string;
  provider?: string;
  title?: string;
  description?: string;
  imageUri?: string;
  videoId?: string;
  siteName?: string;
};

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
];

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
];

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".ogg",
  ".opus",
];

const FILE_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".zip",
];

function cleanUrl(value: string): string {
  const trimmed = value.trim();

  // Clipboard shares can contain a valid URL followed by
  // platform-generated text, e.g. TikTok Lite share messages.
  const match = trimmed.match(/https?:\/\/[^\s]+/i);

  return (match?.[0] || trimmed)
    .trim()
    .replace(/[),.;!?]+$/, "");
}

function getTikTokVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/video\/(\d+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function extractCanonicalUrl(
  html: string,
  baseUrl: string,
): string | undefined {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    try {
      const canonical = new URL(match[1], baseUrl).toString();

      if (
        canonical.startsWith("http://") ||
        canonical.startsWith("https://")
      ) {
        return cleanUrl(canonical);
      }
    } catch {
      // Try the next canonical URL candidate.
    }
  }

  return undefined;
}

async function followRedirects(value: string): Promise<string> {
  const url = cleanUrl(value);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });

    const responseUrl = cleanUrl(response.url || "");

    if (responseUrl && responseUrl !== url) {
      return responseUrl;
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() || "";

    if (contentType.includes("text/html")) {
      const html = await response.text();
      const canonicalUrl = extractCanonicalUrl(html, url);

      if (canonicalUrl) {
        return canonicalUrl;
      }
    }

    return responseUrl || url;
  } catch {
    return url;
  }
}

function extractTikTokMediaUrl(html: string): string | undefined {
  const patterns = [
    /"downloadAddr"\s*:\s*"([^"]+)"/i,
    /"playAddr"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    try {
      /*
       * TikTok escapes URL separators inside its embedded JSON,
       * for example \u002F for "/". JSON.parse decodes these safely.
       */
      const decoded = JSON.parse(`"${match[1]}"`);
      const mediaUrl = new URL(decoded);

      if (
        mediaUrl.protocol === "http:" ||
        mediaUrl.protocol === "https:"
      ) {
        return mediaUrl.toString();
      }
    } catch {
      // Try the next embedded media candidate.
    }
  }

  return undefined;
}

function hasExtension(pathname: string, extensions: string[]): boolean {
  return extensions.some((extension) => pathname.endsWith(extension));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function extractMeta(
  html: string,
  property: string,
): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return undefined;
}

function extractNameMeta(
  html: string,
  name: string,
): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match?.[1]
    ? decodeHtml(match[1].replace(/\s+/g, " "))
    : undefined;
}

function getYouTubeVideoId(parsed: URL): string | undefined {
  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "youtu.be") {
    return parsed.pathname
      .split("/")
      .filter(Boolean)[0];
  }

  if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname.endsWith(".youtube.com")
  ) {
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v") || undefined;
    }

    const parts = parsed.pathname
      .split("/")
      .filter(Boolean);

    if (
      parts[0] === "shorts" ||
      parts[0] === "embed" ||
      parts[0] === "live"
    ) {
      return parts[1];
    }
  }

  return undefined;
}

function getHostnameLabel(parsed: URL): string {
  return parsed.hostname
    .replace(/^www\./i, "")
    .replace(/^m\./i, "");
}

function mediaKindFromContentType(
  contentType: string,
): Exclude<ResolvedLinkKind, "tiktok" | "youtube" | "website"> | undefined {
  const normalized = contentType
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (normalized.startsWith("image/")) {
    return "image";
  }

  if (normalized.startsWith("video/")) {
    return "video";
  }

  if (normalized.startsWith("audio/")) {
    return "audio";
  }

  if (
    normalized === "application/pdf" ||
    normalized === "application/zip" ||
    normalized === "application/json" ||
    normalized === "application/octet-stream" ||
    normalized.includes("wordprocessingml") ||
    normalized.includes("spreadsheetml") ||
    normalized.includes("presentationml") ||
    normalized === "application/msword" ||
    normalized === "application/vnd.ms-excel" ||
    normalized === "application/vnd.ms-powerpoint"
  ) {
    return "file";
  }

  return undefined;
}

export function resolveLink(value: string): ResolvedLink | null {
  const url = cleanUrl(value);

  if (!url) return null;

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (
    hostname === "tiktok.com" ||
    hostname.endsWith(".tiktok.com")
  ) {
    return {
      url,
      kind: "tiktok",
      isDirectMedia: false,
      provider: "TikTok",
      siteName: "TikTok",
    };
  }

  const youtubeVideoId = getYouTubeVideoId(parsed);

  if (youtubeVideoId) {
    return {
      url,
      kind: "youtube",
      isDirectMedia: false,
      provider: "YouTube",
      siteName: "YouTube",
      videoId: youtubeVideoId,
      imageUri: `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
    };
  }

  if (hasExtension(pathname, IMAGE_EXTENSIONS)) {
    return {
      url,
      kind: "image",
      isDirectMedia: true,
    };
  }

  if (hasExtension(pathname, VIDEO_EXTENSIONS)) {
    return {
      url,
      kind: "video",
      isDirectMedia: true,
    };
  }

  if (hasExtension(pathname, AUDIO_EXTENSIONS)) {
    return {
      url,
      kind: "audio",
      isDirectMedia: true,
    };
  }

  if (hasExtension(pathname, FILE_EXTENSIONS)) {
    return {
      url,
      kind: "file",
      isDirectMedia: true,
    };
  }

  return {
    url,
    kind: "website",
    isDirectMedia: false,
    provider: getHostnameLabel(parsed),
    siteName: getHostnameLabel(parsed),
  };
}

export async function resolveLinkMetadata(
  value: string,
): Promise<ResolvedLink | null> {
  const normalizedUrl = await followRedirects(value);
  let resolved = resolveLink(normalizedUrl);

  if (!resolved) return null;

  if (resolved.isDirectMedia) {
    return resolved;
  }

  /*
   * TikTok pages embed signed media resources in their page data.
   *
   * oEmbed only provides presentation metadata, so it cannot satisfy
   * NexChat's native-media ingestion path. When TikTok exposes an actual
   * downloadable/playable media resource, extract and verify it here.
   */
  if (resolved.kind === "tiktok") {
    try {
      console.log("[NEXCHAT LINK RESOLVER] TIKTOK START", {
        url: resolved.url,
      });

      const fetchTikTokPage = async (
        pageUrl: string,
      ): Promise<{ html: string; canonicalUrl?: string }> => {
        const response = await fetch(pageUrl, {
          method: "GET",
        });

        if (!response.ok) {
          console.log("[NEXCHAT LINK RESOLVER] TIKTOK PAGE FAILED", {
            url: pageUrl,
            status: response.status,
          });

          return { html: "" };
        }

        const html = await response.text();
        const canonicalUrl = extractCanonicalUrl(html, pageUrl);
        const contentType =
          response.headers.get("content-type")?.toLowerCase() || "";

        console.log("[NEXCHAT LINK RESOLVER] TIKTOK PAGE", {
          url: pageUrl,
          status: response.status,
          contentType,
          htmlLength: html.length,
          canonicalUrl: canonicalUrl || null,
          startsWith: html.slice(0, 180),
        });

        return {
          html,
          canonicalUrl,
        };
      };

      const extractVerifiedVideo = async (
        html: string,
      ): Promise<ResolvedLink | null> => {
        if (!html) {
          return null;
        }

        const mediaUrl = extractTikTokMediaUrl(html);

        console.log("[NEXCHAT LINK RESOLVER] TIKTOK MEDIA CANDIDATE", {
          found: Boolean(mediaUrl),
        });

        if (!mediaUrl) {
          return null;
        }

        try {
          const mediaResponse = await fetch(mediaUrl, {
            method: "GET",
          });

          if (!mediaResponse.ok) {
            console.log(
              "[NEXCHAT LINK RESOLVER] TIKTOK MEDIA VERIFY FAILED",
              {
                status: mediaResponse.status,
              },
            );

            return null;
          }

          const mediaContentType =
            mediaResponse.headers.get("content-type")?.toLowerCase() || "";

          const mediaKind =
            mediaKindFromContentType(mediaContentType);

          console.log("[NEXCHAT LINK RESOLVER] TIKTOK MEDIA VERIFIED", {
            contentType: mediaContentType,
            kind: mediaKind,
          });

          if (mediaKind !== "video") {
            return null;
          }

          return {
            ...resolved,
            url: mediaUrl,
            kind: "video",
            isDirectMedia: true,
            mimeType:
              mediaContentType.split(";")[0].trim() || "video/mp4",
            provider: undefined,
            siteName: undefined,
            videoId: undefined,
            title: undefined,
            description: undefined,
            imageUri: undefined,
          };
        } catch (error) {
          console.log(
            "[NEXCHAT LINK RESOLVER] TIKTOK MEDIA VERIFY ERROR",
            String(error),
          );

          return null;
        }
      };

      /*
       * First inspect the exact URL the user pasted. This is important
       * for vm.tiktok.com short links because React Native fetch does not
       * always expose the final redirect URL through response.url.
       */
      const firstPage = await fetchTikTokPage(resolved.url);

      const directVideo =
        await extractVerifiedVideo(firstPage.html);

      if (directVideo) {
        console.log(
          "[NEXCHAT LINK RESOLVER] TIKTOK DIRECT MEDIA SUCCESS",
        );

        return directVideo;
      }

      /*
       * If the short-link page itself does not contain the media data,
       * follow its canonical URL explicitly and inspect that page.
       */
      if (
        firstPage.canonicalUrl &&
        firstPage.canonicalUrl !== resolved.url
      ) {
        const canonicalPage =
          await fetchTikTokPage(firstPage.canonicalUrl);

        const canonicalVideo =
          await extractVerifiedVideo(canonicalPage.html);

        if (canonicalVideo) {
          console.log(
            "[NEXCHAT LINK RESOLVER] TIKTOK CANONICAL MEDIA SUCCESS",
          );

          return canonicalVideo;
        }
      }

      console.log(
        "[NEXCHAT LINK RESOLVER] TIKTOK MEDIA UNAVAILABLE - LINK FALLBACK",
      );

      return resolved;
    } catch (error) {
      console.log(
        "[NEXCHAT LINK RESOLVER] TIKTOK ERROR",
        String(error),
      );

      return resolved;
    }
  }

  try {
    const response = await fetch(resolved.url, {
      method: "GET",
    });

    if (!response.ok) {
      return resolved;
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() || "";

    const mediaKind =
      mediaKindFromContentType(contentType);

    /*
     * Some media URLs do not have a media extension but return an actual
     * media content type. Treat those as direct media immediately.
     */
    if (mediaKind) {
      return {
        ...resolved,
        kind: mediaKind,
        isDirectMedia: true,
        mimeType:
          contentType.split(";")[0].trim() || undefined,
      };
    }

    if (!contentType.includes("text/html")) {
      return resolved;
    }

    const html = await response.text();

    const title =
      extractMeta(html, "og:title") ||
      extractNameMeta(html, "twitter:title") ||
      extractTitle(html);

    const description =
      extractMeta(html, "og:description") ||
      extractNameMeta(html, "description") ||
      extractNameMeta(html, "twitter:description");

    const rawImageUri =
      extractMeta(html, "og:image") ||
      extractNameMeta(html, "twitter:image");

    let imageUri: string | undefined;

    if (rawImageUri) {
      try {
        const imageUrl = new URL(rawImageUri, resolved.url);

        if (
          imageUrl.protocol === "http:" ||
          imageUrl.protocol === "https:"
        ) {
          imageUri = imageUrl.toString();
        }
      } catch {
        // Ignore malformed preview image URLs.
      }
    }

    /*
     * Collect media candidates from the common metadata forms used by
     * modern sites. Do not assume that og:video is the only source.
     */
    const mediaCandidates = [
      extractMeta(html, "og:video:secure_url"),
      extractMeta(html, "og:video:url"),
      extractMeta(html, "og:video"),
      extractNameMeta(html, "twitter:player:stream"),
    ].filter(Boolean) as string[];

    /*
     * Also inspect ordinary HTML video/source tags.
     */
    const htmlMediaMatches = [
      ...html.matchAll(
        /<(?:video|source)[^>]+src=["']([^"']+)["'][^>]*>/gi,
      ),
    ];

    for (const match of htmlMediaMatches) {
      if (match[1]) {
        mediaCandidates.push(match[1]);
      }
    }

    /*
     * Resolve relative media URLs against the original page.
     */
    const normalizedCandidates: string[] = [];

    for (const candidate of mediaCandidates) {
      try {
        const mediaUrl = new URL(
          candidate,
          resolved.url,
        );

        if (
          mediaUrl.protocol === "http:" ||
          mediaUrl.protocol === "https:"
        ) {
          const normalized = mediaUrl.toString();

          if (!normalizedCandidates.includes(normalized)) {
            normalizedCandidates.push(normalized);
          }
        }
      } catch {
        // Ignore malformed media candidates.
      }
    }

    /*
     * Verify candidates with GET rather than HEAD.
     *
     * HEAD is unreliable across CDNs and media hosts. A successful GET
     * with a real media content type is sufficient to classify the URL.
     */
    for (const mediaUrl of normalizedCandidates) {
      try {
        const mediaResponse = await fetch(mediaUrl, {
          method: "GET",
        });

        if (!mediaResponse.ok) {
          continue;
        }

        const mediaContentType =
          mediaResponse.headers
            .get("content-type")
            ?.toLowerCase() || "";

        const candidateKind =
          mediaKindFromContentType(
            mediaContentType,
          );

        if (
          candidateKind === "image" ||
          candidateKind === "video" ||
          candidateKind === "audio" ||
          candidateKind === "file"
        ) {
          return {
            ...resolved,
            url: mediaUrl,
            kind: candidateKind,
            isDirectMedia: true,
            mimeType:
              mediaContentType
                .split(";")[0]
                .trim() || undefined,
            title,
            description,
            imageUri,
            siteName:
              extractMeta(html, "og:site_name") ||
              resolved.siteName,
          };
        }
      } catch {
        // Try the next candidate.
      }
    }

    return {
      ...resolved,
      title,
      description,
      imageUri,
      siteName:
        extractMeta(html, "og:site_name") ||
        resolved.siteName,
    };
  } catch {
    return resolved;
  }
}

function safeFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;

    const rawName =
      pathname
        .split("/")
        .filter(Boolean)
        .pop() || "download";

    return rawName.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
  } catch {
    return "download";
  }
}

export async function downloadDirectLink(
  resolved: ResolvedLink,
): Promise<string> {
  if (!resolved.isDirectMedia) {
    throw new Error(
      "This link is not a direct media URL.",
    );
  }

  const fileName =
    `${Date.now()}-${safeFileName(resolved.url)}`;

  const directory =
    new Directory(
      Paths.cache,
      "nexchat-links",
    );

  directory.create({
    idempotent: true,
    intermediates: true,
  });

  const destination =
    new File(directory, fileName);

  const downloaded =
    await File.downloadFileAsync(
      resolved.url,
      destination,
    );

  return downloaded.uri;
}
