import type { ToolTokenClaims } from './types.js';
export declare function signToolToken(opts: {
    secret: string;
    issuer: string;
    appKey: string;
    sub: string;
    orgId: string;
    toolId: string;
    /** The user's suite entitlements, so the app can re-check (defense in depth). */
    apps?: string[];
    addons?: string[];
    /** Suite roles of the user (org_owner, org_admin, …) for app-side RBAC. */
    roles?: string[];
    ttlSec?: number;
}): Promise<string>;
export declare function verifyToolToken(token: string, opts: {
    secret: string;
    issuer?: string;
    audience?: string;
}): Promise<ToolTokenClaims>;
