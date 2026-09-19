/**
 * Suite login phases (EP-X-01 / 38_USER_LOGIN_AND_MIGRATION).
 *
 * Product policy: suite orgs stay on dual-login forever. Phase B cutover is
 * withdrawn — env/tenant flags that used to force Identity-only are ignored.
 *
 * - standalone: app-local login only (RENVERSE_MODE ≠ suite)
 * - dual: RenVerse CTA + local password (the only suite phase)
 * - cutover: legacy type only; resolveAuthPhase never returns it
 */

export type AuthPhase = 'standalone' | 'dual' | 'cutover';

export function isRenverseSuiteMode(
  mode = process.env.RENVERSE_MODE || 'standalone',
): boolean {
  return String(mode).toLowerCase() === 'suite';
}

/** True when env still asks for withdrawn Phase B (misconfig; ignored). */
export function isSuiteAuthCutoverMisconfigured(
  phase = process.env.RENVERSE_SUITE_AUTH_PHASE,
): boolean {
  const p = String(phase || 'dual').toLowerCase();
  if (p === 'cutover') return true;
  const legacy =
    process.env.RENVERSE_IDENTITY_ONLY === '1' ||
    process.env.RENVERSE_IDENTITY_ONLY === 'true';
  return legacy;
}

/**
 * @deprecated Phase B cutover is disabled. Always returns false.
 * Use isSuiteAuthCutoverMisconfigured() to detect leftover env.
 */
export function isSuiteAuthCutoverPhase(
  _phase = process.env.RENVERSE_SUITE_AUTH_PHASE,
): boolean {
  return false;
}

/**
 * Resolve authPhase for GET /renverse/status.
 * Suite mode is always dual. tenantCutover / env cutover are ignored.
 */
export function resolveAuthPhase(opts?: {
  mode?: string;
  envPhase?: string;
  tenantCutover?: boolean;
}): AuthPhase {
  if (!isRenverseSuiteMode(opts?.mode)) return 'standalone';
  return 'dual';
}

export function shouldShowLocalLoginOnClient(opts: {
  suiteMode: boolean;
  authPhase?: string;
}): boolean {
  if (!opts.suiteMode) return true;
  return true;
}

/** Local password login is never blocked by suite policy. */
export function shouldBlockLocalLogin(_opts: {
  mode?: string;
  authPhase?: string;
  tenantCutover?: boolean;
}): boolean {
  return false;
}

export const SUITE_CUTOVER_CODE = 'SUITE_CUTOVER_REQUIRED' as const;
export const CUTOVER_DISABLED_CODE = 'cutover_disabled' as const;

export function suiteCutoverMessage(): string {
  return 'Suite orgs keep dual login (RenVerse + local app password). Phase B cutover is disabled.';
}

export function cutoverDisabledMessage(): string {
  return 'Phase B cutover is disabled. Suite organizations keep RenVerse and local app passwords.';
}
