import type { ResolvedBinderAccount } from "./accounts.js";

export async function postBinderMessage(params: {
  account: ResolvedBinderAccount;
  groupId: string;
  parentMessageId: string;
  content: string;
}): Promise<void> {
  const { account, groupId, parentMessageId, content } = params;
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/messages`;

  const payload: Record<string, unknown> = {
    group_id: groupId,
    content,
  };
  if (parentMessageId) {
    payload.parent_message_id = parentMessageId;
  }

  console.log(`[Binder] POST ${url} — group=${groupId}, parent=${parentMessageId || "(none)"}, content.len=${content.length}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.config.token}`,
      "X-Bot-ID": account.config.botId,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Binder] POST failed: ${res.status} ${body}`);
    throw new Error(`Binderr API error ${res.status}: ${body}`);
  }

  console.log(`[Binder] POST success: ${res.status}`);
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
