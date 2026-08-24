/**
 * Run: npx tsx --test apps/api/src/renverse/suite-cutover.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthPhase, shouldBlockLocalLogin } from './suite-auth-gate.js';

describe('suite-cutover authPhase wiring', () => {
  it('tenantCutover flips authPhase and blocks local login', () => {
    assert.equal(
      resolveAuthPhase({ mode: 'suite', tenantCutover: true }),
      'cutover',
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'suite', tenantCutover: true }),
      true,
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'standalone', tenantCutover: true }),
      false,
    );
  });

  it('exports isOrgCutover helpers', async () => {
    const mod = await import('./suite-cutover.js');
    assert.equal(typeof mod.isOrgCutover, 'function');
    assert.equal(typeof mod.ensureCutoverColumn, 'function');
    assert.equal(typeof mod.userHasOrgCutover, 'function');
  });
});
