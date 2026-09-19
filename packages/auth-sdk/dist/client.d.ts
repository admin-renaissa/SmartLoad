import type { AccessTokenClaims, AddonKey, AppKey, OidcClient, OidcConfig, Session, SessionStore } from './types.js';
export declare function hasApp(claims: AccessTokenClaims, appKey: AppKey): boolean;
export declare function hasAddon(claims: AccessTokenClaims, addonKey: AddonKey): boolean;
export declare function validateAccessToken(token: string, opts: {
    issuer: string;
    audience?: string;
}): Promise<AccessTokenClaims>;
export declare function createOidcClient(config: OidcConfig, store?: SessionStore): OidcClient;
export declare function getSession(req: unknown, store?: SessionStore): Session | null;
export declare function requireAuth(opts?: {
    config?: OidcConfig;
    store?: SessionStore;
}): (req: unknown, res: unknown, next: (err?: unknown) => void) => Promise<void>;
export declare function requireApp(appKey: AppKey, store?: SessionStore): (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
export declare function requireAddon(addonKey: AddonKey, store?: SessionStore): (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
export declare const ORG_CONTEXT_HEADER = "x-renverse-org-id";
export declare function getOrgId(input: AccessTokenClaims | Session | null | undefined): string | null;
export declare function orgContextHeaders(orgId: string): Record<string, string>;
export declare function assertOrgMatch(claims: AccessTokenClaims, expectedOrgId: string): void;
export declare function requireOrgContext(expectedOrgId?: string, store?: SessionStore): (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
/** Gradual flags from contracts/flags/dual-mode.md */
export type RenverseFlag = 'renverse.oidc' | 'renverse.connect.emit' | 'renverse.connect.consume' | 'renverse.issa' | 'renverse.launcher_chrome';
export declare function isFlagEnabled(name: RenverseFlag | string): boolean;
export declare function configFromEnv(overrides: Partial<OidcConfig> & {
    appKey: AppKey;
}): OidcConfig;
