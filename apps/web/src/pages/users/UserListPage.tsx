import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, UserCircle, Mail, Phone, ChevronRight } from 'lucide-react';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { CreateUserModal } from './UserFormModal.tsx';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

const roleOptions: Array<{ value: string; label: string }> = [
  { value: '', label: 'All roles' },
  ...Object.values(UserRole).map((r) => ({ value: r, label: r })),
];

export default function UserListPage() {
  const canManage = usePermission('users:manage');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, role],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (role) params.set('role', role);
      const r = await api.get(`/users?${params}`);
      return { items: r.data.data as UserRow[], meta: r.data.meta };
    },
    enabled: canManage,
  });

  const users = data?.items ?? [];
  const meta = data?.meta;
  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.phone && u.phone.includes(search)),
      )
    : users;

  const roleSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of filtered) {
      const role = String(u.role ?? 'UNKNOWN');
      counts.set(role, (counts.get(role) || 0) + 1);
    }
    const palette: Record<string, string> = {
      ADMIN: '#7C3AED',
      SUPERVISOR: '#2563EB',
      OPERATOR: '#F59E0B',
      ACCOUNTS: '#0D9488',
      CLIENT: '#F97316',
    };
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, color: palette[label] }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Users" />
        <p className="text-text-secondary italic">You do not have access to user management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}

      <PageHeader
        title="Users"
        subtitle="Create accounts and manage roles for your team"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            New user
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-border bg-surface/30">
          <p className="text-sm font-semibold text-text-primary">Role mix</p>
          <p className="text-xs text-text-secondary mt-0.5">Distribution in the current list</p>
        </div>
        <div className="p-4">
          <DonutChart data={roleSlices} height={220} showLegend />
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Filter by name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary min-w-[140px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {roleOptions.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {filtered.map((u) => (
                <Link
                  key={u.id}
                  to={`/app/users/${u.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <UserCircle className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-text-primary">{u.name}</span>
                        <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        <span className="text-[10px] font-bold font-mono text-text-secondary bg-surface border border-border px-1.5 py-0.5 rounded tracking-tighter uppercase">{u.role}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary mt-1">
                        <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 opacity-60" />{u.email}</span>
                        {u.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 opacity-60" />{u.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-secondary opacity-30 flex-shrink-0" />
                </Link>
              ))}
              {filtered.length === 0 && (
                <div className="px-6 py-20 text-center">
                  <UserCircle className="h-12 w-12 text-border mx-auto mb-4 opacity-20" />
                  <p className="text-text-secondary font-medium italic">No users match your filters.</p>
                </div>
              )}
            </div>

            {meta && meta.totalPages > 1 && !search && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-xs font-medium text-text-secondary">{meta.total} total users</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="px-3 py-1.5 text-xs font-bold text-text-primary bg-surface border border-border rounded-lg">Page {page} / {meta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page === meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
