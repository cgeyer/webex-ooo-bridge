import { config } from "./config.js";

/**
 * @param {string} accessToken
 * @param {string} [personId] defaults to "me"
 */
export async function getWebexPerson(accessToken, personId = "me") {
  const url = `${config.webex.apiBase}/people/${personId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex /people: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {string} roomId
 * @param {string} markdown
 */
export async function postMessage(accessToken, roomId, markdown) {
  const res = await fetch(`${config.webex.apiBase}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, markdown }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex POST /messages: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {string} [messageId]
 */
export async function getMessage(accessToken, messageId) {
  const res = await fetch(`${config.webex.apiBase}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex GET /messages: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * @param {string} accessToken
 * @param {string} [personId]
 */
export async function getPersonById(accessToken, personId) {
  const res = await fetch(`${config.webex.apiBase}/people/${personId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex GET /people: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * @param {string} email
 * @param {string} [domain] primary domain to compare
 */
export function isExternalEmail(email, domain) {
  if (!email || !domain) return true;
  const at = email.lastIndexOf("@");
  if (at < 0) return true;
  const senderDomain = email.slice(at + 1).toLowerCase();
  return senderDomain !== domain.toLowerCase();
}

/**
 * @param {string} accessToken
 * @param {string} [name]
 * @param {string} [targetUrl] must be registered; often PUBLIC_BASE + path
 * @param {string} [secret]
 * @param {string} [resource] e.g. "messages"
 * @param {string} [event] e.g. "created"
 */
export async function createWebhook(
  accessToken,
  { name = "ooo-messages", targetUrl, secret, resource = "messages", event = "created" } = {}
) {
  const res = await fetch(`${config.webex.apiBase}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, targetUrl, resource, event, secret }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webex POST /webhooks: ${res.status} ${text}`);
  }
  return res.json();
}
