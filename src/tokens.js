import { config } from "./config.js";
import { decryptString, encryptString } from "./crypto-tokens.js";

/**
 * @param {string} refreshToken
 */
export async function refreshWebexToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.webex.clientId,
    client_secret: config.webex.clientSecret,
  });
  const res = await fetch(config.webex.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Webex refresh: ${res.status} ${t}`);
  }
  return res.json();
}

/**
 * @param {string} refreshToken
 */
export async function refreshMsToken(refreshToken) {
  const tenant = config.ms.tenant;
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.ms.clientId,
    client_secret: config.ms.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: config.ms.graphScope,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`MS refresh: ${res.status} ${t}`);
  }
  return res.json();
}

/** @typedef {{ id: number, webex_person_id: string, webex_token_enc: string, webex_refresh_enc: string, webex_token_expires_at: number, ms_token_enc?: string, ms_refresh_enc?: string, ms_token_expires_at?: number }} UserRow */

/**
 * @param {UserRow} user
 * @param {import('pino').Logger} log
 */
export async function ensureWebexAccessToken(user, log) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (user.webex_token_enc && user.webex_token_expires_at && user.webex_token_expires_at > nowSec + 120) {
    return decryptString(user.webex_token_enc);
  }
  const rt = decryptString(user.webex_refresh_enc);
  const out = await refreshWebexToken(rt);
  const access = out.access_token;
  const refresh = out.refresh_token ?? rt;
  const exp = nowSec + (out.expires_in ?? 3600);
  const { upsertUser } = await import("./db.js");
  await upsertUser({
    webexPersonId: user.webex_person_id,
    webexTokenEnc: encryptString(access),
    webexRefreshEnc: encryptString(refresh),
    webexTokenExpiresAt: exp,
  });
  log.info({ sub: user.webex_person_id }, "refreshed Webex access token");
  return access;
}

/**
 * @param {UserRow} user
 * @param {import('pino').Logger} log
 */
export async function ensureMsAccessToken(user, log) {
  if (!user.ms_refresh_enc) {
    throw new Error("Microsoft account not linked; complete /auth/ms first.");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (user.ms_token_enc && user.ms_token_expires_at && user.ms_token_expires_at > nowSec + 120) {
    return decryptString(user.ms_token_enc);
  }
  const rt = decryptString(user.ms_refresh_enc);
  const out = await refreshMsToken(rt);
  const access = out.access_token;
  const refresh = out.refresh_token ?? rt;
  const exp = nowSec + (out.expires_in ?? 3600);
  const { upsertUser } = await import("./db.js");
  await upsertUser({
    webexPersonId: user.webex_person_id,
    msTokenEnc: encryptString(access),
    msRefreshEnc: encryptString(refresh),
    msTokenExpiresAt: exp,
  });
  log.info({ sub: user.webex_person_id }, "refreshed Microsoft access token");
  return access;
}
