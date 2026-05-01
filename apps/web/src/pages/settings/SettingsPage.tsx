import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserCog, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import api from '../../lib/axios.ts';
import { useAuthStore } from '../../store/authStore.ts';
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
      return r.data.data as { id: string; email: string; name: string; role: string; phone: string | null; isActive: boolean };
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
