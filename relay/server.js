const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

const DATA_DIR = path.join(__dirname, "data");
const QUEUE_FILE = path.join(DATA_DIR, "offline-queue.json");
const DIRECTORY_FILE = path.join(DATA_DIR, "users.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDirectory() {
  try {
    if (!fs.existsSync(DIRECTORY_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(DIRECTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[relay] Failed to load user directory:", error);
    return {};
  }
}

let userDirectory = loadDirectory();

function saveDirectory() {
  const tempFile = `${DIRECTORY_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(userDirectory, null, 2),
    "utf8",
  );

  fs.renameSync(tempFile, DIRECTORY_FILE);
}

function normalizeDirectoryUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  if (
    typeof user.id !== "string" ||
    !user.id.trim() ||
    typeof user.username !== "string" ||
    !user.username.trim() ||
    typeof user.displayName !== "string" ||
    !user.displayName.trim() ||
    typeof user.publicKey !== "string" ||
    !user.publicKey.trim()
  ) {
    return null;
  }

  return {
    id: user.id.trim(),
    username: user.username.trim(),
    displayName: user.displayName.trim(),
    publicKey: user.publicKey.trim(),
    avatarUri:
      typeof user.avatarUri === "string"
        ? user.avatarUri.trim()
        : "",
    bio:
      typeof user.bio === "string"
        ? user.bio.trim()
        : "",
    updatedAt: new Date().toISOString(),
  };
}

function upsertDirectoryUser(user) {
  const normalized = normalizeDirectoryUser(user);

  if (!normalized) {
    return null;
  }

  userDirectory[normalized.id] = normalized;
  saveDirectory();

  return normalized;
}

function searchDirectory(query, requesterId) {
  const normalizedQuery =
    String(query || "").trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return Object.values(userDirectory)
    .filter((user) => user.id !== requesterId)
    .filter((user) => {
      const id = user.id.toLowerCase();
      const username = user.username.toLowerCase();
      const displayName = user.displayName.toLowerCase();

      return (
        id.includes(normalizedQuery) ||
        username.includes(normalizedQuery) ||
        displayName.includes(normalizedQuery)
      );
    })
    .slice(0, 25);
}

function getDirectoryUser(identityId, requesterId) {
  if (!identityId || identityId === requesterId) {
    return null;
  }

  return userDirectory[identityId] || null;
}

function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(QUEUE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[relay] Failed to load offline queue:", error);
    return {};
  }
}

let offlineQueue = loadQueue();

function saveQueue() {
  const tempFile = `${QUEUE_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(offlineQueue, null, 2),
    "utf8",
  );

  fs.renameSync(tempFile, QUEUE_FILE);
}

function now() {
  return Date.now();
}

function isExpired(envelope) {
  if (!envelope || typeof envelope.createdAt !== "string") {
    return true;
  }

  const createdAt = Date.parse(envelope.createdAt);

  if (!Number.isFinite(createdAt)) {
    return true;
  }

  if (
    typeof envelope.ttl === "number" &&
    now() > createdAt + envelope.ttl
  ) {
    return true;
  }

  return false;
}

function envelopeKey(envelope) {
  return (
    envelope.messageId ||
    envelope.queueId ||
    envelope.id
  );
}

function sendJson(socket, message) {
  if (
    socket &&
    socket.readyState === socket.OPEN
  ) {
    socket.send(JSON.stringify(message));
    return true;
  }

  return false;
}

const peers = new Map();
const peerPresence = new Map();

/*
 * Tracks envelopes that have been accepted by the relay and are
 * awaiting recipient delivery acknowledgement. The durable queue
 * remains the source of truth for offline delivery; this index lets
 * live-delivered messages receive the same authenticated ACK path.
 */
const pendingDeliveries = new Map();

function deliveryKey(messageId, recipientId) {
  return `${recipientId}:${messageId}`;
}

function broadcastPresence(identityId, online, exceptSocket) {
  for (const [peerId, peerSocket] of peers) {
    if (peerId === identityId || peerSocket === exceptSocket) {
      continue;
    }

    sendJson(peerSocket, {
      type: "presence",
      identityId,
      online,
    });
  }
}

function registerPeer(identityId, socket, onlineStatus) {
  const existing = peers.get(identityId);

  if (existing && existing !== socket) {
    try {
      existing.close(4001, "Replaced by a newer connection");
    } catch {
      // Ignore close failures.
    }
  }

  peers.set(identityId, socket);
  peerPresence.set(
    identityId,
    onlineStatus !== false,
  );

  for (const [peerId, peerSocket] of peers) {
    if (
      peerId === identityId ||
      peerSocket === socket ||
      peerPresence.get(peerId) !== true
    ) {
      continue;
    }

    sendJson(socket, {
      type: "presence",
      identityId: peerId,
      online: true,
    });
  }

  if (onlineStatus !== false) {
    broadcastPresence(
      identityId,
      true,
      socket,
    );
  }
}

function removePeer(identityId, socket) {
  if (peers.get(identityId) !== socket) {
    return false;
  }

  peers.delete(identityId);

  const wasVisible =
    peerPresence.get(identityId) === true;

  peerPresence.delete(identityId);

  if (wasVisible) {
    broadcastPresence(
      identityId,
      false,
    );
  }

  return true;
}

function normalizeEnvelopePayload(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return envelope;
  }

  const payload = envelope.payload;

  /*
   * JSON serialization of a Uint8Array can produce an object
   * whose keys are numeric byte offsets. Older durable queue
   * entries may therefore contain:
   *
   *   { "0": 123, "1": 34, ... }
   *
   * Current clients use Base64 strings across the WebSocket
   * boundary. Normalize both representations to Base64 so
   * offline replay is compatible with the current client.
   */
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
  ) {
    const keys = Object.keys(payload);

    if (
      keys.length > 0 &&
      keys.every((key) => /^\d+$/.test(key))
    ) {
      const bytes = Buffer.from(
        keys
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => Number(payload[key]) & 0xff),
      );

      return {
        ...envelope,
        payload: bytes.toString("base64"),
      };
    }
  }

  if (Buffer.isBuffer(payload)) {
    return {
      ...envelope,
      payload: payload.toString("base64"),
    };
  }

  if (payload instanceof Uint8Array) {
    return {
      ...envelope,
      payload: Buffer.from(payload).toString("base64"),
    };
  }

  return envelope;
}

function queueEnvelope(envelope) {
  const normalizedEnvelope =
    normalizeEnvelopePayload(envelope);

  const recipientId =
    normalizedEnvelope.recipientId;

  if (!offlineQueue[recipientId]) {
    offlineQueue[recipientId] = [];
  }

  const key = envelopeKey(normalizedEnvelope);

  const duplicate =
    offlineQueue[recipientId].some(
      (item) => envelopeKey(item) === key,
    );

  if (!duplicate) {
    offlineQueue[recipientId].push(
      normalizedEnvelope,
    );
    saveQueue();
  }

  return normalizedEnvelope;
}

function deliverOfflineQueue(identityId, socket) {
  const items = offlineQueue[identityId];

  console.log(
    `[relay] Checking offline queue for ${identityId}:`,
    Array.isArray(items) ? items.length : 0,
  );

  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const pending = [];

  for (const envelope of items) {
    if (isExpired(envelope)) {
      continue;
    }

    const normalizedEnvelope =
      normalizeEnvelopePayload(envelope);

    const sent = sendJson(socket, {
      type: "envelope",
      envelope: normalizedEnvelope,
      offline: true,
    });

    if (!sent) {
      pending.push(normalizedEnvelope);
    } else {
      // Keep the normalized envelope persisted until the recipient
      // explicitly acknowledges delivery. This prevents message loss
      // if the recipient disconnects after receiving the envelope but
      // before sending delivery-ack.
      pending.push(normalizedEnvelope);
    }
  }

  if (pending.length > 0) {
    offlineQueue[identityId] = pending;
  } else {
    delete offlineQueue[identityId];
  }

  saveQueue();
}

function forwardEnvelope(senderId, envelope) {
  if (!envelope || typeof envelope !== "object") {
    return {
      accepted: false,
      error: "Invalid envelope.",
    };
  }

  if (envelope.senderId !== senderId) {
    return {
      accepted: false,
      error: "Envelope sender does not match registered identity.",
    };
  }

  if (isExpired(envelope)) {
    return {
      accepted: false,
      error: "Envelope expired.",
    };
  }

  /*
   * Persist BEFORE forwarding to a live recipient.
   *
   * This makes live delivery and offline delivery use the same
   * durable queue. The envelope is removed only after the
   * recipient sends an authenticated delivery acknowledgement.
   */
  const normalizedEnvelope =
    queueEnvelope(envelope);

  const recipientSocket = peers.get(
    normalizedEnvelope.recipientId,
  );

  if (recipientSocket) {
    const forwarded = sendJson(
      recipientSocket,
      {
        type: "envelope",
        envelope: normalizedEnvelope,
      },
    );

    if (forwarded) {
      pendingDeliveries.set(
        deliveryKey(
          normalizedEnvelope.messageId,
          normalizedEnvelope.recipientId,
        ),
        normalizedEnvelope,
      );

      return {
        accepted: true,
        forwarded: true,
        queued: true,
      };
    }
  }

  return {
    accepted: true,
    forwarded: false,
    queued: true,
  };
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        ok: true,
        service: "nexchat-relay",
        peers: peers.size,
        directoryUsers: Object.keys(
          userDirectory,
        ).length,
        queuedRecipients: Object.keys(
          offlineQueue,
        ).length,
      }),
    );

    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({
  server: httpServer,
});

wss.on("connection", (socket) => {
  let identityId = null;

  console.log("[relay] Client connected.");

  socket.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendJson(socket, {
        type: "error",
        error: "Invalid JSON.",
      });

      return;
    }

    if (
      message.type === "register"
    ) {
      if (
        typeof message.identityId !== "string" ||
        !message.identityId.trim()
      ) {
        sendJson(socket, {
          type: "register-ack",
          accepted: false,
          error: "identityId is required.",
        });

        return;
      }

      identityId = message.identityId.trim();

      registerPeer(
        identityId,
        socket,
        message.onlineStatus !== false,
      );

      sendJson(socket, {
        type: "register-ack",
        accepted: true,
        identityId,
      });

      deliverOfflineQueue(
        identityId,
        socket,
      );

      console.log(
        `[relay] Registered ${identityId}`,
      );

      return;
    }

    if (
      message.type === "directory-register"
    ) {

      const user = message.user;

      if (!user || user.id !== identityId) {
        sendJson(socket, {
          type: "directory-register-ack",
          accepted: false,
          error:
            "Directory identity does not match registered identity.",
        });

        return;
      }

      const saved = upsertDirectoryUser(user);

      sendJson(socket, {
        type: "directory-register-ack",
        accepted: Boolean(saved),
        user: saved || undefined,
        error: saved
          ? undefined
          : "Invalid public user profile.",
      });

      return;
    }

    if (
      message.type === "directory-search"
    ) {
      const results = searchDirectory(
        message.query,
        identityId,
      );

      sendJson(socket, {
        type: "directory-search-result",
        requestId: message.requestId,
        results,
      });

      return;
    }

    if (
      message.type === "directory-profile"
    ) {
      const user = getDirectoryUser(
        message.identityId,
        identityId,
      );

      sendJson(socket, {
        type: "directory-profile-result",
        requestId: message.requestId,
        user: user || undefined,
      });

      return;
    }

    if (!identityId) {
      sendJson(socket, {
        type: "error",
        error: "Register before sending messages.",
      });

      return;
    }

    if (
      message.type === "envelope"
    ) {
      const result = forwardEnvelope(
        identityId,
        message.envelope,
      );

      sendJson(socket, {
        type: "envelope-ack",
        messageId:
          message.envelope?.messageId,
        envelopeId:
          message.envelope?.id,
        accepted: result.accepted,
        forwarded:
          result.forwarded || false,
        queued:
          result.queued || false,
        error: result.error,
      });

      return;
    }

    if (
      message.type === "event"
    ) {
      const event = message.event;

      if (
        !event ||
        event.senderId !== identityId
      ) {
        sendJson(socket, {
          type: "event-ack",
          accepted: false,
          error: "Invalid event sender.",
        });

        return;
      }

      const recipientSocket =
        peers.get(event.recipientId);

      const forwarded =
        recipientSocket
          ? sendJson(
              recipientSocket,
              {
                type: "event",
                event,
              },
            )
          : false;

      sendJson(socket, {
        type: "event-ack",
        eventId: event.id,
        accepted: Boolean(forwarded),
        forwarded: Boolean(forwarded),
      });

      return;
    }

    if (
      message.type === "delivery-ack"
    ) {
      const queuedItems =
        offlineQueue[identityId];

      let acknowledgedEnvelope = null;

      if (Array.isArray(queuedItems)) {
        acknowledgedEnvelope =
          queuedItems.find(
            (envelope) =>
              envelope.messageId ===
                message.messageId &&
              envelope.senderId ===
                message.senderId &&
              envelope.recipientId ===
                identityId,
          );

        if (acknowledgedEnvelope) {
          const remaining =
            queuedItems.filter(
              (envelope) =>
                envelope !==
                acknowledgedEnvelope,
            );

          if (remaining.length > 0) {
            offlineQueue[identityId] =
              remaining;
          } else {
            delete offlineQueue[identityId];
          }

          saveQueue();
        }
      }

      /*
       * Live-delivered envelopes are also tracked outside the
       * durable offline queue so their delivery ACK can reach the
       * original sender.
       */
      if (!acknowledgedEnvelope) {
        const pendingKey =
          deliveryKey(
            message.messageId,
            identityId,
          );

        const pendingEnvelope =
          pendingDeliveries.get(
            pendingKey,
          );

        if (
          pendingEnvelope &&
          pendingEnvelope.senderId ===
            message.senderId
        ) {
          acknowledgedEnvelope =
            pendingEnvelope;

          pendingDeliveries.delete(
            pendingKey,
          );
        }
      } else if (acknowledgedEnvelope.messageId) {
        pendingDeliveries.delete(
          deliveryKey(
            acknowledgedEnvelope.messageId,
            acknowledgedEnvelope.recipientId,
          ),
        );
      }

      /*
       * Only notify the original sender when the ACK matched
       * a real envelope that was addressed to this recipient.
       */
      if (acknowledgedEnvelope) {
        const senderSocket =
          peers.get(
            acknowledgedEnvelope.senderId,
          );

        if (senderSocket) {
          sendJson(senderSocket, {
            type: "delivery-ack",
            messageId:
              acknowledgedEnvelope.messageId,
            recipientId:
              acknowledgedEnvelope.recipientId,
          });
        }
      }

      return;
    }

    sendJson(socket, {
      type: "error",
      error: `Unknown message type: ${message.type}`,
    });
  });

  socket.on("close", () => {
    if (identityId) {
      removePeer(identityId, socket);

      console.log(
        `[relay] Disconnected ${identityId}`,
      );
    }
  });

  socket.on("error", (error) => {
    console.error(
      "[relay] Socket error:",
      error.message,
    );
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `[relay] NexChat relay listening on ${HOST}:${PORT}`,
  );
});
