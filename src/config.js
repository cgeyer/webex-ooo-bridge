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
  WEBEX_STATE_PATH: z.string().default("./data/state.json"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

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
  },
  statePath: data.WEBEX_STATE_PATH,
  port: data.PORT,
  logLevel: data.LOG_LEVEL,
};

/** Scopes: messages, people, webhooks, and KMS for encrypted content. */
export const WEBEX_SCOPES = [
  "spark:kms",
  "spark:messages_write",
  "spark:messages_read",
  "spark:webhooks_read",
  "spark:webhooks_write",
  "spark:people_read"
].join(" ");
