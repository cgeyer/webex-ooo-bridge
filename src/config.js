import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  WEBEX_CLIENT_ID: z.string().min(1),
  WEBEX_CLIENT_SECRET: z.string().min(1),
  WEBEX_REDIRECT_URI: z.string().url(),
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
    authorizeUrl: "https://webexapis.com/v1/authorize",
    tokenUrl: "https://webexapis.com/v1/access_token",
    apiBase: "https://webexapis.com/v1",
  },
  port: data.PORT,
  logLevel: data.LOG_LEVEL,
};

/** Scopes for login + send 1:1 message (toPersonEmail on create message). */
export const WEBEX_SCOPES = ["spark:kms", "spark:messages_write"].join(" ");
