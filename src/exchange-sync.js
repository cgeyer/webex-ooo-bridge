import { config } from "./config.js";
import { getAutomaticRepliesSetting, mapGraphAutomaticRepliesToOooFields } from "./graph.js";
import { ensureGraphAccessToken, hasGraphConnection } from "./graph-tokens.js";

const DEFAULT_OOO_MESSAGE = "I'm currently out of office and will reply when I am back.";

/**
 * @param {import("./db.js").UserRecord} user
 * @param {string} defaultMessage
 */
export async function pullOooSettingsFromExchange(user, defaultMessage = DEFAULT_OOO_MESSAGE) {
  if (!user.useExchangeOoo || !hasGraphConnection(user)) {
    return user;
  }
  const graphToken = await ensureGraphAccessToken(user);
  const setting = await getAutomaticRepliesSetting(graphToken);
  const mapped = mapGraphAutomaticRepliesToOooFields(setting, defaultMessage);
  return {
    ...user,
    enableOoo: mapped.enableOoo,
    oooMessage: mapped.oooMessage,
    sendOooToColleagues: mapped.sendOooToColleagues,
    useSameColleagueMessage: mapped.useSameColleagueMessage,
    internalOooMessage: mapped.internalOooMessage,
    hasOooEndDate: mapped.hasOooEndDate,
    oooEndDate: mapped.oooEndDate,
    oooEndTime: mapped.oooEndTime,
    oooEndTimezone:
      mapped.oooEndTimezone || user.oooEndTimezone || config.exchangeSync.utcTimeZoneAlias,
  };
}
