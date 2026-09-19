import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  resolveAuthPhase,
  shouldBlockLocalLogin,
  shouldShowLocalLoginOnClient,
  isSuiteAuthCutoverPhase,
  isSuiteAuthCutoverMisconfigured,
} from './authPhase.js';

describe('authPhase', () => {
  const prevMode = process.env.RENVERSE_MODE;
  const prevPhase = process.env.RENVERSE_SUITE_AUTH_PHASE;
  const prevLegacy = process.env.RENVERSE_IDENTITY_ONLY;

  beforeEach(() => {
    delete process.env.RENVERSE_MODE;
    delete process.env.RENVERSE_SUITE_AUTH_PHASE;
    delete process.env.RENVERSE_IDENTITY_ONLY;
  });

  afterEach(() => {
    if (prevMode === undefined) delete process.env.RENVERSE_MODE;
    else process.env.RENVERSE_MODE = prevMode;
    if (prevPhase === undefined) delete process.env.RENVERSE_SUITE_AUTH_PHASE;
    else process.env.RENVERSE_SUITE_AUTH_PHASE = prevPhase;
    if (prevLegacy === undefined) delete process.env.RENVERSE_IDENTITY_ONLY;
    else process.env.RENVERSE_IDENTITY_ONLY = prevLegacy;
  });

  it('standalone when not suite', () => {
    assert.equal(resolveAuthPhase({ mode: 'standalone' }), 'standalone');
  });

  it('dual in suite by default', () => {
    assert.equal(resolveAuthPhase({ mode: 'suite' }), 'dual');
  });

  it('ignores env and tenant cutover flags', () => {
    assert.equal(
      resolveAuthPhase({ mode: 'suite', envPhase: 'cutover' }),
      'dual',
    );
    assert.equal(
      resolveAuthPhase({ mode: 'suite', tenantCutover: true }),
      'dual',
    );
  });

  it('legacy IDENTITY_ONLY is misconfigured but does not cut over', () => {
    process.env.RENVERSE_IDENTITY_ONLY = '1';
    assert.equal(isSuiteAuthCutoverMisconfigured(), true);
    assert.equal(isSuiteAuthCutoverPhase(), false);
    assert.equal(resolveAuthPhase({ mode: 'suite' }), 'dual');
  });

  it('never blocks local login', () => {
    assert.equal(
      shouldBlockLocalLogin({
        mode: 'suite',
        authPhase: 'cutover',
        tenantCutover: true,
      }),
      false,
    );
    assert.equal(
      shouldBlockLocalLogin({ mode: 'standalone', tenantCutover: true }),
      false,
    );
  });

  it('always shows local login UI in suite', () => {
    assert.equal(
      shouldShowLocalLoginOnClient({ suiteMode: true, authPhase: 'dual' }),
      true,
    );
    assert.equal(
      shouldShowLocalLoginOnClient({ suiteMode: true, authPhase: 'cutover' }),
      true,
    );
  });
});
