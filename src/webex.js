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
 * Create a 1:1 message via POST /messages using toPersonEmail (works across orgs).
 * @see https://developer.webex.com/docs/api/v1/messages/create-a-message
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
