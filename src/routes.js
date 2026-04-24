import crypto from "node:crypto";
import express from "express";
import { config, isMsConfigured } from "./config.js";
import { encryptString } from "./crypto-tokens.js";
import { getUserByIngestToken, upsertUser } from "./db.js";
import { extractExternalOooText, getMailboxSettings } from "./graph-ooo.js";
import { savePkceState, takePkceState } from "./oauth-state.js";
import { codeChallengeS256, generateCodeVerifier } from "./pkce.js";
import { ensureMsAccessToken, ensureWebexAccessToken } from "./tokens.js";
import {
  createWebhook,
  getMessage,
  getPersonById,
  getWebexPerson,
  isExternalEmail,
  postMessage,
} from "./webex-api.js";

const WEBEX_SCOPES = [
  "spark:kms",
  "spark:messages_read",
  "spark:messages_write",
  "spark:rooms_read",
  "spark:people_read",
  "spark:memberships_read",
  "openid",
  "email",
  "profile",
].join(" ");

/**
 * @param {import('pino').Logger} log
 */
export function buildRouter(log) {
  const r = express.Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/auth/webex", (req, res) => {
    const verifier = generateCodeVerifier(64);
    const challenge = codeChallengeS256(verifier);
    const state = savePkceState(verifier);
    const url = new URL(config.webex.authorizeUrl);
    url.searchParams.set("client_id", config.webex.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", config.webex.redirectUri);
    url.searchParams.set("scope", WEBEX_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(302, url.toString());
  });

  r.get("/webex/callback", async (req, res) => {
    const err = req.query.error;
    if (err) {
      log.warn({ err }, "Webex OAuth error");
      return res.status(400).send(String(req.query.error_description || err));
    }
    const code = req.query.code;
    const state = req.query.state;
    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Missing code or state");
    }
    const verifier = takePkceState(state);
    if (!verifier) {
      return res.status(400).send("Invalid or expired state");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.webex.clientId,
      client_secret: config.webex.clientSecret,
      code,
      redirect_uri: config.webex.redirectUri,
      code_verifier: verifier,
    });
    const tr = await fetch(config.webex.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tr.ok) {
      const t = await tr.text();
      log.error({ t }, "Webex token exchange failed");
      return res.status(500).send("Token exchange failed");
    }
    const tokenJson = await tr.json();
    const access = tokenJson.access_token;
    const refresh = tokenJson.refresh_token;
    const expSec = Math.floor(Date.now() / 1000) + (tokenJson.expires_in ?? 0);
    const me = await getWebexPerson(access, "me");
    const email = me.emails?.[0] ?? me.email ?? null;
    const homeDomain = email?.includes("@") ? email.split("@").pop() : null;
    const ingest = crypto.randomBytes(24).toString("base64url");

    await upsertUser({
      webexPersonId: me.id,
      email,
      homeDomain,
      webexTokenEnc: encryptString(access),
      webexRefreshEnc: encryptString(refresh),
      webexTokenExpiresAt: expSec,
      webexIngestToken: ingest,
    });

    if (isMsConfigured()) {
      return res.redirect(302, `${config.publicBaseUrl}/auth/ms?pid=${encodeURIComponent(me.id)}`);
    }

    return res.type("html").send(donePage(me.id, ingest, false));
  });

  r.get("/auth/ms", (req, res) => {
    if (!isMsConfigured()) {
      return res.status(500).send("Microsoft OAuth is not configured");
    }
    const pid = req.query.pid;
    if (typeof pid !== "string" || !pid) {
      return res.status(400).send("Missing pid (complete Webex auth first)");
    }
    const verifier = generateCodeVerifier(64);
    const challenge = codeChallengeS256(verifier);
    const state = savePkceState(verifier);
    const mstate = JSON.stringify({ kind: "ms", webexPersonId: pid, pkce: state });
    const b64 = Buffer.from(mstate, "utf8").toString("base64url");
    const url = new URL(
      `https://login.microsoftonline.com/${config.ms.tenant}/oauth2/v2.0/authorize`
    );
    url.searchParams.set("client_id", config.ms.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", config.ms.redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", config.ms.graphScope);
    url.searchParams.set("state", b64);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(302, url.toString());
  });

  r.get("/ms/callback", async (req, res) => {
    if (!isMsConfigured()) {
      return res.status(500).send("Microsoft OAuth is not configured");
    }
    const err = req.query.error;
    if (err) {
      return res.status(400).send(String(req.query.error_description || err));
    }
    const code = req.query.code;
    const stateB64 = req.query.state;
    if (typeof code !== "string" || typeof stateB64 !== "string") {
      return res.status(400).send("Missing code or state");
    }
    let mstate;
    try {
      mstate = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
    } catch {
      return res.status(400).send("Bad state");
    }
    if (mstate.kind !== "ms" || !mstate.webexPersonId) {
      return res.status(400).send("Bad state payload");
    }
    const verifier = takePkceState(mstate.pkce);
    if (!verifier) {
      return res.status(400).send("Invalid PKCE");
    }
    const url = `https://login.microsoftonline.com/${config.ms.tenant}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: config.ms.clientId,
      client_secret: config.ms.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.ms.redirectUri,
      code_verifier: verifier,
    });
    const tr = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tr.ok) {
      const t = await tr.text();
      log.error({ t }, "MS token failed");
      return res.status(500).send("Microsoft token exchange failed");
    }
    const tj = await tr.json();
    const exp = Math.floor(Date.now() / 1000) + (tj.expires_in ?? 3600);
    const userRow = await import("./db.js").then((m) => m.getUserByWebexPersonId(mstate.webexPersonId));
    if (!userRow) {
      return res.status(400).send("User not found; start with /auth/webex");
    }
    await upsertUser({
      webexPersonId: mstate.webexPersonId,
      msTokenEnc: encryptString(tj.access_token),
      msRefreshEnc: encryptString(tj.refresh_token),
      msTokenExpiresAt: exp,
    });
    return res
      .type("html")
      .send(
        donePage(
          mstate.webexPersonId,
          userRow.webex_ingest_token,
          true
        )
      );
  });

  /** Register webhook: GET /api/register-webhook?token=ingest (after deploy) */
  r.get("/api/register-webhook", async (req, res) => {
    const token = req.query.token;
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "query token= required (per-user ingest token from setup)" });
    }
    const user = getUserByIngestToken(token);
    if (!user) {
      return res.status(404).json({ error: "Unknown token" });
    }
    if (!user.webex_refresh_enc) {
      return res.status(400).json({ error: "User missing Webex tokens" });
    }
    const wuser = {
      id: user.id,
      webex_person_id: user.webex_person_id,
      webex_token_enc: user.webex_token_enc,
      webex_refresh_enc: user.webex_refresh_enc,
      webex_token_expires_at: user.webex_token_expires_at,
      ms_token_enc: user.ms_token_enc,
      ms_refresh_enc: user.ms_refresh_enc,
      ms_token_expires_at: user.ms_token_expires_at,
    };
    const at = await ensureWebexAccessToken(/** @type {any} */ (wuser), log);
    const targetUrl = `${config.publicBaseUrl}/wh/${user.webex_ingest_token}`;
    const secret = config.webexWebhookSecret || crypto.randomBytes(32).toString("hex");
    const wh = await createWebhook(at, { targetUrl, secret, name: "ooo-reply", resource: ["messages"], event: "created" });
    await upsertUser({ webexPersonId: user.webex_person_id, webexWebhookId: wh.id });
    log.info({ id: wh.id, targetUrl }, "registered Webex webhook");
    return res.json({
      id: wh.id,
      targetUrl,
      webhookSecret: secret,
      setEnvWebexWebhookSecret: !config.webexWebhookSecret,
      hint: "Set WEBEX_WEBHOOK_SECRET in .env to webhookSecret if you did not already have one, then restart.",
    });
  });

  const rawJson = express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } });

  r.post("/wh/:token", rawJson, async (req, res) => {
    if (config.webexWebhookSecret && req.rawBody) {
      const sig = req.get("X-Spark-Signature");
      if (!verifyWebexSignature(/** @type {Buffer} */(req.rawBody), sig, config.webexWebhookSecret)) {
        log.warn("bad webhook signature");
        return res.status(401).end();
      }
    }

    res.status(200).end();

    const user = getUserByIngestToken(req.params.token);
    if (!user) {
      log.warn({ t: req.params.token }, "unknown ingest token");
      return;
    }

    try {
      const event = req.body;
      if (event?.resource !== "messages" || event?.event !== "created") {
        return;
      }
      const messageId = event.data?.id;
      if (typeof messageId !== "string") {
        return;
      }

      const wuser = {
        id: user.id,
        webex_person_id: user.webex_person_id,
        webex_token_enc: user.webex_token_enc,
        webex_refresh_enc: user.webex_refresh_enc,
        webex_token_expires_at: user.webex_token_expires_at,
        ms_token_enc: user.ms_token_enc,
        ms_refresh_enc: user.ms_refresh_enc,
        ms_token_expires_at: user.ms_token_expires_at,
      };

      const wAt = await ensureWebexAccessToken(/** @type {any} */(wuser), log);
      const message = await getMessage(wAt, messageId);
      if (message.personId === user.webex_person_id) {
        return;
      }

      const roomId = message.roomId;
      const roomHttp = await fetch(`${config.webex.apiBase}/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${wAt}`, Accept: "application/json" },
      });
      if (!roomHttp.ok) {
        log.warn({ roomId, status: roomHttp.status }, "room fetch failed");
        return;
      }
      const roomRes = await roomHttp.json();
      const author = await getPersonById(wAt, message.personId);
      if (roomRes.type !== "direct") {
        return;
      }

      const authorEmail = author.emails?.[0] ?? author.email ?? null;
      const myDomain = user.home_domain;
      if (!isExternalEmail(authorEmail, myDomain || "")) {
        return;
      }

      if (!user.ms_refresh_enc) {
        log.info("skip: Microsoft not connected");
        return;
      }
      const msAt = await ensureMsAccessToken(/** @type {any} */(wuser), log);
      const settings = await getMailboxSettings(msAt);
      const ooo = extractExternalOooText(settings);
      if (!ooo.active || !ooo.text) {
        return;
      }

      const card = `**Out of office (automated reply)**\n\n${ooo.text}`;
      await postMessage(wAt, roomId, card);
      log.info({ roomId, from: authorEmail }, "sent OOO reply in Webex");
    } catch (e) {
      log.error(e, "webhook handler");
    }
  });

  r.get("/", (_req, res) => {
    res.type("html").send(indexPage());
  });

  return r;
}

/**
 * @param {Buffer} raw
 * @param {string|undefined} signatureHeader
 * @param {string} secret
 */
function verifyWebexSignature(raw, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const h = crypto.createHmac("sha1", secret).update(raw).digest("hex");
  return h === signatureHeader;
}

function indexPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Webex OOO bridge</title></head><body>
<h1>Webex + Exchange OOO</h1>
<ol>
<li>Configure <code>.env</code> from <code>.env.example</code>.</li>
<li>Register a <a href="https://developer.webex.com">Webex Integration</a> (redirect URI, scopes above).</li>
<li>Optionally create an Entra app with delegated <code>MailboxSettings.Read</code> and the redirect URI in this app.</li>
<li><a href="/auth/webex">Connect Webex</a></li>
<li>Call <code>GET /api/register-webhook?token=&lt;ingest token shown after connect&gt;</code> once, or register a similar webhook in code.</li>
</ol>
</body></html>`;
}

/**
 * @param {string} webexPersonId
 * @param {string} ingest
 * @param {boolean} msOk
 */
function donePage(webexPersonId, ingest, msOk) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connected</title></head><body>
<p>Webex person <code>${webexPersonId}</code> connected.</p>
<p>Ingest token (save this for webhook URL path): <code>${ingest}</code></p>
${msOk ? "<p>Microsoft (Exchange) mailbox settings linked.</p>" : "<p>Microsoft not linked: visit /auth/ms?pid=YOUR_PERSON_ID if you configure Microsoft OAuth.</p>"}
<p>Register webhook: <a href="/api/register-webhook?token=${encodeURIComponent(ingest)}">register-webhook</a></p>
</body></html>`;
}
