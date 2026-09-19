/**
 * Run: npx tsx --test apps/api/src/renverse/suite-auth-gate.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAuthPhase,
  shouldBlockLocalLogin,
  SUITE_CUTOVER_CODE,
} from './suite-auth-gate.js';

describe('suite-auth-gate', () => {
  it('keeps suite dual-login and never blocks local password', () => {
    assert.equal(resolveAuthPhase({ mode: 'standalone' }), 'standalone');
    assert.equal(resolveAuthPhase({ mode: 'suite' }), 'dual');
    assert.equal(
      resolveAuthPhase({ mode: 'suite', envPhase: 'cutover' }),
      'dual',
    );
    assert.equal(
      resolveAuthPhase({ mode: 'suite', tenantCutover: true }),
      'dual',
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'suite', authPhase: 'cutover' }),
      false,
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'suite', tenantCutover: true }),
      false,
    );
    assert.equal(SUITE_CUTOVER_CODE, 'SUITE_CUTOVER_REQUIRED');
  });
});
