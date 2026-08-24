/**
 * Run: npx tsx --test apps/api/src/renverse/suite-link.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENVERSE_LINK_COOKIE,
  readRenverseLinkUserId,
  setRenverseLinkCookie,
  clearRenverseLinkCookie,
} from './suite-link.js';

describe('suite-link', () => {
  it('reads cookie bag and Cookie header', () => {
    assert.equal(
      readRenverseLinkUserId({ cookies: { [RENVERSE_LINK_COOKIE]: 'u1' } }),
      'u1',
    );
    assert.equal(
      readRenverseLinkUserId({
        headers: { cookie: `${RENVERSE_LINK_COOKIE}=u2; x=1` },
      }),
      'u2',
    );
  });

  it('sets and clears cookie via Express-style res', () => {
    const cookies: Array<{ name: string; value?: string }> = [];
    const res = {
      cookie: (name: string, value: string) => cookies.push({ name, value }),
      clearCookie: (name: string) => cookies.push({ name }),
    };
    setRenverseLinkCookie(res, 'link_me');
    assert.equal(cookies[0]?.name, RENVERSE_LINK_COOKIE);
    clearRenverseLinkCookie(res);
    assert.equal(cookies[1]?.name, RENVERSE_LINK_COOKIE);
  });
});
