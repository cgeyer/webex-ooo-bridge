import crypto from "node:crypto";
import { config } from "./config.js";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey() {
  const b64 = config.encryptionKeyB64;
  if (!b64) {
    throw new Error("ENCRYPTION_KEY is not set; cannot store tokens securely.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (base64-encoded).");
  }
  return key;
}

/**
 * @param {string} plaintext
 * @returns {string} base64(iv + ciphertext + tag)
 */
export function encryptString(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

/**
 * @param {string} packedB64
 * @returns {string}
 */
export function decryptString(packedB64) {
  const key = getKey();
  const buf = Buffer.from(packedB64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - AUTH_TAG_LEN);
  const data = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
