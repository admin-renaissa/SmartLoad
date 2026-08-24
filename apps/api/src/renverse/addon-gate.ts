/**
 * Suite entitlement: hasAddon('smartload') only — never hasApp('smartload').
 */
import type { AccessTokenClaims } from '@renverse/auth-sdk';
import { hasAddon, hasApp } from '@renverse/auth-sdk';

export const ADDON_NOT_ENABLED = 'ADDON_NOT_ENABLED' as const;

export type AddonGateResult =
  | { ok: true }
  | { ok: false; code: typeof ADDON_NOT_ENABLED; status: 403; message: string };

/** Pure check used by Fastify hooks and unit tests. */
export function requireSmartloadAddon(
  claims: AccessTokenClaims | null | undefined,
): AddonGateResult {
  if (!claims) {
    return {
      ok: false,
      code: ADDON_NOT_ENABLED,
      status: 403,
      message: 'SmartLoad add-on is not enabled for this organization.',
    };
  }
  // Defense: never treat apps[] as sufficient for SmartLoad
  if (hasApp(claims, 'smartload') && !hasAddon(claims, 'smartload')) {
    return {
      ok: false,
      code: ADDON_NOT_ENABLED,
      status: 403,
      message: 'SmartLoad requires addons[] entitlement, not apps[].',
    };
  }
  if (!hasAddon(claims, 'smartload')) {
    return {
      ok: false,
      code: ADDON_NOT_ENABLED,
      status: 403,
      message: 'SmartLoad add-on is not enabled for this organization.',
    };
  }
  return { ok: true };
}

export function isSuiteMode(mode = process.env.RENVERSE_MODE || 'standalone'): boolean {
  return String(mode).toLowerCase() === 'suite';
}

/** Paths that stay public even in suite mode (POD customer links, health, status). */
export function isSuiteAddonExemptPath(url: string): boolean {
  const path = url.split('?')[0] || '';
  if (path === '/renverse/status' || path.startsWith('/health')) return true;
  if (path.startsWith('/api/v1/auth')) return true;
  if (path.startsWith('/api/v1/pod/link')) return true;
  if (/^\/api\/v1\/pod\/[^/]+\/(request-otp|verify-otp|acknowledge)/.test(path)) {
    return true;
  }
  if (path.startsWith('/auth/')) return true;
  return false;
}
