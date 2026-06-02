import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { decryptToken, encryptToken } from "./crypto-tokens.js";
import { isExchangeSyncEligible } from "./exchange-eligibility.js";

const dbFile = path.isAbsolute(config.dbPath) ? config.dbPath : path.join(process.cwd(), config.dbPath);

/** @typedef {{
 *   personId: string,
 *   email: string,
 *   displayName: string,
 *   accessToken: string,
 *   refreshToken: string,
 *   accessTokenExpiresAt: number,
 *   enableOoo: boolean,
 *   oooMessage: string,
 *   sendOooToColleagues: boolean,
 *   useSameColleagueMessage: boolean,
 *   internalOooMessage: string,
 *   notifyIncomingMessages: boolean,
 *   hasOooEndDate: boolean,
 *   oooEndDate: string,
 *   oooEndTime: string,
 *   oooEndTimezone: string,
 *   useExchangeOoo: boolean,
 *   graphAccessToken: string,
 *   graphRefreshToken: string,
 *   graphAccessTokenExpiresAt: number,
 *   webhookIds: string[],
 *   createdAt: number,
 *   updatedAt: number,
 * }} UserRecord */

/** @typedef {{
 *   personId: string,
 *   email: string,
 *   displayName: string,
 *   enableOoo: boolean,
 *   oooMessage: string,
 *   sendOooToColleagues: boolean,
 *   useSameColleagueMessage: boolean,
 *   internalOooMessage: string,
 *   notifyIncomingMessages: boolean,
 *   hasOooEndDate: boolean,
 *   oooEndDate: string,
 *   oooEndTime: string,
 *   oooEndTimezone: string,
 *   exchangeSyncEligible: boolean,
 *   exchangeSyncAvailable: boolean,
 *   useExchangeOoo: boolean,
 *   graphConnected: boolean,
 *   webhookIds: string[],
 *   createdAt: number,
 *   updatedAt: number,
 * }} UserProfile */

/** @type {DatabaseSync | null} */
let db = null;

function ensureDb() {
  if (db) return db;
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(dbFile);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
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
  migrateUsersTable(db);
  return db;
}

/** @param {DatabaseSync} conn */
function migrateUsersTable(conn) {
  const addColumn = (sql) => {
    try {
      conn.exec(sql);
    } catch {
      // Column already exists.
    }
  };
  addColumn("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN send_ooo_to_colleagues INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE users ADD COLUMN use_same_colleague_message INTEGER NOT NULL DEFAULT 1");
  addColumn("ALTER TABLE users ADD COLUMN internal_ooo_message TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN notify_incoming_messages INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE users ADD COLUMN has_ooo_end_date INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE users ADD COLUMN ooo_end_date TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN ooo_end_time TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN ooo_end_timezone TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN use_exchange_ooo INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE users ADD COLUMN graph_access_token_enc TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN graph_refresh_token_enc TEXT NOT NULL DEFAULT ''");
  addColumn("ALTER TABLE users ADD COLUMN graph_access_token_expires_at INTEGER NOT NULL DEFAULT 0");
}

/**
 * @param {Record<string, unknown>} row
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
    displayName: String(row.display_name ?? ""),
    accessToken: decryptToken(String(row.access_token_enc)),
    refreshToken: decryptToken(String(row.refresh_token_enc)),
    accessTokenExpiresAt: Number(row.access_token_expires_at),
    enableOoo: Boolean(row.enable_ooo),
    oooMessage: String(row.ooo_message),
    sendOooToColleagues: Boolean(row.send_ooo_to_colleagues),
    useSameColleagueMessage: row.use_same_colleague_message === undefined ? true : Boolean(row.use_same_colleague_message),
    internalOooMessage: String(row.internal_ooo_message ?? ""),
    notifyIncomingMessages: Boolean(row.notify_incoming_messages),
    hasOooEndDate: Boolean(row.has_ooo_end_date),
    oooEndDate: String(row.ooo_end_date ?? ""),
    oooEndTime: String(row.ooo_end_time ?? ""),
    oooEndTimezone: String(row.ooo_end_timezone ?? ""),
    useExchangeOoo: Boolean(row.use_exchange_ooo),
    graphAccessToken:
      String(row.graph_access_token_enc ?? "") !== ""
        ? decryptToken(String(row.graph_access_token_enc))
        : "",
    graphRefreshToken:
      String(row.graph_refresh_token_enc ?? "") !== ""
        ? decryptToken(String(row.graph_refresh_token_enc))
        : "",
    graphAccessTokenExpiresAt: Number(row.graph_access_token_expires_at ?? 0),
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
  const exchangeSyncEligible = isExchangeSyncEligible(user.email);
  return {
    personId: user.personId,
    email: user.email,
    displayName: user.displayName,
    exchangeSyncEligible,
    exchangeSyncAvailable: exchangeSyncEligible && config.exchangeSync.enabled,
    useExchangeOoo: user.useExchangeOoo,
    graphConnected: Boolean(user.graphRefreshToken?.trim()),
    enableOoo: user.enableOoo,
    oooMessage: user.oooMessage,
    sendOooToColleagues: user.sendOooToColleagues,
    useSameColleagueMessage: user.useSameColleagueMessage,
    internalOooMessage: user.internalOooMessage,
    notifyIncomingMessages: user.notifyIncomingMessages,
    hasOooEndDate: user.hasOooEndDate,
    oooEndDate: user.oooEndDate,
    oooEndTime: user.oooEndTime,
    oooEndTimezone: user.oooEndTimezone,
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
        person_id, email, display_name, access_token_enc, refresh_token_enc, access_token_expires_at,
        enable_ooo, ooo_message, send_ooo_to_colleagues, use_same_colleague_message, internal_ooo_message,
        notify_incoming_messages, has_ooo_end_date, ooo_end_date, ooo_end_time, ooo_end_timezone,
        use_exchange_ooo, graph_access_token_enc, graph_refresh_token_enc, graph_access_token_expires_at,
        webhook_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(person_id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        access_token_expires_at = excluded.access_token_expires_at,
        enable_ooo = excluded.enable_ooo,
        ooo_message = excluded.ooo_message,
        send_ooo_to_colleagues = excluded.send_ooo_to_colleagues,
        use_same_colleague_message = excluded.use_same_colleague_message,
        internal_ooo_message = excluded.internal_ooo_message,
        notify_incoming_messages = excluded.notify_incoming_messages,
        has_ooo_end_date = excluded.has_ooo_end_date,
        ooo_end_date = excluded.ooo_end_date,
        ooo_end_time = excluded.ooo_end_time,
        ooo_end_timezone = excluded.ooo_end_timezone,
        use_exchange_ooo = excluded.use_exchange_ooo,
        graph_access_token_enc = excluded.graph_access_token_enc,
        graph_refresh_token_enc = excluded.graph_refresh_token_enc,
        graph_access_token_expires_at = excluded.graph_access_token_expires_at,
        webhook_ids_json = excluded.webhook_ids_json,
        updated_at = excluded.updated_at`
    )
    .run(
      user.personId,
      user.email,
      user.displayName ?? "",
      encryptToken(user.accessToken),
      encryptToken(user.refreshToken),
      user.accessTokenExpiresAt,
      user.enableOoo ? 1 : 0,
      user.oooMessage,
      user.sendOooToColleagues ? 1 : 0,
      user.useSameColleagueMessage !== false ? 1 : 0,
      user.internalOooMessage ?? "",
      user.notifyIncomingMessages ? 1 : 0,
      user.hasOooEndDate ? 1 : 0,
      user.oooEndDate ?? "",
      user.oooEndTime ?? "",
      user.oooEndTimezone ?? "",
      user.useExchangeOoo ? 1 : 0,
      user.graphAccessToken ? encryptToken(user.graphAccessToken) : "",
      user.graphRefreshToken ? encryptToken(user.graphRefreshToken) : "",
      user.graphAccessTokenExpiresAt ?? 0,
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
