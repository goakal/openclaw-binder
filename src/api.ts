import type { ResolvedBinderAccount } from "./accounts.js";

function botHeaders(account: ResolvedBinderAccount) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${account.config.token}`,
    "X-Bot-ID": account.config.botId,
  };
}

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
    headers: botHeaders(account),
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

export async function addBinderReaction(
  account: ResolvedBinderAccount,
  messageId: string,
  emoji: string,
): Promise<void> {
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/messages/${messageId}/reactions`;
  await fetch(url, {
    method: "POST",
    headers: botHeaders(account),
    body: JSON.stringify({ emoji }),
  }).catch(() => {});
}

export async function removeBinderReaction(
  account: ResolvedBinderAccount,
  messageId: string,
): Promise<void> {
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/messages/${messageId}/reactions`;
  await fetch(url, {
    method: "DELETE",
    headers: botHeaders(account),
  }).catch(() => {});
}

/**
 * Probe the Binderr API to verify the bot token is valid.
 * Uses a known-invalid threadId — a 400 means auth is OK, 401 means bad token.
 */
export async function probeBinderToken(account: ResolvedBinderAccount): Promise<{
  ok: boolean;
  statusCode?: number;
  error?: string;
}> {
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/messages?threadId=__probe__&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${account.config.token}`,
        "X-Bot-ID": account.config.botId,
      },
    });
    // 400 = bad threadId but auth passed → token is valid
    // 401 = unauthorized → token is bad
    return { ok: res.status !== 401, statusCode: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
