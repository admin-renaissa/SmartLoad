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
    return <div className="text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Account" subtitle="Your profile and security" />

      {canManageUsers && (
        <Link
          to="/app/users"
          className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-accent/40 hover:bg-accent/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <UserCog className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="font-medium text-gray-900">User management</p>
            <p className="text-sm text-gray-500">Create users, assign roles, and deactivate accounts</p>
          </div>
        </Link>
      )}

      {isAdmin && (
        <Link
          to="/app/devices"
          className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-accent/40 hover:bg-accent/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Scanner devices</p>
            <p className="text-sm text-gray-500">Register and manage barcode scanning hardware</p>
          </div>
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {profile && (
            <p className="text-sm text-gray-500 mb-4">
              Signed in as <span className="font-mono text-gray-700">{profile.email}</span>
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{profile.role}</span>
            </p>
          )}
          <form onSubmit={submitProfile((d) => profileMutation.mutate(d))} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                {...regProfile('name')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              {errProfile.name && <p className="mt-1 text-xs text-red-600">{errProfile.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                {...regProfile('phone')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
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
          <p className="text-sm text-gray-600">
            Affects offline banner and other scan strings. Stored in this browser only.
          </p>
          <select
            className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg"
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
            <p className="text-gray-600">
              JSON object mapping a Tally item name (string key) to a SmartLoad product variant id. Used when
              pulling sales orders from Tally.
            </p>
            <textarea
              className="w-full font-mono text-xs border border-gray-200 rounded-lg p-2 min-h-[160px] focus:outline-none focus:ring-2 focus:ring-accent/30"
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
            <p className="text-gray-600">
              Status:{' '}
              <span className="font-medium text-gray-900">
                {profile?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
              </span>
            </p>
            {!profile?.twoFactorEnabled ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setup2faMut.mutate()} loading={setup2faMut.isPending}>
                  Set up authenticator
                </Button>
                {twoFaBundle && (
                  <div className="space-y-2 rounded-lg bg-gray-50 p-3 border border-gray-100">
                    <p className="text-xs text-gray-500 break-all font-mono">{twoFaBundle.otpauthUrl}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      className="w-full px-3 py-2 border rounded-lg font-mono"
                      value={enrollOtp}
                      onChange={(e) => setEnrollOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    />
                    <Button
                      type="button"
                      size="sm"
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
                  className="w-full px-3 py-2 border rounded-lg"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <div className="relative">
                <input
                  {...regPw('currentPassword')}
                  type={showPw.cur ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowShowPw((s) => ({ ...s, cur: !s.cur }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw.cur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errPw.currentPassword && <p className="mt-1 text-xs text-red-600">{errPw.currentPassword.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <div className="relative">
                <input
                  {...regPw('newPassword')}
                  type={showPw.next ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowShowPw((s) => ({ ...s, next: !s.next }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errPw.newPassword && <p className="mt-1 text-xs text-red-600">{errPw.newPassword.message}</p>}
            </div>
            <p className="text-xs text-gray-500">After a successful change, you will be signed out on all devices.</p>
            <Button type="submit" loading={passwordMutation.isPending} variant="secondary">Update password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
