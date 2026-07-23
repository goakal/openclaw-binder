import type { ResolvedBinderAccount } from "./accounts.js";
import { binderLog, binderError } from "./log.js";

export async function postBinderMessage(params: {
  account: ResolvedBinderAccount;
  groupId: string;
  parentMessageId: string;
  content: string;
  isDm?: boolean;
  /** Ids of attachments already uploaded via uploadBinderAttachment. */
  attachmentIds?: string[];
}): Promise<void> {
  const { account, groupId, parentMessageId, content, isDm, attachmentIds } = params;
  const url = `${account.config.apiUrl.replace(/\/$/, "")}/api/bots/v1/incoming`;
  const verbose = account.config.verbose ?? false;

  const hasAttachments = !!attachmentIds && attachmentIds.length > 0;
  const payload: Record<string, unknown> = isDm
    ? {
        type: "direct_message",
        conversation_id: groupId,
        pending_message_id: parentMessageId,
        content,
        ...(hasAttachments ? { attachment_ids: attachmentIds } : {}),
      }
    : {
        type: "group_message",
        group_id: groupId,
        parent_message_id: parentMessageId,
        content,
        ...(hasAttachments ? { attachment_ids: attachmentIds } : {}),
      };

  binderLog(verbose, `POST ${url} — type=${isDm ? "dm" : "group"} id=${groupId}, parent=${parentMessageId || "(none)"}, content.len=${content.length}, attachments=${attachmentIds?.length ?? 0}`);

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
    binderError(verbose, `POST failed: ${res.status} ${body}`);
    throw new Error(`Binderr API error ${res.status}: ${body}`);
  }

  binderLog(verbose, `POST success: ${res.status}`);
}

// Binder accepts these attachment types (mirrors the backend allow-list).
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

/** Content-sniff the common image/video magic bytes; undefined if unknown. */
function sniffMime(b: Uint8Array): string | undefined {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return undefined;
}

/**
 * Load media bytes from an http(s) URL or a local file path, and derive a
 * Binder-acceptable fileType + fileName. Content-sniffing wins over the
 * extension so a mislabeled URL still uploads with the correct MIME. The
 * returned fileName's extension is normalized to match the resolved type
 * (the backend enforces extension↔MIME agreement).
 */
export async function loadBinderMedia(
  source: string,
  readFile?: (filePath: string) => Promise<Buffer>,
): Promise<{ bytes: Uint8Array; fileName: string; fileType: string }> {
  const isHttp = /^https?:\/\//i.test(source);
  let bytes: Uint8Array;
  if (isHttp) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch media ${res.status}: ${source}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } else if (readFile) {
    bytes = new Uint8Array(await readFile(source));
  } else {
    const { readFile: fsRead } = await import("node:fs/promises");
    bytes = new Uint8Array(await fsRead(source));
  }

  const clean = source.split("?")[0].split("#")[0];
  const extMatch = clean.match(/\.[a-z0-9]+$/i);
  const ext = (extMatch?.[0] ?? "").toLowerCase();
  const fileType = sniffMime(bytes) ?? MIME_BY_EXT[ext];
  if (!fileType) {
    throw new Error(`Unsupported media type for ${source} (ext=${ext || "none"})`);
  }
  const normExt = EXT_BY_MIME[fileType];
  const rawBase = clean.split("/").pop() || "";
  const stem = rawBase.replace(/\.[a-z0-9]+$/i, "") || "media";
  return { bytes, fileName: `${stem}${normExt}`, fileType };
}

/**
 * Two-step presigned upload of an attachment to Binder as the bot.
 * POSTs the init to /api/bots/v1/attachments, PUTs the bytes to the
 * returned signed R2 URL, and returns the attachment id to pass as
 * `attachment_ids` on the next postBinderMessage.
 *
 * Provide exactly one of groupId / conversationId (the target context).
 */
export async function uploadBinderAttachment(params: {
  account: ResolvedBinderAccount;
  groupId?: string;
  conversationId?: string;
  bytes: Uint8Array;
  fileName: string;
  fileType: string;
}): Promise<string> {
  const { account, groupId, conversationId, bytes, fileName, fileType } = params;
  if (!groupId === !conversationId) {
    throw new Error(
      "uploadBinderAttachment: provide exactly one of groupId / conversationId",
    );
  }
  const base = account.config.apiUrl.replace(/\/$/, "");
  const verbose = account.config.verbose ?? false;

  const initRes = await fetch(`${base}/api/bots/v1/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.config.token}`,
      "X-Bot-ID": account.config.botId,
    },
    body: JSON.stringify({
      ...(groupId ? { group_id: groupId } : {}),
      ...(conversationId ? { conversation_id: conversationId } : {}),
      file_type: fileType,
      file_size: bytes.byteLength,
      file_name: fileName,
    }),
  });
  if (!initRes.ok) {
    const body = await initRes.text().catch(() => "");
    binderError(verbose, `attachment init failed: ${initRes.status} ${body}`);
    throw new Error(`Binderr attachment init error ${initRes.status}: ${body}`);
  }
  const { id, signedUrl } = (await initRes.json()) as { id: string; signedUrl: string };

  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": fileType },
    body: bytes,
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    binderError(verbose, `attachment PUT failed: ${putRes.status} ${body}`);
    throw new Error(`R2 upload error ${putRes.status}: ${body}`);
  }

  binderLog(verbose, `attachment uploaded: id=${id} type=${fileType} size=${bytes.byteLength}`);
  return id;
}

/**
 * Convenience: load a media source (URL or path) and upload it, returning
 * the attachment id. Provide exactly one of groupId / conversationId.
 */
export async function uploadBinderMedia(params: {
  account: ResolvedBinderAccount;
  groupId?: string;
  conversationId?: string;
  source: string;
  readFile?: (filePath: string) => Promise<Buffer>;
}): Promise<string> {
  const { account, groupId, conversationId, source, readFile } = params;
  const { bytes, fileName, fileType } = await loadBinderMedia(source, readFile);
  return uploadBinderAttachment({ account, groupId, conversationId, bytes, fileName, fileType });
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
