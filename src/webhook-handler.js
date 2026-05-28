import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";
import { getUserByWebhookId, upsertUserState } from "./state-store.js";
import { getMessage, refreshAccessToken, sendRoomMessage } from "./webex.js";

/** Path segment for incoming Webex message webhooks (full URL = WEBEX_WEBHOOK_TARGET_URL). */
export const WEBHOOK_MESSAGES_PATH = "/webhooks/messages";

const jsonWithRawBody = express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

/**
 * @param {import('pino').Logger} log
 */
export function mountWebhookRoutes(app, log) {
  app.post(WEBHOOK_MESSAGES_PATH, jsonWithRawBody, async (req, res, next) => {
    try {
      const secret = config.webex.webhookSecret;
      if (secret && req.rawBody) {
        const sig = req.get("X-Spark-Signature");
        if (!verifySignature(req.rawBody, sig, secret)) {
          log.warn("webhook signature mismatch");
          return res.status(401).end();
        }
      }
      res.status(200).end();

      const webhookId = req.body?.id;
      const messageId = req.body?.data?.id;
      if (typeof webhookId !== "string" || typeof messageId !== "string") return;

      const user = getUserByWebhookId(webhookId);
      if (!user || !user.enableOoo || !user.oooMessage?.trim()) return;

      const accessToken = await ensureAccessToken(user);
      const filter = String(req.body?.filter ?? "");
      const isDirectWebhook = filter.includes("roomType=direct");

      let roomId = req.body?.data?.roomId;
      let senderPersonId = req.body?.data?.personId;
      if (!roomId || !senderPersonId) {
        const msg = await getMessage(accessToken, messageId);
        roomId = roomId ?? msg?.roomId;
        senderPersonId = senderPersonId ?? msg?.personId;
      }
      if (!roomId) return;
      if (senderPersonId === user.personId) return;

      if (isDirectWebhook) {
        await sendRoomMessage(accessToken, { roomId, text: user.oooMessage.trim() });
        log.info({ webhookId, roomId, mode: "direct" }, "sent OOO direct reply");
      } else {
        await sendRoomMessage(accessToken, {
          roomId,
          parentId: messageId,
          text: user.oooMessage.trim(),
        });
        log.info({ webhookId, roomId, mode: "group", parentId: messageId }, "sent OOO threaded reply");
      }
    } catch (err) {
      next(err);
    }
  });
}

/**
 * @param {Buffer} raw
 * @param {string|undefined} signatureHeader
 * @param {string} secret
 */
function verifySignature(raw, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha1", secret).update(raw).digest("hex");
  return expected === signatureHeader;
}

/**
 * @param {import("./state-store.js").UserState} user
 */
async function ensureAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  if (user.accessToken && user.accessTokenExpiresAt > now + 60) return user.accessToken;
  const refreshed = await refreshAccessToken(user.refreshToken);
  const next = {
    ...user,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? user.refreshToken,
    accessTokenExpiresAt: now + Number(refreshed.expires_in ?? 3600),
  };
  upsertUserState(next);
  return next.accessToken;
}
