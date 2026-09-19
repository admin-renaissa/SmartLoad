import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createIssaClient } from './client.js';
import { createToolHost } from './tool-host.js';
import { signToolToken } from './token.js';

describe('createIssaClient', () => {
  it('chat posts JSON accept and returns body', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      assert.equal(String(_url), 'http://hub/v1/chat');
      assert.equal((init?.headers as Record<string, string>).accept, 'application/json');
      return new Response(
        JSON.stringify({
          traceId: 'tr_1',
          message: { role: 'assistant', content: 'ok' },
          usage: { creditsDebited: 1 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const client = createIssaClient({
        baseUrl: 'http://hub',
        getAccessToken: () => 'tok',
      });
      const res = await client.chat({
        orgId: 'org_demo00000001',
        messages: [{ role: 'user', content: 'hi' }],
      });
      assert.equal(res.traceId, 'tr_1');
      assert.equal(res.usage.creditsDebited, 1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('getCredits 401 throws', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    try {
      const client = createIssaClient({
        baseUrl: 'http://hub',
        getAccessToken: () => 'bad',
      });
      await assert.rejects(() => client.getCredits('org_demo00000001'));
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('createToolHost', () => {
  it('verifyToolToken roundtrip', async () => {
    const host = createToolHost({
      baseUrl: 'http://hub',
      getServiceToken: () => 'svc',
      toolTokenSecret: 'secret',
      issuer: 'http://hub',
    });
    const token = await signToolToken({
      secret: 'secret',
      issuer: 'http://hub',
      appKey: 'renexus',
      sub: 'usr_1',
      orgId: 'org_1',
      toolId: 'renexus.task.search',
    });
    const claims = await host.verifyToolToken(token);
    assert.equal(claims.tool_id, 'renexus.task.search');
  });
});
