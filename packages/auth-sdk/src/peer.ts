import * as jose from 'jose';

export type PeerTokenClaims = {
  sub: string;
  org_id: string;
  src_app: string;
  aud: string;
  scope: string;
  typ: string;
};

export async function verifyPeerToken(
  token: string,
  opts: { issuer: string; audience: string; jwksUrl?: string },
): Promise<PeerTokenClaims> {
  const jwksUrl = opts.jwksUrl || `${opts.issuer.replace(/\/$/, '')}/oauth/jwks`;
  const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: opts.issuer,
    audience: opts.audience,
  });
  const typ = String(payload.typ || '');
  if (typ !== 'renverse_peer') {
    throw new Error('not_peer_token');
  }
  return {
    sub: String(payload.sub || ''),
    org_id: String(payload.org_id || ''),
    src_app: String(payload.src_app || ''),
    aud: String(payload.aud || opts.audience),
    scope: String(payload.scope || ''),
    typ,
  };
}

export function peerScopeEntity(scope: string): string {
  return scope.startsWith('read:') ? scope.slice(5) : '';
}
