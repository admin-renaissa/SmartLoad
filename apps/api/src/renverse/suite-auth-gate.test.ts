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
  it('resolves authPhase and blocks local login on cutover', () => {
    assert.equal(resolveAuthPhase({ mode: 'suite' }), 'dual');
    assert.equal(
      resolveAuthPhase({ mode: 'suite', envPhase: 'cutover' }),
      'cutover',
    );
    assert.equal(
      resolveAuthPhase({ mode: 'suite', tenantCutover: true }),
      'cutover',
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'suite', authPhase: 'cutover' }),
      true,
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'suite', tenantCutover: true }),
      true,
    );
    assert.equal(SUITE_CUTOVER_CODE, 'SUITE_CUTOVER_REQUIRED');
  });
});
