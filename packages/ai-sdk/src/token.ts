import * as jose from 'jose';
import type { ToolTokenClaims } from './types.js';

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

const secretKey = (secret: string) => new TextEncoder().encode(secret);

export async function signToolToken(opts: {
  secret: string;
  issuer: string;
  appKey: string;
  sub: string;
  orgId: string;
  toolId: string;
  ttlSec?: number;
}): Promise<string> {
  const ttl = Math.min(opts.ttlSec ?? 120, 120);
  return new jose.SignJWT({
    org_id: opts.orgId,
    tool_id: opts.toolId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.issuer)
    .setAudience(opts.appKey)
    .setSubject(opts.sub)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secretKey(opts.secret));
}

export async function verifyToolToken(
  token: string,
  opts: { secret: string; issuer?: string; audience?: string },
): Promise<ToolTokenClaims> {
  const { payload } = await jose.jwtVerify(token, secretKey(opts.secret), {
    issuer: opts.issuer,
    audience: opts.audience,
    algorithms: ['HS256'],
  });
  return {
    sub: String(payload.sub || ''),
    org_id: String(payload.org_id || ''),
    tool_id: String(payload.tool_id || ''),
    aud: Array.isArray(payload.aud)
      ? String(payload.aud[0] || '')
      : String(payload.aud || ''),
    iss: payload.iss,
    exp: payload.exp,
    jti: payload.jti,
  };
}
