export type BinderAccountConfig = {
  enabled?: boolean;
  name?: string;
  /** Base URL of the Binderr instance, e.g. "https://binderr.example.com" */
  apiUrl: string;
  /** Bot ID from Binderr database */
  botId: string;
  /** Bearer token for bot API authentication. Also used to verify inbound webhook signatures. */
  token: string;
  /** Bot @username used to strip the mention from inbound content */
  botUsername: string;
  /** HTTP path where this account listens for webhooks. Defaults to "/binder" */
  webhookPath?: string;
  /** Default group_id used when sending a proactive outbound message */
  defaultTo?: string;
};
