import fs from "node:fs";
import path from "node:path";
import { JSONFilePreset } from "lowdb/node";
import { config } from "./config.js";

const file = path.isAbsolute(config.databasePath)
  ? config.databasePath
  : path.join(process.cwd(), config.databasePath);
const dir = path.dirname(file);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const defaultData = { users: [] };

const db = await JSONFilePreset(file, defaultData);

/**
 * @param {string} webexPersonId
 */
function findByWebexPersonId(webexPersonId) {
  return db.data.users.find((u) => u.webexPersonId === webexPersonId);
}

/**
 * @param {string} token
 */
function findByIngestToken(token) {
  return db.data.users.find((u) => u.webexIngestToken === token);
}

/**
 * @param {object} row
 * @param {string} row.webexPersonId
 * @param {string | null} [row.email]
 * @param {string | null} [row.homeDomain]
 * @param {string | null} [row.webexTokenEnc]
 * @param {string | null} [row.webexRefreshEnc]
 * @param {number | null} [row.webexTokenExpiresAt]
 * @param {string | null} [row.webexIngestToken]
 * @param {string | null} [row.webexWebhookId]
 * @param {string | null} [row.msTokenEnc]
 * @param {string | null} [row.msRefreshEnc]
 * @param {number | null} [row.msTokenExpiresAt]
 * @param {string | null} [row.preferencesJson]
 */
export async function upsertUser(row) {
  const existing = findByWebexPersonId(row.webexPersonId);
  if (!existing) {
    const rec = {
      id: nextId(),
      webexPersonId: row.webexPersonId,
      email: row.email ?? null,
      homeDomain: row.homeDomain ?? null,
      webexTokenEnc: row.webexTokenEnc ?? null,
      webexRefreshEnc: row.webexRefreshEnc ?? null,
      webexTokenExpiresAt: row.webexTokenExpiresAt ?? null,
      webexIngestToken: row.webexIngestToken ?? null,
      webexWebhookId: row.webexWebhookId ?? null,
      msTokenEnc: row.msTokenEnc ?? null,
      msRefreshEnc: row.msRefreshEnc ?? null,
      msTokenExpiresAt: row.msTokenExpiresAt ?? null,
      preferencesJson: row.preferencesJson ?? null,
    };
    db.data.users.push(rec);
  } else {
    if (row.email != null) existing.email = row.email;
    if (row.homeDomain != null) existing.homeDomain = row.homeDomain;
    if (row.webexTokenEnc != null) existing.webexTokenEnc = row.webexTokenEnc;
    if (row.webexRefreshEnc != null) existing.webexRefreshEnc = row.webexRefreshEnc;
    if (row.webexTokenExpiresAt != null) existing.webexTokenExpiresAt = row.webexTokenExpiresAt;
    if (row.webexIngestToken != null) existing.webexIngestToken = row.webexIngestToken;
    if (row.webexWebhookId != null) existing.webexWebhookId = row.webexWebhookId;
    if (row.msTokenEnc != null) existing.msTokenEnc = row.msTokenEnc;
    if (row.msRefreshEnc != null) existing.msRefreshEnc = row.msRefreshEnc;
    if (row.msTokenExpiresAt != null) existing.msTokenExpiresAt = row.msTokenExpiresAt;
    if (row.preferencesJson != null) existing.preferencesJson = row.preferencesJson;
  }
  await db.write();
}

function nextId() {
  if (db.data.users.length === 0) return 1;
  return Math.max(...db.data.users.map((u) => u.id)) + 1;
}

/**
 * @param {string} webexPersonId
 */
export function getUserByWebexPersonId(webexPersonId) {
  const u = findByWebexPersonId(webexPersonId);
  if (!u) return undefined;
  return toDbRow(u);
}

/**
 * @param {string} token
 */
export function getUserByIngestToken(token) {
  const u = findByIngestToken(token);
  if (!u) return undefined;
  return toDbRow(u);
}

/**
 * @param {object} u
 */
function toDbRow(u) {
  return {
    id: u.id,
    webex_person_id: u.webexPersonId,
    email: u.email,
    home_domain: u.homeDomain,
    webex_token_enc: u.webexTokenEnc,
    webex_refresh_enc: u.webexRefreshEnc,
    webex_token_expires_at: u.webexTokenExpiresAt,
    webex_ingest_token: u.webexIngestToken,
    webex_webhook_id: u.webexWebhookId,
    ms_token_enc: u.msTokenEnc,
    ms_refresh_enc: u.msRefreshEnc,
    ms_token_expires_at: u.msTokenExpiresAt,
    preferences_json: u.preferencesJson,
  };
}

/**
 * @param {number} id
 * @param {string} json
 */
export async function updateUserPreferences(id, json) {
  const u = db.data.users.find((x) => x.id === id);
  if (u) {
    u.preferencesJson = json;
    await db.write();
  }
}
