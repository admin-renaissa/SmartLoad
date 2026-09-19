import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInMemoryLocalAuthStore } from './localAuth.js';
import { completeAccountLink } from './linkFlow.js';
function claims(partial) {
    const now = Math.floor(Date.now() / 1000);
    return {
        iss: 'http://localhost:9100',
        aud: 'app_renexus_web',
        exp: now + 900,
        iat: now,
        apps: ['renexus'],
        roles: ['org_member'],
        ...partial,
    };
}
describe('completeAccountLink', () => {
    it('links when emails match', () => {
        const store = createInMemoryLocalAuthStore('renexus');
        store.seedDemoUserSync({
            email: 'you@company.com',
            password: 'secret123',
            tenantId: 'tenant_a',
        });
        const user = store.findByEmail('you@company.com', 'tenant_a');
        const result = completeAccountLink({
            store,
            localUserId: user.id,
            claims: claims({ sub: 'usr_abc', email: 'you@company.com', org_id: 'org_1' }),
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.sub, 'usr_abc');
            assert.equal(store.findById(user.id)?.renverseSub, 'usr_abc');
        }
    });
    it('rejects email mismatch', () => {
        const store = createInMemoryLocalAuthStore('renexus');
        store.seedDemoUserSync({
            email: 'you@company.com',
            password: 'secret123',
            tenantId: 'tenant_a',
        });
        const user = store.findByEmail('you@company.com', 'tenant_a');
        const result = completeAccountLink({
            store,
            localUserId: user.id,
            claims: claims({ sub: 'usr_abc', email: 'other@company.com', org_id: 'org_1' }),
        });
        assert.equal(result.ok, false);
        if (!result.ok)
            assert.equal(result.error, 'link_email_mismatch');
    });
});
