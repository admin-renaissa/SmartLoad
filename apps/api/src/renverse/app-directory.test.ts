import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAppDirectoryServiceAuthorized, lookupOrgsByName } from './app-directory.js';

describe('SmartLoad app directory', () => {
  it('rejects a wrong bearer', () => {
    process.env.APP_DIRECTORY_SERVICE_TOKEN = 'secret-token';
    assert.equal(isAppDirectoryServiceAuthorized('wrong-token'), false);
    assert.equal(isAppDirectoryServiceAuthorized('secret-token'), true);
  });

  it('returns no matches for a short name without querying', async () => {
    const matches = await lookupOrgsByName(
      { organization: { findMany: async () => assert.fail('should not query') } },
      'ab',
    );
    assert.deepEqual(matches, []);
  });

  it('maps local organization ids for a name match', async () => {
    const matches = await lookupOrgsByName(
      {
        organization: {
          findMany: async () => [{ id: 'org_local_1', name: 'Acme Freight' }],
        },
      },
      'Acme',
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.externalTenantId, 'org_local_1');
    assert.equal(matches[0]?.organizationName, 'Acme Freight');
    assert.equal(matches[0]?.tenantName, 'Acme Freight');
  });
});
