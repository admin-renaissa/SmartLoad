import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeSmartloadIssaTool } from './issa-hub-boot.js';

const ctx = (addons?: string[], args: Record<string, unknown> = {}) => ({
  claims: { sub: 'sub_1', org_id: 'org_a', apps: [], ...(addons ? { addons } : {}) } as never,
  arguments: args,
});

describe('SmartLoad ISSA tool gate (add-on, fail closed)', () => {
  it('allows an org with the smartload add-on', () => {
    assert.equal(authorizeSmartloadIssaTool(ctx(['smartload'])), true);
  });
  it('denies when addons is missing or empty', () => {
    assert.equal(authorizeSmartloadIssaTool(ctx()), false);
    assert.equal(authorizeSmartloadIssaTool(ctx([])), false);
  });
  it('denies other add-ons and honours deny', () => {
    assert.equal(authorizeSmartloadIssaTool(ctx(['mail'])), false);
    assert.equal(authorizeSmartloadIssaTool(ctx(['smartload'], { deny: true })), false);
  });
});
