import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  WEBEX_CLIENT_ID: z.string().min(1),
  WEBEX_CLIENT_SECRET: z.string().min(1),
  WEBEX_REDIRECT_URI: z.string().url(),
  WEBEX_WEBHOOK_TARGET_URL: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().url().optional()),
  WEBEX_WEBHOOK_SECRET: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().min(1).optional()),
  DB_PATH: z.string().default("./data/app.db"),
  ENCRYPTION_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SECURE_COOKIES: z
    .preprocess((v) => v === "true" || v === "1", z.boolean())
    .default(false),
  PORT: z.coerce.number().default(3000),
  LISTEN_HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  WEBEX_BOT_TOKEN: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().min(1).optional()),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

function parseKey32(name, value) {
  let buf = Buffer.from(value, "base64");
  if (buf.length !== 32) {
    buf = Buffer.from(value, "hex");
  }
  if (buf.length !== 32) {
    console.error(`${name} must decode to 32 bytes (generate with: openssl rand -base64 32)`);
    process.exit(1);
  }
  return buf;
}

export const config = {
  webex: {
    clientId: data.WEBEX_CLIENT_ID,
    clientSecret: data.WEBEX_CLIENT_SECRET,
    redirectUri: data.WEBEX_REDIRECT_URI,
    webhookTargetUrl: data.WEBEX_WEBHOOK_TARGET_URL,
    webhookSecret: data.WEBEX_WEBHOOK_SECRET,
    authorizeUrl: "https://webexapis.com/v1/authorize",
    tokenUrl: "https://webexapis.com/v1/access_token",
    apiBase: "https://webexapis.com/v1",
    botToken: data.WEBEX_BOT_TOKEN,
  },
  dbPath: data.DB_PATH,
  encryptionKey: parseKey32("ENCRYPTION_KEY", data.ENCRYPTION_KEY),
  sessionSecret: data.SESSION_SECRET,
  secureCookies: data.SECURE_COOKIES,
  port: data.PORT,
  listenHost: data.LISTEN_HOST,
  logLevel: data.LOG_LEVEL,
};

/** Scopes: messages, people, webhooks, and KMS for encrypted content. */
export const WEBEX_SCOPES = [
  "spark:kms",
  "spark:messages_write",
  "spark:messages_read",
  "spark:webhooks_read",
  "spark:webhooks_write",
  "spark:people_read",
  "spark:rooms_read",
].join(" ");
