import { config } from "./config.js";
import { getRoomDetails, sendBotDirectMessage } from "./webex.js";

/**
 * @param {{ markdown?: string, text?: string }} message
 * @returns {string}
 */
export function incomingMessageContent(message) {
  if (typeof message.markdown === "string" && message.markdown.trim()) {
    return message.markdown.trim();
  }
  const text = typeof message.text === "string" ? message.text.trim() : "";
  return text || "(no text)";
}

/**
 * @param {{
 *   senderName: string,
 *   isDirect: boolean,
 *   roomTitle: string | null,
 *   incomingBody: string,
 * }} input
 */
export function formatAbsenceNotification(input) {
  const where = input.isDirect
    ? "Direct message"
    : `Space "${input.roomTitle?.trim() || "Unknown"}"`;

  const header = [
    "**Out of office notification**",
    "",
    `**From:** ${input.senderName}`,
    `**Where:** ${where}`,
    "",
    "**Message:**",
    "",
  ].join("\n");

  return { markdown: `${header}${input.incomingBody}` };
}

/**
 * @param {import("./db.js").UserRecord} user
 * @param {{
 *   accessToken: string,
 *   sender: Record<string, unknown>,
 *   incomingMessage: Record<string, unknown>,
 *   isDirect: boolean,
 *   roomId: string,
 *   log: import("pino").Logger,
 * }} ctx
 */
export async function notifyUserAboutIncomingMessage(user, ctx) {
  if (!user.notifyIncomingMessages) return;
  if (!config.webex.botToken) {
    ctx.log.warn({ personId: user.personId }, "WEBEX_BOT_TOKEN not configured; skipping absence notification");
    return;
  }

  const senderName =
    typeof ctx.sender.displayName === "string" && ctx.sender.displayName.trim()
      ? ctx.sender.displayName.trim()
      : (() => {
          const emails = ctx.sender.emails;
          if (Array.isArray(emails) && emails.length > 0) return String(emails[0]);
          if (typeof ctx.sender.email === "string" && ctx.sender.email.trim()) {
            return ctx.sender.email.trim();
          }
          return "Unknown sender";
        })();

  let roomTitle = null;
  if (!ctx.isDirect) {
    const room = await getRoomDetails(ctx.accessToken, ctx.roomId);
    roomTitle = typeof room.title === "string" ? room.title : null;
  }

  const incomingBody = incomingMessageContent(ctx.incomingMessage);
  const notification = formatAbsenceNotification({
    senderName,
    isDirect: ctx.isDirect,
    roomTitle,
    incomingBody,
  });

  await sendBotDirectMessage({
    toPersonEmail: user.email,
    markdown: notification.markdown,
  });

  ctx.log.info(
    { personId: user.personId, isDirect: ctx.isDirect, roomId: ctx.roomId },
    "sent absence notification via bot"
  );
}
