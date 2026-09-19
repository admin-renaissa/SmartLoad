import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { peerScopeEntity } from './peer.js';
describe('peer helpers', () => {
    it('parses read scope', () => {
        assert.equal(peerScopeEntity('read:deal'), 'deal');
        assert.equal(peerScopeEntity('write:deal'), '');
    });
});
