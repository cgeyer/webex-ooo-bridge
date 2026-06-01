import crypto from "node:crypto";
import express from "express";
import { notifyUserAboutIncomingMessage } from "./absence-notification.js";
import { config } from "./config.js";
import { getUserByWebhookId } from "./db.js";
import { deactivateOooIfExpired } from "./ooo-expiry.js";
import { resolveOooReplyText } from "./ooo-message.js";
import { ensureAccessToken } from "./user-tokens.js";
import { getMessage, getPersonDetails, sendRoomMessage } from "./webex.js";

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
      if (!user || !user.enableOoo) return;

      const accessToken = await ensureAccessToken(user);
      const webhookData =
        req.body?.data && typeof req.body.data === "object" ? req.body.data : undefined;

      if (
        await deactivateOooIfExpired(user, accessToken, messageId, webhookData, log, getMessage)
      ) {
        return;
      }

      const filter = String(req.body?.filter ?? "");
      const isDirectWebhook = filter.includes("roomType=direct");

      let roomId = req.body?.data?.roomId;
      let senderPersonId = req.body?.data?.personId;
      let messageParentId = req.body?.data?.parentId;
      let incomingMessage = null;
      if (!roomId || !senderPersonId) {
        const msg = await getMessage(accessToken, messageId);
        incomingMessage = msg;
        roomId = roomId ?? msg?.roomId;
        senderPersonId = senderPersonId ?? msg?.personId;
        if (messageParentId == null && msg?.parentId) {
          messageParentId = msg.parentId;
        }
      }
      if (!roomId || !senderPersonId) return;
      if (senderPersonId === user.personId) return;

      if (!incomingMessage) {
        incomingMessage = await getMessage(accessToken, messageId);
      }

      const sender = await getPersonDetails(accessToken, String(senderPersonId));
      const senderEmail = String(sender.emails?.[0] ?? sender.email ?? "");
      if (isDirectWebhook && isMessageFromBot(senderEmail)) {
        log.debug({ webhookId, messageId, senderEmail }, "ignored direct message from notification bot");
        return;
      }

      const replyText = resolveOooReplyText(user, senderEmail);
      if (!replyText) return;

      if (isDirectWebhook) {
        await sendRoomMessage(accessToken, { roomId, text: replyText });
        log.info(
          { webhookId, roomId, mode: "direct", senderDomain: senderEmail.split("@")[1] ?? null },
          "sent OOO direct reply"
        );
      } else {
        const replyParentId = typeof messageParentId === "string" ? messageParentId : messageId;
        await sendRoomMessage(accessToken, {
          roomId,
          parentId: replyParentId,
          text: replyText,
        });
        log.info(
          {
            webhookId,
            roomId,
            mode: "group",
            parentId: replyParentId,
            senderDomain: senderEmail.split("@")[1] ?? null,
          },
          "sent OOO threaded reply"
        );
      }

      if (user.notifyIncomingMessages) {
        try {
          await notifyUserAboutIncomingMessage(user, {
            accessToken,
            sender,
            incomingMessage,
            isDirect: isDirectWebhook,
            roomId: String(roomId),
            log,
          });
        } catch (notifyErr) {
          log.error(
            { err: notifyErr, personId: user.personId, messageId },
            "failed to send absence notification"
          );
        }
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

/** @param {string} senderEmail */
function isMessageFromBot(senderEmail) {
  const botEmail = config.webex.botEmail;
  if (!botEmail || !senderEmail.trim()) return false;
  return senderEmail.trim().toLowerCase() === botEmail.trim().toLowerCase();
}
