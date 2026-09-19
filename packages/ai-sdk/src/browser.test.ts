import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIssaClient } from './browser.js';

const dir = dirname(fileURLToPath(import.meta.url));

function sourceOf(file: string): string {
  return readFileSync(join(dir, file), 'utf8');
}

function assertBrowserSafe(file: string) {
  const src = sourceOf(file);
  assert.equal(
    /(?:from|import)\s+['"]node:crypto['"]/.test(src),
    false,
    `${file} must not import node:crypto`,
  );
  assert.equal(
    /from\s+['"]jose['"]/.test(src),
    false,
    `${file} must not import jose`,
  );
  assert.equal(
    /from\s+['"]express['"]/.test(src),
    false,
    `${file} must not import express`,
  );
}

describe('browser entry', () => {
  it('client modules stay Node-free', () => {
    assertBrowserSafe('browser.ts');
    assertBrowserSafe('client.ts');
    assertBrowserSafe('types.ts');
    assertBrowserSafe('userCopy.ts');
  });

  it('createIssaClient is exported for SPA chat', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          traceId: 'tr_b',
          message: { role: 'assistant', content: 'ok' },
          usage: { creditsDebited: 0 },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const client = createIssaClient({
        baseUrl: 'http://hub',
        getAccessToken: () => 'tok',
      });
      const res = await client.chat({
        orgId: 'org_demo00000001',
        messages: [{ role: 'user', content: 'hi' }],
      });
      assert.equal(res.traceId, 'tr_b');
    } finally {
      globalThis.fetch = orig;
    }
  });
});
