import crypto from "node:crypto";

/** @type {Map<string, { codeVerifier: string, enableOoo: boolean, oooMessage: string, created: number }>} */
const store = new Map();
const TTL_MS = 15 * 60 * 1000;

/**
 * @param {string} codeVerifier
 * @param {{ enableOoo?: boolean, oooMessage?: string }} [options]
 * @returns {string} state id
 */
export function savePkceState(codeVerifier, options = {}) {
  cleanup();
  const id = crypto.randomBytes(24).toString("base64url");
  store.set(id, {
    codeVerifier,
    enableOoo: Boolean(options.enableOoo),
    oooMessage: String(options.oooMessage ?? ""),
    created: Date.now(),
  });
  return id;
}

/**
 * @param {string} stateId
 * @returns {{ codeVerifier: string, enableOoo: boolean, oooMessage: string } | null}
 */
export function takePkceState(stateId) {
  const v = store.get(stateId);
  if (!v) return null;
  store.delete(stateId);
  if (Date.now() - v.created > TTL_MS) return null;
  return {
    codeVerifier: v.codeVerifier,
    enableOoo: v.enableOoo,
    oooMessage: v.oooMessage,
  };
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.created > TTL_MS) store.delete(k);
  }
}
