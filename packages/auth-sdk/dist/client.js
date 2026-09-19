import { createHash, randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { RenverseAuthError } from './types.js';
const COOKIE_STATE = 'rv_oidc_state';
const COOKIE_VERIFIER = 'rv_oidc_verifier';
const COOKIE_SESSION = 'rv_app_session';
function b64url(buf) {
    return buf.toString('base64url');
}
function pkceVerifier() {
    return b64url(randomBytes(32));
}
function pkceChallenge(verifier) {
    return createHash('sha256').update(verifier).digest('base64url');
}
const memoryCookieJar = new Map();
function defaultStore() {
    return {
        get(req) {
            const r = req;
            const raw = r.cookies?.[COOKIE_SESSION];
            if (!raw)
                return null;
            try {
                const session = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
                if (session.expiresAt * 1000 < Date.now())
                    return null;
                return session;
            }
            catch {
                return null;
            }
        },
        set(_req, res, session) {
            const r = res;
            const value = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
            r.cookie?.(COOKIE_SESSION, value, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                maxAge: Math.max(0, session.expiresAt * 1000 - Date.now()),
            });
        },
        clear(_req, res) {
            res.clearCookie?.(COOKIE_SESSION, { path: '/' });
        },
    };
}
let jwksCache = null;
let jwksIssuer = null;
async function getJwks(issuer) {
    if (jwksCache && jwksIssuer === issuer)
        return jwksCache;
    try {
        const discovery = await fetch(`${issuer}/.well-known/openid-configuration`);
        if (!discovery.ok) {
            throw new RenverseAuthError('oidc_jwks_unavailable', 'discovery failed');
        }
        const doc = (await discovery.json());
        jwksCache = jose.createRemoteJWKSet(new URL(doc.jwks_uri));
        jwksIssuer = issuer;
        return jwksCache;
    }
    catch (e) {
        if (e instanceof RenverseAuthError)
            throw e;
        throw new RenverseAuthError('oidc_jwks_unavailable', String(e));
    }
}
export function hasApp(claims, appKey) {
    return Array.isArray(claims.apps) && claims.apps.includes(appKey);
}
export function hasAddon(claims, addonKey) {
    return Array.isArray(claims.addons) && claims.addons.includes(addonKey);
}
export async function validateAccessToken(token, opts) {
    try {
        const key = await getJwks(opts.issuer);
        const { payload } = await jose.jwtVerify(token, key, {
            issuer: opts.issuer,
            audience: opts.audience,
        });
        return payload;
    }
    catch (e) {
        if (e instanceof RenverseAuthError)
            throw e;
        throw new RenverseAuthError('oidc_token_invalid', String(e));
    }
}
export function createOidcClient(config, store = defaultStore()) {
    const scopes = config.scopes || 'openid profile email';
    return {
        async loginRedirect(req, res) {
            const r = req;
            const out = res;
            const state = b64url(randomBytes(16));
            const verifier = pkceVerifier();
            const challenge = pkceChallenge(verifier);
            out.cookie?.(COOKIE_STATE, state, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 600_000,
            });
            out.cookie?.(COOKIE_VERIFIER, verifier, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 600_000,
            });
            // also stash for non-cookie test clients
            memoryCookieJar.set(COOKIE_STATE, state);
            memoryCookieJar.set(COOKIE_VERIFIER, verifier);
            const url = new URL(`${config.issuer}/oauth/authorize`);
            url.searchParams.set('client_id', config.clientId);
            url.searchParams.set('redirect_uri', config.redirectUri);
            url.searchParams.set('response_type', 'code');
            url.searchParams.set('scope', scopes);
            url.searchParams.set('state', state);
            url.searchParams.set('code_challenge', challenge);
            url.searchParams.set('code_challenge_method', 'S256');
            out.redirect(url.toString());
        },
        async handleCallback(req, res) {
            const r = req;
            const out = res;
            const code = String(r.query?.code || '');
            const state = String(r.query?.state || '');
            const expectedState = r.cookies?.[COOKIE_STATE] || memoryCookieJar.get(COOKIE_STATE);
            const verifier = r.cookies?.[COOKIE_VERIFIER] || memoryCookieJar.get(COOKIE_VERIFIER);
            if (!expectedState || state !== expectedState) {
                throw new RenverseAuthError('oidc_invalid_state', 'state mismatch');
            }
            if (!verifier || !code) {
                throw new RenverseAuthError('oidc_pkce_failed', 'missing verifier/code');
            }
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.redirectUri,
                client_id: config.clientId,
                code_verifier: verifier,
            });
            if (config.clientSecret)
                body.set('client_secret', config.clientSecret);
            const tokenRes = await fetch(`${config.issuer}/oauth/token`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });
            if (!tokenRes.ok) {
                const text = await tokenRes.text();
                throw new RenverseAuthError('oidc_token_invalid', `token endpoint ${tokenRes.status}: ${text}`);
            }
            const tokens = (await tokenRes.json());
            const claims = await validateAccessToken(tokens.access_token, {
                issuer: config.issuer,
                audience: config.clientId,
            });
            if (config.entitlement === 'addon') {
                if (!hasAddon(claims, config.appKey)) {
                    throw new RenverseAuthError('oidc_addon_missing', `${config.appKey} not in addons[]`);
                }
            }
            else if (!hasApp(claims, config.appKey)) {
                throw new RenverseAuthError('oidc_entitlement_missing', `${config.appKey} not in apps[]`);
            }
            const session = {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                claims,
                expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in || 900),
            };
            store.set(req, res, session);
            out.clearCookie?.(COOKIE_STATE, { path: '/' });
            out.clearCookie?.(COOKIE_VERIFIER, { path: '/' });
            return session;
        },
        async logout(req, res, opts) {
            store.clear(req, res);
            if (opts?.rpInitiated) {
                const url = new URL(`${config.issuer}/oauth/logout`);
                url.searchParams.set('post_logout_redirect_uri', config.redirectUri);
                res.redirect(url.toString());
            }
        },
        async validateAccessToken(token) {
            const claims = await validateAccessToken(token, {
                issuer: config.issuer,
                audience: config.clientId,
            });
            if (config.entitlement === 'addon') {
                if (!hasAddon(claims, config.appKey)) {
                    throw new RenverseAuthError('oidc_addon_missing', `${config.appKey} not in addons[]`);
                }
            }
            else if (!hasApp(claims, config.appKey)) {
                throw new RenverseAuthError('oidc_entitlement_missing', `${config.appKey} not in apps[]`);
            }
            return claims;
        },
        getSession(req) {
            return store.get(req);
        },
    };
}
export function getSession(req, store = defaultStore()) {
    return store.get(req);
}
export function requireAuth(opts) {
    const store = opts?.store ?? defaultStore();
    return async (req, res, next) => {
        try {
            const r = req;
            let session = store.get(req);
            if (!session) {
                const auth = String(r.headers?.authorization || '');
                if (auth.startsWith('Bearer ') && opts?.config) {
                    const token = auth.slice(7);
                    const claims = await validateAccessToken(token, {
                        issuer: opts.config.issuer,
                        audience: opts.config.clientId,
                    });
                    session = {
                        accessToken: token,
                        claims,
                        expiresAt: claims.exp,
                    };
                }
            }
            if (!session) {
                res.status?.(401)?.json?.({
                    error: 'oidc_token_invalid',
                });
                return;
            }
            r.renverseSession = session;
            next();
        }
        catch (e) {
            next(e);
        }
    };
}
export function requireApp(appKey, store = defaultStore()) {
    return (req, res, next) => {
        const session = req.renverseSession ?? store.get(req);
        if (!session || !hasApp(session.claims, appKey)) {
            res.status?.(403)?.json?.({
                error: 'oidc_entitlement_missing',
            });
            return;
        }
        next();
    };
}
export function requireAddon(addonKey, store = defaultStore()) {
    return (req, res, next) => {
        const session = req.renverseSession ?? store.get(req);
        if (!session || !hasAddon(session.claims, addonKey)) {
            res.status?.(403)?.json?.({
                error: 'oidc_addon_missing',
            });
            return;
        }
        next();
    };
}
export const ORG_CONTEXT_HEADER = 'x-renverse-org-id';
export function getOrgId(input) {
    if (!input)
        return null;
    const session = input;
    if (session.claims && typeof session.claims.org_id === 'string') {
        return session.claims.org_id;
    }
    const claims = input;
    if (typeof claims.org_id === 'string')
        return claims.org_id;
    return null;
}
export function orgContextHeaders(orgId) {
    return { [ORG_CONTEXT_HEADER]: orgId };
}
export function assertOrgMatch(claims, expectedOrgId) {
    if (claims.org_id !== expectedOrgId) {
        throw new RenverseAuthError('oidc_org_mismatch', `token org_id ${claims.org_id} !== ${expectedOrgId}`);
    }
}
export function requireOrgContext(expectedOrgId, store = defaultStore()) {
    return (req, res, next) => {
        try {
            const r = req;
            const session = r.renverseSession ?? store.get(req);
            if (!session) {
                res.status?.(401)?.json?.({
                    error: 'oidc_token_invalid',
                });
                return;
            }
            const headerOrg = String(r.headers?.[ORG_CONTEXT_HEADER] ||
                r.headers?.['X-RenVerse-Org-Id'] ||
                '');
            const expected = expectedOrgId || headerOrg;
            if (expected) {
                assertOrgMatch(session.claims, expected);
            }
            next();
        }
        catch (e) {
            if (e instanceof RenverseAuthError && e.code === 'oidc_org_mismatch') {
                res.status?.(403)?.json?.({
                    error: 'oidc_org_mismatch',
                    message: e.message,
                });
                return;
            }
            next(e);
        }
    };
}
export function isFlagEnabled(name) {
    const mode = process.env.RENVERSE_MODE || 'standalone';
    const flags = parseFlags();
    if (typeof flags[name] === 'boolean')
        return flags[name];
    if (mode === 'suite') {
        if (name === 'renverse.oidc' || name === 'renverse.launcher_chrome') {
            return true;
        }
        // Connect on by default in suite when Connect URL is configured
        if ((name === 'renverse.connect.emit' || name === 'renverse.connect.consume') &&
            process.env.RENVERSE_CONNECT_URL) {
            return true;
        }
        if (name === 'renverse.issa' && process.env.RENVERSE_ISSA_URL) {
            return true;
        }
    }
    return false;
}
function parseFlags() {
    const raw = process.env.RENVERSE_FLAGS || '';
    const out = {};
    for (const part of raw.split(',')) {
        const p = part.trim();
        if (!p)
            continue;
        if (p.startsWith('!'))
            out[p.slice(1)] = false;
        else if (p.includes('=')) {
            const [k, v] = p.split('=');
            out[k.trim()] = v.trim() === 'true' || v.trim() === '1';
        }
        else
            out[p] = true;
    }
    return out;
}
export function configFromEnv(overrides) {
    return {
        issuer: process.env.RENVERSE_OIDC_ISSUER || 'http://localhost:9100',
        clientId: process.env.RENVERSE_OIDC_CLIENT_ID || '',
        clientSecret: process.env.RENVERSE_OIDC_CLIENT_SECRET,
        redirectUri: process.env.RENVERSE_OIDC_REDIRECT_URI || '',
        scopes: process.env.RENVERSE_OIDC_SCOPES || 'openid profile email',
        ...overrides,
    };
}
