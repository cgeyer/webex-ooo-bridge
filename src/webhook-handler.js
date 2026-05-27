import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";

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
  app.post(WEBHOOK_MESSAGES_PATH, jsonWithRawBody, (req, res) => {
    const secret = config.webex.webhookSecret;
    if (secret && req.rawBody) {
      const sig = req.get("X-Spark-Signature");
      if (!verifySignature(req.rawBody, sig, secret)) {
        log.warn("webhook signature mismatch");
        return res.status(401).end();
      }
    }
    log.info(
      {
        resource: req.body?.resource,
        event: req.body?.event,
        messageId: req.body?.data?.id,
      },
      "webhook received"
    );
    res.status(200).end();
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
