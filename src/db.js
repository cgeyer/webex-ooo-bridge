import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { decryptToken, encryptToken } from "./crypto-tokens.js";

const dbFile = path.isAbsolute(config.dbPath) ? config.dbPath : path.join(process.cwd(), config.dbPath);

/** @typedef {{
 *   personId: string,
 *   email: string,
 *   accessToken: string,
 *   refreshToken: string,
 *   accessTokenExpiresAt: number,
 *   enableOoo: boolean,
 *   oooMessage: string,
 *   webhookIds: string[],
 *   createdAt: number,
 *   updatedAt: number,
 * }} UserRecord */

/** @typedef {{
 *   personId: string,
 *   email: string,
 *   enableOoo: boolean,
 *   oooMessage: string,
 *   webhookIds: string[],
 *   createdAt: number,
 *   updatedAt: number,
 * }} UserProfile */

let db;

function ensureDb() {
  if (db) return db;
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      person_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      access_token_expires_at INTEGER NOT NULL,
      enable_ooo INTEGER NOT NULL DEFAULT 0,
      ooo_message TEXT NOT NULL DEFAULT '',
      webhook_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES users(person_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  return db;
}

/**
 * @param {object} row
 * @returns {UserRecord}
 */
function rowToUser(row) {
  let webhookIds = [];
  try {
    const parsed = JSON.parse(String(row.webhook_ids_json));
    webhookIds = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    webhookIds = [];
  }
  return {
    personId: String(row.person_id),
    email: String(row.email),
    accessToken: decryptToken(String(row.access_token_enc)),
    refreshToken: decryptToken(String(row.refresh_token_enc)),
    accessTokenExpiresAt: Number(row.access_token_expires_at),
    enableOoo: Boolean(row.enable_ooo),
    oooMessage: String(row.ooo_message),
    webhookIds,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * @param {UserRecord} user
 * @returns {UserProfile}
 */
export function toUserProfile(user) {
  return {
    personId: user.personId,
    email: user.email,
    enableOoo: user.enableOoo,
    oooMessage: user.oooMessage,
    webhookIds: user.webhookIds,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * @param {Omit<UserRecord, "createdAt" | "updatedAt"> & { createdAt?: number, updatedAt?: number }} user
 */
export function upsertUser(user) {
  const conn = ensureDb();
  const now = Math.floor(Date.now() / 1000);
  const existing = getUserByPersonId(user.personId);
  const createdAt = user.createdAt ?? existing?.createdAt ?? now;
  const updatedAt = user.updatedAt ?? now;

  conn
    .prepare(
      `INSERT INTO users (
        person_id, email, access_token_enc, refresh_token_enc, access_token_expires_at,
        enable_ooo, ooo_message, webhook_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(person_id) DO UPDATE SET
        email = excluded.email,
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        access_token_expires_at = excluded.access_token_expires_at,
        enable_ooo = excluded.enable_ooo,
        ooo_message = excluded.ooo_message,
        webhook_ids_json = excluded.webhook_ids_json,
        updated_at = excluded.updated_at`
    )
    .run(
      user.personId,
      user.email,
      encryptToken(user.accessToken),
      encryptToken(user.refreshToken),
      user.accessTokenExpiresAt,
      user.enableOoo ? 1 : 0,
      user.oooMessage,
      JSON.stringify(user.webhookIds ?? []),
      createdAt,
      updatedAt
    );
}

/**
 * @param {string} personId
 * @returns {UserRecord | null}
 */
export function getUserByPersonId(personId) {
  const conn = ensureDb();
  const row = conn.prepare("SELECT * FROM users WHERE person_id = ?").get(personId);
  return row ? rowToUser(row) : null;
}

/**
 * @param {string} webhookId
 * @returns {UserRecord | null}
 */
export function getUserByWebhookId(webhookId) {
  const conn = ensureDb();
  const rows = conn.prepare("SELECT * FROM users").all();
  for (const row of rows) {
    const user = rowToUser(row);
    if (user.webhookIds.includes(webhookId)) return user;
  }
  return null;
}

/**
 * @param {string} sessionId
 * @param {string} personId
 * @param {number} expiresAt Unix seconds
 */
export function createSession(sessionId, personId, expiresAt) {
  const conn = ensureDb();
  conn.prepare("INSERT INTO sessions (id, person_id, expires_at) VALUES (?, ?, ?)").run(
    sessionId,
    personId,
    expiresAt
  );
}

/**
 * @param {string} sessionId
 * @returns {{ personId: string, expiresAt: number } | null}
 */
export function getSession(sessionId) {
  const conn = ensureDb();
  cleanupExpiredSessions();
  const row = conn.prepare("SELECT person_id, expires_at FROM sessions WHERE id = ?").get(sessionId);
  if (!row) return null;
  return { personId: String(row.person_id), expiresAt: Number(row.expires_at) };
}

/**
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  const conn = ensureDb();
  conn.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/**
 * @param {string} personId
 */
export function deleteSessionsForPerson(personId) {
  const conn = ensureDb();
  conn.prepare("DELETE FROM sessions WHERE person_id = ?").run(personId);
}

function cleanupExpiredSessions() {
  const conn = ensureDb();
  const now = Math.floor(Date.now() / 1000);
  conn.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}
