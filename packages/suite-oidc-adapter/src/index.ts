import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createOidcClient,
  hasApp,
  hasAddon,
  isFlagEnabled,
  RenverseAuthError,
  validateAccessToken,
  resolveAuthPhase,
  type AccessTokenClaims,
  type AddonKey,
  type AppKey,
  type OidcConfig,
  type Session,
} from '@renverse/auth-sdk';
import {
  createInMemoryLocalAuthStore,
  LINK_USER_COOKIE,
  type LocalAuthStore,
} from './localAuth.js';
import { completeAccountLink } from './linkFlow.js';
import { registerMigrationRoutes, renderLinkBannerHtml, linkConflictUrl } from './migration.js';

export type JitResult = {
  localUserId: string;
  localTenantId: string;
  suiteRole?: string;
};

export type SuiteOidcAdapterOptions = {
  config: OidcConfig;
  /** Human-readable product name for dual-login copy */
  appDisplayName?: string;
  /** Override in-memory local user store (Phase A migration) */
  localAuth?: LocalAuthStore;
  defaultTenantId?: string;
  accountsOrigin?: string;
  /** Register /login, local auth, link/start (default true in suite mode) */
  migration?: boolean;
  /** Persist JIT user/tenant; return local ids. `req` is passed so account-link cookies can bind. */
  onJit: (claims: AccessTokenClaims, req: Request) => Promise<JitResult>;
  /**
   * Optional first-enable / AppLink bind after JIT.
   * May update localTenantId via returned JitResult override.
   */
  onFirstEnable?: (
    claims: AccessTokenClaims,
    jit: JitResult,
    session: Session,
    req?: Request,
  ) => Promise<JitResult | void>;
  /** Optional: establish app-native session (JWT cookies etc.) */
  onSession?: (
    req: Request,
    res: Response,
    session: Session,
    jit: JitResult,
  ) => Promise<void> | void;
  contractsVersion?: string;
  /** Per-request tenant/org Phase B cutover from product DB */
  resolveTenantCutover?: (req: Request) => boolean | Promise<boolean>;
};

declare module 'express-serve-static-core' {
  interface Request {
    renverseSession?: Session;
    renverseJit?: JitResult;
  }
}

const APP_DISPLAY: Record<string, string> = {
  renexus: 'Renexus',
  renbooks: 'RenBooks',
  renorc: 'RenOrc',
  renovax: 'ReNovaX',
  creator: 'RenAura',
  renaura: 'RenAura',
  smartload: 'SmartLoad',
};

export function seedDemoLocalUser(
  store: LocalAuthStore,
  appKey: string,
  tenantId: string,
): void {
  store.seedDemoUserSync({
    email: process.env.DEMO_USER_EMAIL || 'demo@renaissa.ai',
    password: process.env.DEMO_USER_PASSWORD || 'ChangeMe-Demo-123!',
    tenantId,
  });
}

export function createSuiteOidcRouter(opts: SuiteOidcAdapterOptions): Router {
  const router = Router();
  const client = createOidcClient(opts.config);
  const mode = process.env.RENVERSE_MODE || 'standalone';
  const appDisplayName =
    opts.appDisplayName || APP_DISPLAY[opts.config.appKey] || opts.config.appKey;
  const defaultTenantId =
    opts.defaultTenantId || `tenant_demo_${opts.config.appKey}`;
  const accountsOrigin =
    opts.accountsOrigin ||
    process.env.ACCOUNTS_ORIGIN ||
    'http://localhost:9101';
  const localAuth = opts.localAuth ?? createInMemoryLocalAuthStore(opts.config.appKey);
  if (mode === 'suite') {
    seedDemoLocalUser(localAuth, opts.config.appKey, defaultTenantId);
  }

  router.use((req, _res, next) => {
    req.renverseSession = client.getSession(req) ?? req.renverseSession;
    next();
  });

  router.get('/renverse/status', async (req, res) => {
    const session = client.getSession(req);
    const tenantCutover = opts.resolveTenantCutover
      ? await Promise.resolve(opts.resolveTenantCutover(req))
      : false;
    const authPhase = resolveAuthPhase({ mode, tenantCutover });
    res.json({
      ok: true,
      mode,
      authPhase,
      appKey: opts.config.appKey,
      contractsVersion:
        opts.contractsVersion ||
        process.env.RENVERSE_CONTRACTS_VERSION ||
        '1.0.0',
      issuer: opts.config.issuer,
      oidc: mode === 'suite',
      identityOnly: authPhase === 'cutover',
      tenantCutover: Boolean(tenantCutover),
      launcherChrome: isFlagEnabled('renverse.launcher_chrome'),
      orgId: session?.claims?.org_id ?? null,
      authenticated: Boolean(session),
      timestamp: new Date().toISOString(),
    });
  });

  if (mode === 'suite' && opts.migration !== false) {
    registerMigrationRoutes({
      router,
      mode,
      appDisplayName,
      appKey: opts.config.appKey,
      accountsOrigin,
      store: localAuth,
      defaultTenantId,
      resolveTenantCutover: opts.resolveTenantCutover,
    });
  }

  router.get('/auth/login', async (req, res, next) => {
    try {
      if (mode !== 'suite') {
        res.status(400).json({ error: 'suite_mode_required' });
        return;
      }
      await client.loginRedirect(req, res);
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/callback', async (req, res, next) => {
    try {
      if (mode !== 'suite') {
        res.status(400).json({ error: 'suite_mode_required' });
        return;
      }
      const session = await client.handleCallback(req, res);
      if (opts.config.entitlement === 'addon') {
        if (!hasAddon(session.claims, opts.config.appKey as AddonKey)) {
          throw new RenverseAuthError(
            'oidc_addon_missing',
            `${opts.config.appKey} missing from addons[]`,
          );
        }
      } else if (!hasApp(session.claims, opts.config.appKey)) {
        throw new RenverseAuthError(
          'oidc_entitlement_missing',
          `${opts.config.appKey} missing`,
        );
      }
      let jit = await opts.onJit(session.claims, req);
      if (opts.onFirstEnable) {
        const updated = await opts.onFirstEnable(session.claims, jit, session, req);
        if (updated) jit = updated;
      }

      const linkUserId = req.cookies?.[LINK_USER_COOKIE];
      if (linkUserId) {
        const link = completeAccountLink({
          store: localAuth,
          localUserId: String(linkUserId),
          claims: session.claims,
        });
        res.clearCookie(LINK_USER_COOKIE, { path: '/' });
        if (!link.ok) {
          if (link.error === 'link_conflict') {
            const conflictUrl = linkConflictUrl(accountsOrigin, {
              email: session.claims.email ?? 'unknown',
              appKey: opts.config.appKey,
            });
            res.redirect(conflictUrl);
            return;
          }
          res.status(403).type('html').send(
            `<p>We could not link this account (${link.error}). Contact your admin.</p>`,
          );
          return;
        }
      }

      await opts.onSession?.(req, res, session, jit);
      req.renverseSession = session;
      req.renverseJit = jit;
      const redirect =
        (req.query.next as string) ||
        (linkUserId ? '/?linked=1' : undefined) ||
        process.env.RENVERSE_POST_LOGIN_REDIRECT ||
        '/';
      res.redirect(redirect);
    } catch (e) {
      if (e instanceof RenverseAuthError) {
        res.status(
          e.code === 'oidc_entitlement_missing' || e.code === 'oidc_addon_missing'
            ? 403
            : 400,
        ).json({
          error: e.code,
          message: e.message,
        });
        return;
      }
      next(e);
    }
  });

  router.post('/auth/logout', async (req, res, next) => {
    try {
      await client.logout(req, res, { rpInitiated: false });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/logout', async (req, res, next) => {
    try {
      await client.logout(req, res, { rpInitiated: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function suiteModeEnabled(): boolean {
  return (process.env.RENVERSE_MODE || 'standalone') === 'suite';
}

/**
 * Suite entitlement gate — no-op when `RENVERSE_MODE !== suite`.
 * Accepts cookie OIDC session or `Authorization: Bearer` Identity access token.
 */
export function requireSuiteEntitlement(appKey: AppKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!suiteModeEnabled()) return next();

    const issuer = process.env.RENVERSE_OIDC_ISSUER || '';
    const clientId = process.env.RENVERSE_OIDC_CLIENT_ID || '';
    const oidc = createOidcClient({
      issuer,
      clientId,
      redirectUri: process.env.RENVERSE_OIDC_REDIRECT_URI || '',
      appKey,
    });

    try {
      let session: Session | null | undefined =
        req.renverseSession || oidc.getSession(req);

      if (!session) {
        const hdr = req.headers.authorization;
        if (typeof hdr === 'string' && hdr.startsWith('Bearer ')) {
          const token = hdr.slice(7).trim();
          if (token && issuer) {
            const claims = await validateAccessToken(token, {
              issuer,
              audience: clientId || undefined,
            });
            session = {
              accessToken: token,
              claims,
              expiresAt:
                typeof claims.exp === 'number'
                  ? claims.exp
                  : Math.floor(Date.now() / 1000) + 900,
            };
          }
        }
      }

      if (!session || !hasApp(session.claims, appKey)) {
        res.status(403).json({ error: 'oidc_entitlement_missing' });
        return;
      }
      req.renverseSession = session;
      next();
    } catch {
      res.status(403).json({ error: 'oidc_entitlement_missing' });
    }
  };
}

export { runFirstEnable } from './firstEnable.js';
export { renderLinkBannerHtml, linkConflictUrl } from './migration.js';
export { completeAccountLink } from './linkFlow.js';
export {
  createInMemoryLocalAuthStore,
  type LocalAuthStore,
  type LocalUser,
} from './localAuth.js';
