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
export declare function isRenverseSuiteMode(mode?: string): boolean;
/** True when env still asks for withdrawn Phase B (misconfig; ignored). */
export declare function isSuiteAuthCutoverMisconfigured(phase?: string | undefined): boolean;
/**
 * @deprecated Phase B cutover is disabled. Always returns false.
 * Use isSuiteAuthCutoverMisconfigured() to detect leftover env.
 */
export declare function isSuiteAuthCutoverPhase(_phase?: string | undefined): boolean;
/**
 * Resolve authPhase for GET /renverse/status.
 * Suite mode is always dual. tenantCutover / env cutover are ignored.
 */
export declare function resolveAuthPhase(opts?: {
    mode?: string;
    envPhase?: string;
    tenantCutover?: boolean;
}): AuthPhase;
export declare function shouldShowLocalLoginOnClient(opts: {
    suiteMode: boolean;
    authPhase?: string;
}): boolean;
/** Local password login is never blocked by suite policy. */
export declare function shouldBlockLocalLogin(_opts: {
    mode?: string;
    authPhase?: string;
    tenantCutover?: boolean;
}): boolean;
export declare const SUITE_CUTOVER_CODE: "SUITE_CUTOVER_REQUIRED";
export declare const CUTOVER_DISABLED_CODE: "cutover_disabled";
export declare function suiteCutoverMessage(): string;
export declare function cutoverDisabledMessage(): string;
