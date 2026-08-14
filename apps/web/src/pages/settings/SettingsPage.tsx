import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserCog, Eye, EyeOff, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import api from '../../lib/axios.ts';
import { useAuthStore } from '../../store/authStore.ts';
import { getUiLang, type UiLang } from '../../i18n/messages.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

const profileSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const canManageUsers = usePermission('users:manage');
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const [showPw, setShowShowPw] = useState({ cur: false, next: false });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const r = await api.get('/users/me');
      return r.data.data as {
        id: string;
        email: string;
        name: string;
        role: string;
        phone: string | null;
        isActive: boolean;
        twoFactorEnabled?: boolean;
      };
    },
  });

  const isAdmin = profile?.role === UserRole.ADMIN;

  const { data: adminSettings } = useQuery({
    queryKey: ['settings', 'admin'],
    queryFn: async () => {
      const r = await api.get('/settings');
      return r.data.data as Record<string, string>;
    },
    enabled: isAdmin === true,
  });

  const [tallyMapJson, setTallyMapJson] = useState('{}');

  useEffect(() => {
    if (!adminSettings || !isAdmin) return;
    const v = adminSettings.TALLY_VARIANT_MAP;
    if (v == null || String(v).trim() === '') {
      setTallyMapJson('{}');
      return;
    }
    try {
      setTallyMapJson(JSON.stringify(JSON.parse(v), null, 2));
    } catch {
      setTallyMapJson(v);
    }
  }, [adminSettings, isAdmin]);

  const saveTallyMapMut = useMutation({
    mutationFn: async () => {
      const parsed: unknown = JSON.parse(tallyMapJson);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Map must be a JSON object');
      }
      await api.patch('/settings', { TALLY_VARIANT_MAP: JSON.stringify(parsed) });
    },
    onSuccess: () => {
      toast.success('Tally variant map saved.');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'admin'] });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error
          ? e.message
          : (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Invalid JSON or save failed');
    },
  });

  const {
    register: regProfile,
    handleSubmit: submitProfile,
    reset: resetProfile,
    formState: { errors: errProfile },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (profile) {
      resetProfile({ name: profile.name, phone: profile.phone ?? '' });
    }
  }, [profile, resetProfile]);

  const {
    register: regPw,
    handleSubmit: submitPw,
    reset: resetPw,
    formState: { errors: errPw },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      api.patch('/users/me', { name: data.name, phone: data.phone || undefined }),
    onSuccess: (res) => {
      const u = res.data.data;
      setUser({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as UserRole,
        phone: u.phone,
      });
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      toast.success('Profile updated');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not update profile');
    },
  });

  const [uiLang, setUiLang] = useState<UiLang>(() => getUiLang());
  const [twoFaBundle, setTwoFaBundle] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [enrollOtp, setEnrollOtp] = useState('');
  const [disablePw, setDisablePw] = useState('');

  const show2fa = profile?.role === UserRole.ADMIN || profile?.role === UserRole.ACCOUNTS;

  const setup2faMut = useMutation({
    mutationFn: async () => {
      const r = await api.post('/auth/2fa/setup');
      return r.data.data as { secret: string; otpauthUrl: string };
    },
    onSuccess: (d) => {
      setTwoFaBundle(d);
      toast.success('Add the account in your authenticator app, then enter the code below.');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not start 2FA setup');
    },
  });

  const enable2faMut = useMutation({
    mutationFn: async () => {
      if (!twoFaBundle) throw new Error('Run setup first');
      await api.post('/auth/2fa/enable', { secret: twoFaBundle.secret, code: enrollOtp.replace(/\s/g, '') });
    },
    onSuccess: () => {
      toast.success('Two-factor authentication is now on for this account.');
      setTwoFaBundle(null);
      setEnrollOtp('');
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Invalid code');
    },
  });

  const disable2faMut = useMutation({
    mutationFn: async () => api.post('/auth/2fa/disable', { password: disablePw }),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled.');
      setDisablePw('');
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not disable 2FA');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Password changed. Please sign in again.');
      resetPw();
      logout();
      window.location.href = '/login';
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not change password');
    },
  });

  if (isLoading) {
    return <div className="text-text-secondary italic">Loading settings…</div>;
  }

  const twoFaEnabled = Boolean(profile?.twoFactorEnabled);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Account" subtitle="Your profile and security" />

      <Card>
        <CardHeader>
          <CardTitle>Security health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-text-secondary mb-4 italic font-medium opacity-60">
            Two-factor authentication status for this account
          </div>
          <DonutChart
            data={[
              { label: '2FA enabled', value: twoFaEnabled ? 1 : 0, color: '#16A34A' },
              { label: '2FA disabled', value: twoFaEnabled ? 0 : 1, color: '#DC2626' },
            ]}
            height={220}
            showLegend
          />
        </CardContent>
      </Card>

      {canManageUsers && (
        <Link
          to="/app/users"
          className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-surface transition-all shadow-sm group"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center transition-transform group-hover:scale-110">
            <UserCog className="h-6 w-6 text-accent" />
          </div>
          <div>
            <p className="font-bold text-text-primary text-lg">User management</p>
            <p className="text-sm text-text-secondary opacity-70">Create users, assign roles, and deactivate accounts</p>
          </div>
        </Link>
      )}

      {isAdmin && (
        <Link
          to="/app/devices"
          className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-surface transition-all shadow-sm group"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center transition-transform group-hover:scale-110">
            <ScanLine className="h-6 w-6 text-accent" />
          </div>
          <div>
            <p className="font-bold text-text-primary text-lg">Scanner devices</p>
            <p className="text-sm text-text-secondary opacity-70">Register and manage barcode scanning hardware</p>
          </div>
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {profile && (
            <p className="text-sm text-text-secondary mb-6 p-3 bg-surface rounded-lg border border-border">
              Signed in as <span className="font-mono text-text-primary font-bold">{profile.email}</span>
              <span className="ml-3 text-[10px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded font-black uppercase tracking-widest">{profile.role}</span>
            </p>
          )}
          <form onSubmit={submitProfile((d) => profileMutation.mutate(d))} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Name</label>
              <input
                {...regProfile('name')}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
              />
              {errProfile.name && <p className="mt-1 text-xs text-red-500 font-medium">{errProfile.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Phone</label>
              <input
                {...regProfile('phone')}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <Button type="submit" loading={profileMutation.isPending}>Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language (scan app)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-text-secondary italic">
            Affects offline banner and other scan strings. Stored in this browser only.
          </p>
          <select
            className="w-full max-w-xs px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
            value={uiLang}
            onChange={(e) => {
              const v = e.target.value as UiLang;
              localStorage.setItem('smartload-ui-lang', v);
              setUiLang(v);
              toast.success(v === 'hi' ? 'हिंदी' : 'English');
            }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (limited)</option>
          </select>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Tally → variant map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-text-secondary italic">
              JSON object mapping a Tally item name (string key) to a SmartLoad product variant id. Used when
              pulling sales orders from Tally.
            </p>
            <textarea
              className="w-full font-mono text-xs border border-border rounded-lg p-3 min-h-[160px] bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30 shadow-inner"
              value={tallyMapJson}
              onChange={(e) => setTallyMapJson(e.target.value)}
              spellCheck={false}
            />
            <Button
              type="button"
              size="sm"
              loading={saveTallyMapMut.isPending}
              onClick={() => saveTallyMapMut.mutate()}
            >
              Save map
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {show2fa && (
        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication (TOTP)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-text-secondary font-medium">
              Status:{' '}
              <span className="font-black text-text-primary uppercase tracking-wider ml-1">
                {profile?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
              </span>
            </p>
            {!profile?.twoFactorEnabled ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setup2faMut.mutate()} loading={setup2faMut.isPending}>
                  Set up authenticator
                </Button>
                {twoFaBundle && (
                  <div className="space-y-3 rounded-xl bg-surface p-4 border border-border shadow-inner">
                    <p className="text-[10px] text-text-secondary break-all font-mono opacity-60 leading-relaxed">{twoFaBundle.otpauthUrl}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-card text-text-primary font-black text-center tracking-[0.5em] outline-none focus:ring-2 focus:ring-accent/30"
                      value={enrollOtp}
                      onChange={(e) => setEnrollOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    />
                    <Button
                      type="button"
                      className="w-full"
                      disabled={enrollOtp.length < 6}
                      loading={enable2faMut.isPending}
                      onClick={() => enable2faMut.mutate()}
                    >
                      Confirm & enable
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2 max-w-md">
                <input
                  type="password"
                  placeholder="Current password"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={disable2faMut.isPending}
                  disabled={!disablePw}
                  onClick={() => disable2faMut.mutate()}
                >
                  Turn off 2FA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitPw((d) => passwordMutation.mutate(d))} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Current password</label>
              <div className="relative">
                <input
                  {...regPw('currentPassword')}
                  type={showPw.cur ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowShowPw((s) => ({ ...s, cur: !s.cur }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary opacity-40 hover:opacity-100 transition-opacity"
                >
                  {showPw.cur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errPw.currentPassword && <p className="mt-1 text-xs text-red-500 font-medium">{errPw.currentPassword.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">New password</label>
              <div className="relative">
                <input
                  {...regPw('newPassword')}
                  type={showPw.next ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowShowPw((s) => ({ ...s, next: !s.next }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary opacity-40 hover:opacity-100 transition-opacity"
                >
                  {showPw.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errPw.newPassword && <p className="mt-1 text-xs text-red-500 font-medium">{errPw.newPassword.message}</p>}
            </div>
            <p className="text-xs text-text-secondary italic opacity-60">After a successful change, you will be signed out on all devices.</p>
            <Button type="submit" loading={passwordMutation.isPending} variant="secondary">Update password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
