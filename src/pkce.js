import crypto from "node:crypto";

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * @param {number} [length=64]
 * @returns {string}
 */
export function generateCodeVerifier(length = 64) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += UNRESERVED[bytes[i] % UNRESERVED.length];
  }
  return out;
}

/**
 * @param {string} codeVerifier
 * @returns {string} base64url S256 code_challenge
 */
export function codeChallengeS256(codeVerifier) {
  const hash = crypto.createHash("sha256").update(codeVerifier, "ascii").digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
