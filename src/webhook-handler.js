import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";
import { getUserByWebhookId } from "./db.js";
import { ensureAccessToken } from "./user-tokens.js";
import { getMessage, sendRoomMessage } from "./webex.js";

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
      let messageParentId = req.body?.data?.parentId;
      if (!roomId || !senderPersonId) {
        const msg = await getMessage(accessToken, messageId);
        roomId = roomId ?? msg?.roomId;
        senderPersonId = senderPersonId ?? msg?.personId;
        if (messageParentId == null && msg?.parentId) {
          messageParentId = msg.parentId;
        }
      }
      if (!roomId) return;
      if (senderPersonId === user.personId) return;

      if (isDirectWebhook) {
        await sendRoomMessage(accessToken, { roomId, text: user.oooMessage.trim() });
        log.info({ webhookId, roomId, mode: "direct" }, "sent OOO direct reply");
      } else {
        const replyParentId = typeof messageParentId === "string" ? messageParentId : messageId;
        await sendRoomMessage(accessToken, {
          roomId,
          parentId: replyParentId,
          text: user.oooMessage.trim(),
        });
        log.info({ webhookId, roomId, mode: "group", parentId: replyParentId }, "sent OOO threaded reply");
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
