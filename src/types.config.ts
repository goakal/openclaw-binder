export type BinderAccountConfig = {
  enabled?: boolean;
  name?: string;
  /** Base URL of the Binderr instance, e.g. "https://binderr.example.com" */
  apiUrl: string;
  /** Bot ID from Binderr database */
  botId: string;
  /** Bearer token for bot API authentication */
  token: string;
  /** Shared HMAC-SHA256 signing secret — must match BOT_WEBHOOK_SECRET in Binderr */
  webhookSecret: string;
  /** Bot @username used to strip the mention from inbound content */
  botUsername: string;
  /** HTTP path where this account listens for webhooks. Defaults to "/binder" */
  webhookPath?: string;
  /** Default group_id used when sending a proactive outbound message */
  defaultTo?: string;
};
