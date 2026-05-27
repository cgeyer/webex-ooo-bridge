import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * @param {string} code
 * @param {string} codeVerifier
 */
export async function exchangeAuthorizationCode(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.webex.clientId,
    client_secret: config.webex.clientSecret,
    code,
    redirect_uri: config.webex.redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch(config.webex.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {string} toPersonEmail
 * @param {string} text
 */
export async function sendDirectMessage(accessToken, toPersonEmail, text) {
  const res = await fetch(`${config.webex.apiBase}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ toPersonEmail: toPersonEmail.trim(), text }),
  });
  if (!res.ok) {
    throw new Error(`Send message failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {{ name: string, filter: string, secret?: string }} options
 */
export async function createMessageWebhook(accessToken, { name, filter, secret }) {
  const targetUrl = config.webex.webhookTargetUrl;
  if (!targetUrl) {
    throw new Error("WEBEX_WEBHOOK_TARGET_URL is not configured");
  }
  if (!secret) {
    throw new Error("Webhook secret is required");
  }
  const payload = {
    name,
    targetUrl,
    resource: "messages",
    event: "created",
    filter,
    secret,
  };
  const res = await fetch(`${config.webex.apiBase}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create webhook "${name}" failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Registers OOO webhooks: @mentions and direct messages.
 * @param {string} accessToken
 */
export async function registerOooWebhooks(accessToken) {
  const secret = config.webex.webhookSecret ?? crypto.randomBytes(32).toString("hex");
  const [mentioned, direct] = await Promise.all([
    createMessageWebhook(accessToken, {
      name: "ooo-mentioned",
      filter: "mentionedPeople=me",
      secret,
    }),
    createMessageWebhook(accessToken, {
      name: "ooo-direct",
      filter: "roomType=direct",
      secret,
    }),
  ]);
  return { mentioned, direct, targetUrl: config.webex.webhookTargetUrl, secretFromEnv: Boolean(config.webex.webhookSecret) };
}
