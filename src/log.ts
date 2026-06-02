/**
 * Conditional logger for the Binder extension.
 * All debug/trace output is gated by `account.config.verbose` (default false).
 */
export function binderLog(verbose: boolean | undefined, ...args: unknown[]): void {
  if (verbose) {
    console.log("[Binder]", ...args);
  }
}

export function binderError(verbose: boolean | undefined, ...args: unknown[]): void {
  if (verbose) {
    console.error("[Binder]", ...args);
  }
}
