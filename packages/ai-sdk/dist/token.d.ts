import type { ToolTokenClaims } from './types.js';
export declare function signToolToken(opts: {
    secret: string;
    issuer: string;
    appKey: string;
    sub: string;
    orgId: string;
    toolId: string;
    ttlSec?: number;
}): Promise<string>;
export declare function verifyToolToken(token: string, opts: {
    secret: string;
    issuer?: string;
    audience?: string;
}): Promise<ToolTokenClaims>;
