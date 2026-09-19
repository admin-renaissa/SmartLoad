import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPairApplyAllowed } from './pairGate.js';
describe('isPairApplyAllowed', () => {
    const client = {
        async pairEnabled() {
            return { enabled: true, items: [{}] };
        },
    };
    it('false in standalone', async () => {
        assert.equal(await isPairApplyAllowed(client, {
            mode: 'standalone',
            orgId: 'org_1',
            sourceApp: 'renexus',
            targetApp: 'renovax',
        }), false);
    });
    it('true in suite when pair enabled', async () => {
        assert.equal(await isPairApplyAllowed(client, {
            mode: 'suite',
            orgId: 'org_1',
            sourceApp: 'renexus',
            targetApp: 'renovax',
        }), true);
    });
});
