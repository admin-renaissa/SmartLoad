/**
 * EP-X-01 Phase A account linking — bind Identity `sub` to an existing local user.
 */
export const RENVERSE_LINK_COOKIE = 'smartload_renverse_link_uid';
const LINK_MAX_AGE_SEC = 15 * 60;

export type SuiteLinkClaims = {
  sub: string;
  org_id: string;
  email?: string;
  name?: string;
  roles?: string[];
};

type CookieRes = {
  cookie?: (name: string, value: string, opts?: Record<string, unknown>) => void;
  header?: (name: string, value: string) => unknown;
  clearCookie?: (name: string, opts?: Record<string, unknown>) => void;
};

export function setRenverseLinkCookie(res: CookieRes, userId: string): void {
  if (typeof res.cookie === 'function') {
    res.cookie(RENVERSE_LINK_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: LINK_MAX_AGE_SEC * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    return;
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.header?.(
    'Set-Cookie',
    `${RENVERSE_LINK_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${LINK_MAX_AGE_SEC}${secure}`,
  );
}

export function clearRenverseLinkCookie(res: CookieRes): void {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie(RENVERSE_LINK_COOKIE, { path: '/' });
    return;
  }
  res.header?.(
    'Set-Cookie',
    `${RENVERSE_LINK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function readRenverseLinkUserId(req: {
  cookies?: Record<string, string>;
  headers?: { cookie?: string };
}): string | null {
  const raw = req.cookies?.[RENVERSE_LINK_COOKIE];
  if (raw) return String(raw);
  const header = String(req.headers?.cookie || '');
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${RENVERSE_LINK_COOKIE}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function linkRenverseIdentityToUser(
  prisma: {
    user: {
      findUnique: (args: unknown) => Promise<{
        id: string;
        email: string;
        renverseSub: string | null;
      } | null>;
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  },
  userId: string,
  claims: SuiteLinkClaims,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const sub = String(claims.sub || '');
  if (!sub) return { ok: false, reason: 'missing_sub' };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, renverseSub: true },
  });
  if (!user) return { ok: false, reason: 'user_not_found' };

  const claimEmail = String(claims.email || '').toLowerCase();
  if (claimEmail && String(user.email || '').toLowerCase() !== claimEmail) {
    return { ok: false, reason: 'email_mismatch' };
  }

  if (user.renverseSub && user.renverseSub !== sub) {
    return { ok: false, reason: 'already_linked_other_sub' };
  }

  const taken = await prisma.user.findFirst({
    where: { renverseSub: sub, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) return { ok: false, reason: 'sub_already_linked' };

  if (!user.renverseSub) {
    await prisma.user.update({
      where: { id: userId },
      data: { renverseSub: sub },
    });
  }

  return { ok: true, userId: user.id };
}
