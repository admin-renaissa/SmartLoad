import type { AccessTokenClaims } from '@renverse/auth-sdk';
import type { LocalAuthStore } from './localAuth.js';
export type LinkResult = {
    ok: true;
    status: 'linked';
    sub: string;
} | {
    ok: false;
    error: 'link_email_mismatch' | 'link_conflict' | 'link_user_missing';
};
export declare function completeAccountLink(input: {
    store: LocalAuthStore;
    localUserId: string;
    claims: AccessTokenClaims;
}): LinkResult;
