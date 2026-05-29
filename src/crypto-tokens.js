import crypto from "node:crypto";
import { config } from "./config.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * @param {string} plaintext
 */
export function encryptToken(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, config.encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * @param {string} ciphertext
 */
export function decryptToken(ciphertext) {
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid encrypted token payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, config.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
