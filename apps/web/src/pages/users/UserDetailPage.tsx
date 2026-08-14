import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { useAuthStore } from '../../store/authStore.ts';
import type { UserRow } from './UserListPage.tsx';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('users:manage');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const r = await api.get(`/users/${id}`);
      return r.data.data as UserRow;
    },
    enabled: Boolean(id && canManage),
  });

  const [form, setForm] = useState({
    name: '',
    role: UserRole.OPERATOR,
    phone: '',
    isActive: true,
  });

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        role: user.role,
        phone: user.phone ?? '',
        isActive: user.isActive,
      });
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const r = await api.patch(`/users/${id}`, {
        name: form.name,
        role: form.role,
        phone: form.phone || undefined,
        isActive: form.isActive,
      });
      return r.data.data as { id: string; email: string; name: string; role: UserRole; phone: string | null; isActive: boolean };
    },
    onSuccess: (updated) => {
      toast.success('User updated');
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (id === currentUserId) {
        useAuthStore.getState().setUser({
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          phone: updated.phone,
        });
      }
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Update failed');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      toast.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/app/users');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to deactivate');
    },
  });

  if (!canManage) {
    return (
      <div>
        <PageHeader title="User" />
        <p className="text-text-secondary italic">You do not have access.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/app/dashboard')}>Back to app</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div>
        <PageHeader title="User not found" />
        <Link
          to="/app/users"
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium border border-border rounded-button bg-surface text-text-primary hover:bg-card transition-colors"
        >
          Back to users
        </Link>
      </div>
    );
  }

  const isSelf = user.id === currentUserId;
  const fieldClass =
    'w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link
          to="/app/users"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-accent transition-colors uppercase tracking-wider"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Users
        </Link>
      </div>

      <PageHeader
        title={user.name}
        subtitle={user.email}
        actions={
          <Button
            variant="outline"
            className="text-red-500 border-red-500/30 bg-red-500/5 hover:bg-red-500 hover:text-white"
            disabled={isSelf}
            onClick={() => {
              if (window.confirm('Deactivate this user? They will no longer be able to sign in.')) {
                deactivateMutation.mutate();
              }
            }}
            loading={deactivateMutation.isPending}
          >
            Deactivate
          </Button>
        }
      />

      {isSelf && (
        <p className="text-sm text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 font-medium">
          ⚠ This is your account. You cannot deactivate yourself here.
        </p>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-text-secondary text-xs">
            <UserCircle className="h-4 w-4 opacity-50" />
            <span className="font-mono opacity-50 tracking-tight">{user.id}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Name</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Role</label>
            <select
              className={fieldClass}
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}
            >
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Phone</label>
            <input
              className={fieldClass}
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              className="rounded border-border bg-surface text-accent focus:ring-accent/30"
              checked={form.isActive}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              disabled={isSelf}
            />
            <label htmlFor="isActive" className="text-sm font-medium text-text-primary">Active (can sign in)</label>
          </div>
          {isSelf && <p className="text-[10px] text-text-secondary italic opacity-50">You cannot turn off your own access here.</p>}

          <div className="pt-2 flex justify-end">
            <Button
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
