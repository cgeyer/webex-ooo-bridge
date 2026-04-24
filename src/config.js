import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  WEBEX_CLIENT_ID: z.string().min(1),
  WEBEX_CLIENT_SECRET: z.string().min(1),
  WEBEX_REDIRECT_URI: z.string().url(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  MS_CLIENT_ID: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().min(1).optional()),
  MS_CLIENT_SECRET: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().min(1).optional()),
  MS_TENANT: z.string().default("common"),
  MS_REDIRECT_URI: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().url().optional()),
  ENCRYPTION_KEY: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/app.json"),
  WEBEX_WEBHOOK_SECRET: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;
const publicBase = data.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const config = {
  webex: {
    clientId: data.WEBEX_CLIENT_ID,
    clientSecret: data.WEBEX_CLIENT_SECRET,
    redirectUri: data.WEBEX_REDIRECT_URI,
    authorizeUrl: "https://webexapis.com/v1/authorize",
    tokenUrl: "https://webexapis.com/v1/access_token",
    apiBase: "https://webexapis.com/v1",
  },
  ms: {
    clientId: data.MS_CLIENT_ID,
    clientSecret: data.MS_CLIENT_SECRET,
    tenant: data.MS_TENANT,
    redirectUri: data.MS_REDIRECT_URI || undefined,
    graphScope: "offline_access openid profile MailboxSettings.Read",
  },
  publicBaseUrl: publicBase,
  encryptionKeyB64: data.ENCRYPTION_KEY,
  databasePath: data.DATABASE_PATH,
  webexWebhookSecret: data.WEBEX_WEBHOOK_SECRET,
  port: data.PORT,
  logLevel: data.LOG_LEVEL,
};

export function isMsConfigured() {
  return Boolean(config.ms.clientId && config.ms.clientSecret && config.ms.redirectUri);
}
