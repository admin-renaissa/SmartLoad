import type { Router, Request } from 'express';
import type { LocalAuthStore } from './localAuth.js';
export type MigrationRouterOpts = {
    router: Router;
    mode: string;
    appDisplayName: string;
    appKey: string;
    accountsOrigin: string;
    store: LocalAuthStore;
    defaultTenantId: string;
    /** Per-request tenant/org cutover (DB flag). Return true when Phase B applies. */
    resolveTenantCutover?: (req: Request) => boolean | Promise<boolean>;
};
export declare function linkConflictUrl(accountsOrigin: string, params: {
    email: string;
    appKey: string;
}): string;
export declare function registerMigrationRoutes(opts: MigrationRouterOpts): void;
export declare function renderLinkBannerHtml(): string;
