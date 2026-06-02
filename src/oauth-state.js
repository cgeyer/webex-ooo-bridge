import crypto from "node:crypto";

/** @typedef {{ codeVerifier: string, created: number, personId?: string, flow?: string }} PkceStateRecord */

/** @type {Map<string, PkceStateRecord>} */
const store = new Map();
const TTL_MS = 15 * 60 * 1000;

/**
 * @param {string} codeVerifier
 * @param {{ personId?: string, flow?: string }} [meta]
 * @returns {string} state id
 */
export function savePkceState(codeVerifier, meta = {}) {
  cleanup();
  const id = crypto.randomBytes(24).toString("base64url");
  store.set(id, { codeVerifier, created: Date.now(), ...meta });
  return id;
}

/**
 * @param {string} stateId
 * @returns {PkceStateRecord | null}
 */
export function takePkceState(stateId) {
  const record = store.get(stateId);
  if (!record) return null;
  store.delete(stateId);
  if (Date.now() - record.created > TTL_MS) return null;
  return record;
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.created > TTL_MS) store.delete(k);
  }
}
