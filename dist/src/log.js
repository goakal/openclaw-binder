/**
 * Conditional logger for the Binder extension.
 * All debug/trace output is gated by `account.config.verbose` (default false).
 */
export function binderLog(verbose, ...args) {
    if (verbose) {
        console.log("[Binder]", ...args);
    }
}
export function binderError(verbose, ...args) {
    if (verbose) {
        console.error("[Binder]", ...args);
    }
}
