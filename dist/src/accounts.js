import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
const { listAccountIds: listBinderAccountIds, resolveDefaultAccountId: resolveDefaultBinderAccountId, } = createAccountListHelpers("binder");
export { listBinderAccountIds, resolveDefaultBinderAccountId };
function resolveAccountConfig(cfg, accountId) {
    const accounts = cfg.channels?.["binder"];
    return accounts?.accounts?.[accountId];
}
function mergeBinderAccountConfig(cfg, accountId) {
    const channelSection = cfg.channels?.["binder"];
    const { accounts: _ignored, ...base } = channelSection ?? {};
    const defaultAccountConfig = resolveAccountConfig(cfg, DEFAULT_ACCOUNT_ID) ?? {};
    const account = resolveAccountConfig(cfg, accountId) ?? {};
    if (accountId === DEFAULT_ACCOUNT_ID) {
        return { ...base, ...defaultAccountConfig };
    }
    const { enabled: _ignoredEnabled, ...defaultAccountShared } = defaultAccountConfig;
    return { ...defaultAccountShared, ...base, ...account };
}
export function resolveBinderAccount(params) {
    const accountId = normalizeAccountId(params.accountId);
    const channelSection = params.cfg.channels?.["binder"];
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
export function listEnabledBinderAccounts(cfg) {
    return listBinderAccountIds(cfg)
        .map((accountId) => resolveBinderAccount({ cfg, accountId }))
        .filter((account) => account.enabled);
}
