export type PeerTokenClaims = {
    sub: string;
    org_id: string;
    src_app: string;
    aud: string;
    scope: string;
    typ: string;
};
export declare function verifyPeerToken(token: string, opts: {
    issuer: string;
    audience: string;
    jwksUrl?: string;
}): Promise<PeerTokenClaims>;
export declare function peerScopeEntity(scope: string): string;
