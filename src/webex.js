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
 * @param {string} refreshToken
 */
export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.webex.clientId,
    client_secret: config.webex.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(config.webex.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Refresh token failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 */
export async function getMe(accessToken) {
  const res = await fetch(`${config.webex.apiBase}/people/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Get profile failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Get Person Details — https://developer.webex.com/messaging/docs/api/v1/people/get-person-details
 * @param {string} accessToken
 * @param {string} personId
 */
export async function getPersonDetails(accessToken, personId) {
  const res = await fetch(`${config.webex.apiBase}/people/${encodeURIComponent(personId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Get person details failed: ${res.status} ${await res.text()}`);
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

/**
 * @param {string} accessToken
 */
export async function listWebhooks(accessToken) {
  const res = await fetch(`${config.webex.apiBase}/webhooks`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`List webhooks failed: ${res.status} ${await res.text()}`);
  const out = await res.json();
  return out.items ?? [];
}

/**
 * @param {string} accessToken
 * @param {string} webhookId
 */
export async function deleteWebhook(accessToken, webhookId) {
  const res = await fetch(`${config.webex.apiBase}/webhooks/${webhookId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Delete webhook ${webhookId} failed: ${res.status} ${await res.text()}`);
}

/**
 * @param {string} accessToken
 */
export async function deregisterAllWebhooks(accessToken) {
  const hooks = await listWebhooks(accessToken);
  await Promise.all(hooks.map((h) => deleteWebhook(accessToken, h.id)));
  return hooks.map((h) => h.id);
}

/**
 * Get Room Details — https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details
 * @param {string} accessToken
 * @param {string} roomId
 */
export async function getRoomDetails(accessToken, roomId) {
  const res = await fetch(`${config.webex.apiBase}/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Get room details failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {string} messageId
 */
export async function getMessage(accessToken, messageId) {
  const res = await fetch(`${config.webex.apiBase}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Get message failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {{ roomId: string, text: string, parentId?: string }} input
 */
export async function sendRoomMessage(accessToken, input) {
  const payload = {
    roomId: input.roomId,
    text: input.text,
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
  const res = await fetch(`${config.webex.apiBase}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Send room message failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create a Message — https://developer.webex.com/messaging/docs/api/v1/messages/create-a-message
 * @param {{ toPersonEmail: string, text?: string, markdown?: string }} input
 */
export async function sendBotDirectMessage(input) {
  const botToken = config.webex.botToken;
  if (!botToken) {
    throw new Error("WEBEX_BOT_TOKEN is not configured");
  }
  const payload = {
    toPersonEmail: input.toPersonEmail,
    ...(input.markdown ? { markdown: input.markdown } : { text: input.text ?? "" }),
  };
  const res = await fetch(`${config.webex.apiBase}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Send bot direct message failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
