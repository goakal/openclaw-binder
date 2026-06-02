export type BinderAccountConfig = {
  enabled?: boolean;
  name?: string;
  /** Base URL of the Binder instance, e.g. "https://binder.example.com" */
  apiUrl: string;
  /** Bot ID from Binderr database */
  botId: string;
  /** Bearer token for bot API authentication */
  token: string;
  /** Webhook secret for HMAC signature verification. Returned on bot creation alongside the token. */
  webhookSecret: string;
  /** Bot @username used to strip the mention from inbound content */
  botUsername: string;
  /** HTTP path where this account listens for webhooks. Defaults to "/binder" */
  webhookPath?: string;
  /** Default group_id used when sending a proactive outbound message */
  defaultTo?: string;
};
