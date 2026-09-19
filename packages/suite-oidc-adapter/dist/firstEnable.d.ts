import type { AccessTokenClaims, AppKey, Session } from '@renverse/auth-sdk';
export type JitResult = {
    localUserId: string;
    localTenantId: string;
    suiteRole?: string;
};
/**
 * AppLink first-enable + Connect IdMap user/tenant rows.
 * Algorithm: contracts/applink/provisioning.md
 */
export declare function runFirstEnable(opts: {
    appKey: AppKey;
    claims: AccessTokenClaims;
    session: Session;
    jit: JitResult;
    createLocalTenant: (orgId: string) => string | Promise<string>;
}): Promise<JitResult>;
