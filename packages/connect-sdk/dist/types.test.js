import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnvelope, createEventId } from './types.js';
describe('connect-sdk envelope', () => {
    it('createEventId uses evt_ prefix', () => {
        assert.match(createEventId(), /^evt_[a-f0-9]+$/);
    });
    it('createEnvelope fills required fields', () => {
        const env = createEnvelope({
            type: 'renexus.time.approved.v1',
            source: 'renexus',
            orgId: 'org_demo00000001',
            payload: {
                timeEntryId: 'te1',
                userId: 'usr1',
                projectId: 'p1',
                minutes: 60,
                workDate: '2026-08-16',
            },
        });
        assert.equal(env.specVersion, '1.0');
        assert.equal(env.source, 'renexus');
        assert.match(env.id, /^evt_/);
        assert.ok(Date.parse(env.occurredAt));
    });
});
