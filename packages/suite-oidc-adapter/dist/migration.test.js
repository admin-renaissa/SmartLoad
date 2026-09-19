import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createSuiteOidcRouter } from './index.js';
import { linkConflictUrl } from './migration.js';
describe('linkConflictUrl', () => {
    it('builds Accounts A12 URL with email and app', () => {
        const url = linkConflictUrl('http://localhost:9101', {
            email: 'you@company.com',
            appKey: 'renexus',
        });
        assert.match(url, /\/link-conflict\?/);
        assert.match(url, /email=you%40company\.com/);
        assert.match(url, /app=renexus/);
    });
});
describe('migration routes', () => {
    let server;
    let base = '';
    before(async () => {
        process.env.RENVERSE_MODE = 'suite';
        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(createSuiteOidcRouter({
            config: {
                issuer: 'http://localhost:9100',
                clientId: 'app_renexus_web',
                redirectUri: 'http://localhost:9102/auth/callback',
                appKey: 'renexus',
            },
            appDisplayName: 'Renexus',
            async onJit(claims) {
                return {
                    localUserId: `local_${claims.sub}`,
                    localTenantId: `tenant_${claims.org_id}`,
                };
            },
        }));
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const addr = server.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;
                base = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });
    after(async () => {
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });
    it('returns 401 for link/start without local session', async () => {
        const res = await fetch(`${base}/renverse/link/start`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        assert.equal(res.status, 401);
    });
    it('serves dual-login page even when tenant cutover resolver is true', async () => {
        const cutoverApp = express();
        cutoverApp.use(cookieParser());
        cutoverApp.use(express.json());
        cutoverApp.use(express.urlencoded({ extended: true }));
        cutoverApp.use(createSuiteOidcRouter({
            resolveTenantCutover: () => true,
            config: {
                issuer: 'http://localhost:9100',
                clientId: 'app_renexus_web',
                redirectUri: 'http://localhost:9102/auth/callback',
                appKey: 'renexus',
            },
            appDisplayName: 'Renexus',
            async onJit(claims) {
                return {
                    localUserId: `local_${claims.sub}`,
                    localTenantId: `tenant_${claims.org_id}`,
                };
            },
        }));
        const srv = await new Promise((resolve) => {
            const s = cutoverApp.listen(0, () => resolve(s));
        });
        try {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            const res = await fetch(`http://127.0.0.1:${port}/login`);
            const html = await res.text();
            assert.match(html, /Sign in with RenVerse/);
            assert.match(html, /Continue with Renexus account/);
            const local = await fetch(`http://127.0.0.1:${port}/renverse/auth/local`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email=a@b.com&password=x',
                redirect: 'manual',
            });
            assert.notEqual(local.status, 403);
        }
        finally {
            await new Promise((resolve, reject) => {
                srv.close((err) => (err ? reject(err) : resolve()));
            });
        }
    });
    it('serves dual-login page at /login', async () => {
        const res = await fetch(`${base}/login`);
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.match(html, /Sign in with RenVerse/);
        assert.match(html, /Continue with Renexus account/);
    });
});
