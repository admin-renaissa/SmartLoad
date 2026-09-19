import type { Router, Request, Response, NextFunction } from 'express';
import {
  resolveAuthPhase,
  shouldBlockLocalLogin,
  shouldShowLocalLoginOnClient,
  suiteCutoverMessage,
  SUITE_CUTOVER_CODE,
} from '@renverse/auth-sdk';
import type { LocalAuthStore } from './localAuth.js';
import { LINK_USER_COOKIE, LOCAL_SESSION_COOKIE } from './localAuth.js';

export type MigrationRouterOpts = {
  router: Router;
  mode: string;
  appDisplayName: string;
  appKey: string;
  accountsOrigin: string;
  store: LocalAuthStore;
  defaultTenantId: string;
  /** Per-request tenant/org cutover (DB flag). Return true when Phase B applies. */
  resolveTenantCutover?: (req: Request) => boolean | Promise<boolean>;
};

async function authPhaseForRequest(
  mode: string,
  req: Request,
  resolveTenantCutover?: MigrationRouterOpts['resolveTenantCutover'],
) {
  const tenantCutover = resolveTenantCutover
    ? await Promise.resolve(resolveTenantCutover(req))
    : false;
  return resolveAuthPhase({ mode, tenantCutover });
}

export function linkConflictUrl(
  accountsOrigin: string,
  params: { email: string; appKey: string },
): string {
  const url = new URL('/link-conflict', accountsOrigin);
  url.searchParams.set('error', 'link_conflict');
  url.searchParams.set('email', params.email);
  url.searchParams.set('app', params.appKey);
  return url.toString();
}

function readLocalUserId(req: Request): string | undefined {
  const raw = req.cookies?.[LOCAL_SESSION_COOKIE];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function registerMigrationRoutes(opts: MigrationRouterOpts): void {
  const {
    router,
    mode,
    appDisplayName,
    appKey,
    accountsOrigin,
    store,
    defaultTenantId,
  } = opts;

  router.get('/login', async (req, res) => {
    if (mode !== 'suite') {
      res.redirect('/');
      return;
    }
    const authPhase = await authPhaseForRequest(mode, req, opts.resolveTenantCutover);
    const showLocal = shouldShowLocalLoginOnClient({ suiteMode: true, authPhase });
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"/><title>${appDisplayName} — Sign in</title></head>
<body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem">
<h1>${appDisplayName}</h1>
<p>Use RenVerse for one sign-in across suite apps, or continue with your ${appDisplayName} password.</p>
<p><a href="/auth/login" style="display:inline-block;padding:0.65rem 1rem;background:#e11d2e;color:#fff;text-decoration:none;border-radius:8px;margin-bottom:1rem">Sign in with RenVerse</a></p>
${
  showLocal
    ? `<hr style="margin:1.5rem 0"/>
              <h2 style="font-size:1rem">Continue with ${appDisplayName} account</h2>
              <form method="post" action="/renverse/auth/local">
                <label>Work email<br/><input name="email" type="email" required style="width:100%;padding:0.5rem;margin:0.35rem 0 0.75rem"/></label>
                <label>Password<br/><input name="password" type="password" required style="width:100%;padding:0.5rem;margin:0.35rem 0 0.75rem"/></label>
                <button type="submit" style="width:100%;padding:0.65rem;background:#111;color:#fff;border:none;border-radius:8px">Continue with ${appDisplayName}</button>
              </form>
              <p style="font-size:0.875rem;color:#555;margin-top:1rem">After local sign-in, link to RenVerse from the home banner for SSO across apps.</p>`
    : ''
}
<p style="margin-top:1.5rem;font-size:0.875rem"><a href="${accountsOrigin}/login">RenVerse Accounts</a></p>
</body></html>`);
  });

  router.post('/renverse/auth/local', async (req, res) => {
    if (mode !== 'suite') {
      res.status(400).json({ error: 'suite_mode_required' });
      return;
    }
    // Dual-login policy: never 403 local password for suite orgs.
    if (shouldBlockLocalLogin({ mode })) {
      res.status(403).json({ error: SUITE_CUTOVER_CODE, message: suiteCutoverMessage() });
      return;
    }
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      res.status(400).json({ error: 'validation_error' });
      return;
    }
    const user = store.findByEmail(email, defaultTenantId);
    if (!user || !(await store.verifyPassword(user, password))) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    res.cookie(LOCAL_SESSION_COOKIE, user.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    res.redirect('/');
  });

  router.post('/renverse/link/start', (req, res) => {
    if (mode !== 'suite') {
      res.status(400).json({ error: 'suite_mode_required' });
      return;
    }
    const localUserId = readLocalUserId(req);
    if (!localUserId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const local = store.findById(localUserId);
    if (!local) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (local.renverseSub) {
      res.json({ ok: true, status: 'already_linked', sub: local.renverseSub });
      return;
    }
    if (store.countByEmailInTenant(local.email, local.tenantId) > 1) {
      res.status(403).json({
        error: 'link_conflict',
        message:
          'More than one local account matches this email. Ask your admin to link accounts.',
        email: local.email,
        appKey,
        accountsUrl: linkConflictUrl(accountsOrigin, {
          email: local.email,
          appKey,
        }),
      });
      return;
    }
    res.cookie(LINK_USER_COOKIE, local.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600 * 1000,
    });
    res.json({
      ok: true,
      status: 'pending_oidc',
      authorizePath: '/auth/login?renverse_link=1',
    });
  });

  router.get('/renverse/link/banner', (req, res) => {
    if (mode !== 'suite') {
      res.json({ show: false });
      return;
    }
    const localUserId = readLocalUserId(req);
    const local = localUserId ? store.findById(localUserId) : undefined;
    const oidcSession = Boolean(req.renverseSession);
    res.json({
      show: Boolean(local && !local.renverseSub && !oidcSession),
      linked: Boolean(local?.renverseSub),
      sub: local?.renverseSub ?? null,
      copy: 'Link this account to RenVerse for single sign-on across apps.',
      cta: 'Link to RenVerse',
    });
  });
}

export function renderLinkBannerHtml(): string {
  return `<div id="rv-link-banner" style="display:none;background:#fff7ed;border:1px solid #fdba74;padding:0.75rem;border-radius:8px;margin:1rem 0">
  <p style="margin:0 0 0.5rem">Link this account to RenVerse for single sign-on across apps.</p>
  <button type="button" id="rv-link-start" style="padding:0.45rem 0.75rem;background:#e11d2e;color:#fff;border:none;border-radius:6px;cursor:pointer">Link to RenVerse</button>
</div>
<script>
(async function(){
  const box = document.getElementById('rv-link-banner');
  const btn = document.getElementById('rv-link-start');
  if (!box || !btn) return;
  try {
    const r = await fetch('/renverse/link/banner', { credentials: 'include' });
    const j = await r.json();
    if (j.show) box.style.display = 'block';
    btn.onclick = async function(){
      const start = await fetch('/renverse/link/start', { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body:'{}' });
      const data = await start.json().catch(function(){ return {}; });
      if (data.authorizePath) { window.location.href = data.authorizePath; return; }
      if (data.status === 'already_linked') { alert('Already linked to RenVerse.'); box.style.display='none'; return; }
      if (data.error === 'link_conflict' && data.accountsUrl) { window.location.href = data.accountsUrl; return; }
      alert(data.message || 'Could not start linking. Sign in locally first.');
    };
  } catch (e) { /* optional */ }
})();
</script>`;
}
