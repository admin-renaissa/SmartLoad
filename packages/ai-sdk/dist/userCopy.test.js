import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { issaAppLabel, issaComposeFacts, issaToolUserCopy, sanitizeIssaUserText, } from './userCopy.js';
describe('issa user copy', () => {
    it('maps tool ids to product names', () => {
        assert.equal(issaAppLabel('renbooks.balance.summary'), 'RenBooks');
        assert.equal(issaAppLabel('renexus'), 'Renexus');
        assert.equal(issaAppLabel(''), 'that app');
    });
    it('hides tool ids from members and keeps them for ops', () => {
        const member = issaToolUserCopy({
            ok: false,
            toolId: 'renbooks.balance.summary',
            errorCode: 'callback_failed',
        });
        assert.equal(member.headline, 'Couldn’t finish in RenBooks. Try again or open the app.');
        assert.equal(member.detail, undefined);
        const ops = issaToolUserCopy({
            ok: false,
            toolId: 'renbooks.balance.summary',
            errorCode: 'callback_failed',
            audience: 'ops',
        });
        assert.match(ops.detail || '', /renbooks\.balance\.summary/);
        assert.match(ops.detail || '', /callback_failed/);
    });
    it('scrubs leaked ids and error codes from assistant text', () => {
        const raw = 'The tool "renbooks.balance.summary" failed with callback_failed.';
        const clean = sanitizeIssaUserText(raw);
        assert.equal(clean.includes('renbooks.balance.summary'), false);
        assert.equal(clean.includes('callback_failed'), false);
        assert.match(clean, /RenBooks/);
        const prose = sanitizeIssaUserText('Unfortunately, the tool "renbooks.balance.summary" was unable to provide the cash position summary due to a callback failure error.');
        assert.equal(prose.includes('renbooks.balance.summary'), false);
        assert.equal(/callback/i.test(prose), false);
        assert.match(prose, /RenBooks/);
        const leftover = sanitizeIssaUserText('According to the tool results provided, the "renorc.agent.run_status" returned an error code of "callback_failed".');
        assert.equal(leftover.includes('renorc.agent.run_status'), false);
        assert.equal(/callback|error code/i.test(leftover), false);
        assert.match(leftover, /RenOrc/);
    });
    it('feeds the composer product names only', () => {
        const facts = issaComposeFacts([
            {
                toolId: 'renbooks.balance.summary',
                ok: false,
                errorCode: 'callback_failed',
            },
        ]);
        assert.deepEqual(facts, [
            { app: 'RenBooks', ok: false, result: undefined, note: 'unavailable' },
        ]);
    });
});
