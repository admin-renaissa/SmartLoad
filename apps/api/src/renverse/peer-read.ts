/**
 * Peer read for SmartLoad-owned projections (shipment).
 * Prefers `@renverse/auth-sdk` `verifyPeerToken`; falls back to JWKS via node:crypto.
 */
import { createPublicKey, createVerify } from 'node:crypto';
import { assertSameOrg } from './tenancy.js';

export type PeerClaims = {
  sub: string;
  org_id: string;
  src_app: string;
  aud: string;
  scope: string;
  typ: string;
};

function b64urlToBuf(input: string): Buffer {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function peerScopeEntity(scope: string): string {
  return scope.startsWith('read:') ? scope.slice(5) : '';
}

async function verifyPeerTokenLocal(
  token: string,
  opts: { issuer: string; audience: string; jwksUrl?: string },
): Promise<PeerClaims> {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('malformed_token');
  const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8')) as {
    kid?: string;
    alg?: string;
  };
  const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8')) as Record<
    string,
    unknown
  >;
  if (String(payload.typ || '') !== 'renverse_peer') throw new Error('not_peer_token');
  if (String(payload.aud || '') !== opts.audience) throw new Error('aud_mismatch');
  const exp = Number(payload.exp || 0);
  if (!exp || exp * 1000 < Date.now()) throw new Error('expired');
  const issuer = opts.issuer.replace(/\/$/, '');
  if (payload.iss && String(payload.iss) !== issuer) throw new Error('iss_mismatch');
  const jwksUrl = opts.jwksUrl || `${issuer}/oauth/jwks`;
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error('jwks_unavailable');
  const jwks = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  const keys = jwks.keys || [];
  const jwk = (header.kid ? keys.find((k) => k.kid === header.kid) : keys[0]) || keys[0];
  if (!jwk) throw new Error('no_jwk');
  const key = createPublicKey({ key: jwk as never, format: 'jwk' });
  const ok = createVerify('RSA-SHA256')
    .update(`${headerB64}.${payloadB64}`)
    .end()
    .verify(key, b64urlToBuf(sigB64));
  if (!ok) throw new Error('bad_signature');
  return {
    sub: String(payload.sub || ''),
    org_id: String(payload.org_id || ''),
    src_app: String(payload.src_app || ''),
    aud: String(payload.aud || opts.audience),
    scope: String(payload.scope || ''),
    typ: 'renverse_peer',
  };
}

export async function verifyPeerToken(
  token: string,
  opts: { issuer: string; audience: string; jwksUrl?: string },
): Promise<PeerClaims> {
  try {
    const auth = await import('@renverse/auth-sdk');
    if (typeof auth.verifyPeerToken === 'function') {
      return auth.verifyPeerToken(token, opts);
    }
  } catch {
    /* use local JWKS verify */
  }
  return verifyPeerTokenLocal(token, opts);
}

export type ShipmentProjection = {
  entityType: 'shipment';
  shipmentId: string;
  poNumber: unknown;
  status: unknown;
  organizationId: unknown;
};

export async function loadSmartloadPeerProjection(opts: {
  entityType: string;
  id: string;
  orgId: string;
  prisma?: {
    purchaseOrder?: {
      findUnique?: (args: unknown) => Promise<{
        id: string;
        poNumber?: unknown;
        status?: unknown;
        organizationId?: string | null;
      } | null>;
    };
  };
  findOrgByRenverseId?: (orgId: string) => Promise<{ id: string } | null>;
}): Promise<ShipmentProjection | null> {
  if (opts.entityType !== 'shipment') return null;
  const po = await opts.prisma?.purchaseOrder?.findUnique?.({
    where: { id: opts.id },
  });
  if (!po) return null;
  const direct = assertSameOrg(po.organizationId, opts.orgId, { suiteStrict: true });
  if (direct.ok) {
    return {
      entityType: 'shipment',
      shipmentId: po.id,
      poNumber: po.poNumber,
      status: po.status,
      organizationId: po.organizationId,
    };
  }
  const org = opts.findOrgByRenverseId
    ? await opts.findOrgByRenverseId(opts.orgId)
    : null;
  const mapped = assertSameOrg(po.organizationId, org?.id || '', { suiteStrict: true });
  if (!mapped.ok) return null;
  return {
    entityType: 'shipment',
    shipmentId: po.id,
    poNumber: po.poNumber,
    status: po.status,
    organizationId: po.organizationId,
  };
}

export async function handlePeerReadRequest(input: {
  mode?: string;
  authorization?: string;
  entityType: string;
  id: string;
  issuer?: string;
  audience?: string;
  verify?: typeof verifyPeerToken;
  loadProjection?: (opts: {
    entityType: string;
    id: string;
    orgId: string;
  }) => Promise<Record<string, unknown> | null>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const mode = String(input.mode || process.env.RENVERSE_MODE || 'standalone').toLowerCase();
  if (mode !== 'suite') {
    return { status: 404, body: { error: 'standalone' } };
  }
  const auth = String(input.authorization || '');
  if (!auth.startsWith('Bearer ') || !auth.slice(7).trim()) {
    return { status: 401, body: { error: 'unauthorized' } };
  }
  try {
    const verify = input.verify || verifyPeerToken;
    const claims = await verify(auth.slice(7), {
      issuer: input.issuer || process.env.RENVERSE_OIDC_ISSUER || 'http://localhost:9100',
      audience: input.audience || 'smartload',
    });
    const entity = peerScopeEntity(claims.scope);
    if (entity !== input.entityType || entity !== 'shipment') {
      return { status: 403, body: { error: 'scope_mismatch' } };
    }
    const load = input.loadProjection || ((opts) => loadSmartloadPeerProjection(opts));
    const row = await load({
      entityType: entity,
      id: input.id,
      orgId: claims.org_id,
    });
    if (!row) {
      return { status: 404, body: { error: 'not_found' } };
    }
    return { status: 200, body: row };
  } catch {
    return { status: 401, body: { error: 'unauthorized' } };
  }
}
