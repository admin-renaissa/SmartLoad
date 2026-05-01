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
      const r = await api.get(`/api/v1/users/${id}`);
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
      const r = await api.patch(`/api/v1/users/${id}`, {
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
      await api.delete(`/api/v1/users/${id}`);
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
        <p className="text-gray-500">You do not have access.</p>
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
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium border border-gray-300 rounded-button bg-white text-gray-700 hover:bg-gray-50"
        >
          Back to users
        </Link>
      </div>
    );
  }

  const isSelf = user.id === currentUserId;
  const fieldClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link
          to="/app/users"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Users
        </Link>
      </div>

      <PageHeader
        title={user.name}
        subtitle={user.email}
        actions={
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
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
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This is your account. You cannot deactivate yourself here.
        </p>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <UserCircle className="h-5 w-5" />
            <span className="font-mono text-xs">{user.id}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
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
              className="rounded border-gray-300"
              checked={form.isActive}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              disabled={isSelf}
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active (can sign in)</label>
          </div>
          {isSelf && <p className="text-xs text-gray-400">You cannot turn off your own access here.</p>}

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
