import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const stateFile = path.isAbsolute(config.statePath)
  ? config.statePath
  : path.join(process.cwd(), config.statePath);

/** @typedef {{ personId: string, email: string, accessToken: string, refreshToken: string, accessTokenExpiresAt: number, enableOoo: boolean, oooMessage: string, webhookIds: string[] }} UserState */

function ensureFile() {
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({ users: [] }, null, 2), "utf8");
  }
}

function readState() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

function writeState(state) {
  ensureFile();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

/**
 * @param {UserState} user
 */
export function upsertUserState(user) {
  const state = readState();
  const idx = state.users.findIndex((u) => u.personId === user.personId);
  if (idx >= 0) state.users[idx] = user;
  else state.users.push(user);
  writeState(state);
}

/**
 * @param {string} personId
 */
export function getUserByPersonId(personId) {
  const state = readState();
  return state.users.find((u) => u.personId === personId) ?? null;
}

/**
 * @param {string} webhookId
 */
export function getUserByWebhookId(webhookId) {
  const state = readState();
  return state.users.find((u) => u.webhookIds?.includes(webhookId)) ?? null;
}
