import crypto from "node:crypto";

/** @type {Map<string, { codeVerifier: string, created: number }>} */
const store = new Map();
const TTL_MS = 15 * 60 * 1000;

/**
 * @param {string} codeVerifier
 * @returns {string} state id
 */
export function savePkceState(codeVerifier) {
  cleanup();
  const id = crypto.randomBytes(24).toString("base64url");
  store.set(id, { codeVerifier, created: Date.now() });
  return id;
}

/**
 * @param {string} stateId
 * @returns {string | null} codeVerifier
 */
export function takePkceState(stateId) {
  const v = store.get(stateId);
  if (!v) return null;
  store.delete(stateId);
  if (Date.now() - v.created > TTL_MS) return null;
  return v.codeVerifier;
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.created > TTL_MS) store.delete(k);
  }
}
