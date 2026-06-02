import type { ResolvedBinderAccount } from "./accounts.js";

export async function postBinderMessage(params: {
  account: ResolvedBinderAccount;
  groupId: string;
  parentMessageId: string;
  content: string;
}): Promise<void> {
  const { account, groupId, parentMessageId, content } = params;
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.config.token}`,
      "X-Bot-ID": account.config.botId,
    },
    body: JSON.stringify({
      group_id: groupId,
      parent_message_id: parentMessageId,
      content,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binderr API error ${res.status}: ${body}`);
  }
}

/**
 * Probe the Binderr API to verify the bot token is valid.
 * Uses the dedicated /api/bots/v1/ping endpoint.
 */
export async function probeBinderToken(account: ResolvedBinderAccount): Promise<{
  ok: boolean;
  statusCode?: number;
  error?: string;
}> {
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/ping`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${account.config.token}`,
        "X-Bot-ID": account.config.botId,
      },
    });
    // 200 = authenticated and bot is active → token is valid
    // 401 = unauthorized or inactive bot → token is bad
    return { ok: res.status === 200, statusCode: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
