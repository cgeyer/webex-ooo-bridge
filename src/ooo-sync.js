import { config } from "./config.js";
import { deregisterAllWebhooks, registerOooWebhooks } from "./webex.js";
import { WEBHOOK_MESSAGES_PATH } from "./webhook-handler.js";

/**
 * Register or deregister OOO webhooks based on user preference.
 * @param {string} accessToken
 * @param {boolean} enableOoo
 * @returns {Promise<{ webhookIds: string[], webhooks: object | null }>}
 */
export async function syncOooWebhooks(accessToken, enableOoo) {
  await deregisterAllWebhooks(accessToken);

  if (!enableOoo) {
    return { webhookIds: [], webhooks: null };
  }

  if (!config.webex.webhookTargetUrl) {
    throw new Error(
      "Out of office is enabled but WEBEX_WEBHOOK_TARGET_URL is not set. " +
        `Example: http://localhost:${config.port}${WEBHOOK_MESSAGES_PATH}`
    );
  }

  const webhooks = await registerOooWebhooks(accessToken);
  const webhookIds = [String(webhooks.mentioned.id), String(webhooks.direct.id)];
  return { webhookIds, webhooks };
}
