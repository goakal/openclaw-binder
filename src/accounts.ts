import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { BinderAccountConfig } from "./types.config.js";

export type ResolvedBinderAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: BinderAccountConfig;
};

const {
  listAccountIds: listBinderAccountIds,
  resolveDefaultAccountId: resolveDefaultBinderAccountId,
} = createAccountListHelpers("binder");
export { listBinderAccountIds, resolveDefaultBinderAccountId };

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): BinderAccountConfig | undefined {
  const accounts = (cfg.channels as Record<string, unknown>)?.["binder"] as
    | { accounts?: Record<string, BinderAccountConfig> }
    | undefined;
  return accounts?.accounts?.[accountId];
}

function mergeBinderAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): BinderAccountConfig {
  const channelSection = (cfg.channels as Record<string, unknown>)?.["binder"] as
    | Record<string, unknown>
    | undefined;
  const { accounts: _ignored, ...base } = channelSection ?? {};
  const defaultAccountConfig = resolveAccountConfig(cfg, DEFAULT_ACCOUNT_ID) ?? ({} as BinderAccountConfig);
  const account = resolveAccountConfig(cfg, accountId) ?? ({} as BinderAccountConfig);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return { ...base, ...defaultAccountConfig } as BinderAccountConfig;
  }

  const {
    enabled: _ignoredEnabled,
    ...defaultAccountShared
  } = defaultAccountConfig;

  return { ...defaultAccountShared, ...base, ...account } as BinderAccountConfig;
}

export function resolveBinderAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedBinderAccount {
  const accountId = normalizeAccountId(params.accountId);
  const channelSection = (params.cfg.channels as Record<string, unknown>)?.["binder"] as
    | { enabled?: boolean }
    | undefined;
  const baseEnabled = channelSection?.enabled !== false;
  const merged = mergeBinderAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled: baseEnabled && accountEnabled,
    config: merged,
  };
}

export function listEnabledBinderAccounts(cfg: OpenClawConfig): ResolvedBinderAccount[] {
  return listBinderAccountIds(cfg)
    .map((accountId) => resolveBinderAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
