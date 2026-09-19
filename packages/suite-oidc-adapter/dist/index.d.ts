import { Router, type Request, type Response, type NextFunction } from 'express';
import { type AccessTokenClaims, type AppKey, type OidcConfig, type Session } from '@renverse/auth-sdk';
import { type LocalAuthStore } from './localAuth.js';
export type JitResult = {
    localUserId: string;
    localTenantId: string;
    suiteRole?: string;
};
export type SuiteOidcAdapterOptions = {
    config: OidcConfig;
    /** Human-readable product name for dual-login copy */
    appDisplayName?: string;
    /** Override in-memory local user store (Phase A migration) */
    localAuth?: LocalAuthStore;
    defaultTenantId?: string;
    accountsOrigin?: string;
    /** Register /login, local auth, link/start (default true in suite mode) */
    migration?: boolean;
    /** Persist JIT user/tenant; return local ids. `req` is passed so account-link cookies can bind. */
    onJit: (claims: AccessTokenClaims, req: Request) => Promise<JitResult>;
    /**
     * Optional first-enable / AppLink bind after JIT.
     * May update localTenantId via returned JitResult override.
     */
    onFirstEnable?: (claims: AccessTokenClaims, jit: JitResult, session: Session, req?: Request) => Promise<JitResult | void>;
    /** Optional: establish app-native session (JWT cookies etc.) */
    onSession?: (req: Request, res: Response, session: Session, jit: JitResult) => Promise<void> | void;
    contractsVersion?: string;
    /** Per-request tenant/org Phase B cutover from product DB */
    resolveTenantCutover?: (req: Request) => boolean | Promise<boolean>;
};
declare module 'express-serve-static-core' {
    interface Request {
        renverseSession?: Session;
        renverseJit?: JitResult;
    }
}
export declare function seedDemoLocalUser(store: LocalAuthStore, appKey: string, tenantId: string): void;
export declare function createSuiteOidcRouter(opts: SuiteOidcAdapterOptions): Router;
export declare function suiteModeEnabled(): boolean;
/**
 * Suite entitlement gate — no-op when `RENVERSE_MODE !== suite`.
 * Accepts cookie OIDC session or `Authorization: Bearer` Identity access token.
 */
export declare function requireSuiteEntitlement(appKey: AppKey): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export { runFirstEnable } from './firstEnable.js';
export { renderLinkBannerHtml, linkConflictUrl } from './migration.js';
export { completeAccountLink } from './linkFlow.js';
export { createInMemoryLocalAuthStore, type LocalAuthStore, type LocalUser, } from './localAuth.js';
