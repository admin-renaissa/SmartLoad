import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { Button } from '../components/ui/Button.tsx';

const DISMISS_KEY = 'smartload_renverse_link_banner_dismissed';

/** A10 / EP-X-01 Phase A linking nudge. */
export function RenverseLinkBanner() {
  const { user, isAuthenticated, accessToken } = useAuthStore();
  const [suiteDual, setSuiteDual] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetch('/renverse/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        const suite = s?.mode === 'suite';
        const cutover =
          s?.identityOnly || String(s?.authPhase || '').toLowerCase() === 'cutover';
        setSuiteDual(Boolean(suite && !cutover));
      })
      .catch(() => setSuiteDual(false));
  }, []);

  const linked = Boolean(user?.renverseSub);
  const show = isAuthenticated && suiteDual && !linked && !dismissed;

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const startLink = useCallback(async () => {
    setLinking(true);
    try {
      const res = await fetch('/renverse/link/start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: '{}',
      });
      const data = (await res.json().catch(() => null)) as {
        redirectUrl?: string;
      } | null;
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      window.location.href = '/auth/login';
    } catch {
      window.location.href = '/auth/login';
    } finally {
      setLinking(false);
    }
  }, [accessToken]);

  if (!show) return null;

  return (
    <div
      className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 text-sm"
      data-testid="renverse-link-banner"
      role="status"
    >
      <p className="flex-1 min-w-0">
        Link this account to RenVerse for one sign-in across apps.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={linking}
        onClick={() => void startLink()}
      >
        {linking ? 'Connecting…' : 'Link with RenVerse'}
      </Button>
      <button type="button" aria-label="Dismiss" className="px-1" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
