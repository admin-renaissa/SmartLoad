import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  Users,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userEmail: string;
  userRole: string;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues: unknown;
  newValues: unknown;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string } | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  'sessions',
  'products',
  'orders',
  'clients',
  'vehicles',
  'devices',
  'users',
  'settings',
  'grn',
  'pod',
];

const METHOD_COLORS: Record<string, string> = {
  POST:   'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
  PATCH:  'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  PUT:    'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-500 border border-red-500/20',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:      'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  SUPERVISOR: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  OPERATOR:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  ACCOUNTS:   'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  DRIVER:     'bg-surface text-text-secondary border border-border',
  CLIENT:     'bg-amber-500/10 text-amber-400 border border-amber-500/20',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAction(action: string): { method: string; path: string } {
  const [method, ...rest] = action.split(' ');
  return { method: method ?? 'API', path: rest.join(' ') };
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isToday(ts: string): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function resourceLabel(r: string): string {
  const map: Record<string, string> = {
    sessions: 'Sessions',
    products: 'Products',
    orders:   'Orders',
    clients:  'Clients',
    vehicles: 'Vehicles',
    devices:  'Devices',
    users:    'Users',
    settings: 'Settings',
    grn:      'GRN',
    pod:      'POD',
  };
  return map[r] ?? r;
}

function resourceChipColor(r: string): string {
  const map: Record<string, string> = {
    sessions: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    products: 'bg-lime-500/10 text-lime-400 border border-lime-500/20',
    orders:   'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    clients:  'bg-teal-500/10 text-teal-400 border border-teal-500/20',
    vehicles: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    devices:  'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    users:    'bg-pink-500/10 text-pink-400 border border-pink-500/20',
    settings: 'bg-surface text-text-secondary border border-border',
    grn:      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    pod:      'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  };
  return map[r] ?? 'bg-surface text-text-secondary border border-border';
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">{label}</p>
      <pre className="text-xs bg-surface border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-text-primary font-mono shadow-inner">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function ExpandedRow({ entry, colSpan }: { entry: AuditLogEntry; colSpan: number }) {
  const hasChanges = entry.oldValues !== null || entry.newValues !== null;
  return (
    <tr className="bg-surface/30">
      <td colSpan={colSpan} className="px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Full action</p>
            <p className="text-xs font-mono text-text-primary break-all bg-surface px-2 py-1 rounded border border-border">{entry.action}</p>
          </div>
          {entry.ipAddress && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">IP Address</p>
              <p className="text-xs font-mono text-text-primary bg-surface px-2 py-1 rounded border border-border w-fit">{entry.ipAddress}</p>
            </div>
          )}
          {entry.userAgent && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">User agent</p>
              <p className="text-xs text-text-secondary break-all bg-surface px-2 py-1 rounded border border-border italic opacity-70 leading-relaxed">{entry.userAgent}</p>
            </div>
          )}
        </div>
        {hasChanges && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <JsonBlock label="Before (oldValues)" value={entry.oldValues} />
            <JsonBlock label="After (newValues)" value={entry.newValues} />
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { method, path } = parseAction(entry.action);
  const hasDetail = Boolean(
    entry.oldValues || entry.newValues || entry.userAgent || entry.ipAddress,
  );

  return (
    <>
      <tr
        className={`border-t border-border hover:bg-surface transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={hasDetail ? () => setExpanded((s) => !s) : undefined}
      >
        {/* Time */}
        <td className="px-4 py-4 text-[10px] font-bold text-text-secondary whitespace-nowrap uppercase tracking-tighter">
          {formatTs(entry.createdAt)}
        </td>

        {/* User */}
        <td className="px-4 py-4">
          <p className="text-sm font-bold text-text-primary leading-none">
            {entry.user?.name ?? entry.userEmail}
          </p>
          <p className="text-xs text-text-secondary opacity-60 mt-0.5">{entry.userEmail}</p>
          <span
            className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              ROLE_COLORS[entry.userRole] ?? 'bg-surface text-text-secondary border border-border'
            }`}
          >
            {entry.userRole}
          </span>
        </td>

        {/* Action */}
        <td className="px-4 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-black uppercase tracking-tighter ${
                METHOD_COLORS[method] ?? 'bg-surface text-text-secondary border border-border'
              }`}
            >
              {method}
            </span>
            <span className="text-xs font-mono text-text-primary break-all max-w-[200px] truncate opacity-80">
              {path}
            </span>
          </div>
        </td>

        {/* Resource */}
        <td className="px-4 py-4">
          <span
            className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest ${resourceChipColor(entry.resourceType)}`}
          >
            {resourceLabel(entry.resourceType)}
          </span>
          {entry.resourceId && (
            <p className="text-[10px] font-mono text-text-secondary mt-1.5 truncate max-w-[120px] opacity-40">
              ID: {entry.resourceId}
            </p>
          )}
        </td>

        {/* IP */}
        <td className="px-4 py-4 text-[10px] font-mono text-text-secondary opacity-60">
          {entry.ipAddress ?? '—'}
        </td>

        {/* Expand */}
        <td className="px-4 py-4 text-right">
          {hasDetail && (
            <span className="text-text-secondary opacity-30">
              {expanded ? (
                <ChevronUp className="h-4 w-4 inline" />
              ) : (
                <ChevronDown className="h-4 w-4 inline" />
              )}
            </span>
          )}
        </td>
      </tr>

      {expanded && hasDetail && <ExpandedRow entry={entry} colSpan={6} />}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const LIMIT = 25;

export default function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters (URL-synced)
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [resourceType, setResourceType] = useState(searchParams.get('resourceType') ?? '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? '');

  // Build query string from current filters + page
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(LIMIT));
    if (search.trim())    p.set('search', search.trim());
    if (resourceType)     p.set('resourceType', resourceType);
    if (dateFrom)         p.set('dateFrom', dateFrom);
    if (dateTo)           p.set('dateTo', dateTo);
    return p.toString();
  }, [page, search, resourceType, dateFrom, dateTo]);

  // Sync filters back to URL (resets to page 1 on filter change)
  const applyFilters = useCallback(
    (overrides: { search?: string; resourceType?: string; dateFrom?: string; dateTo?: string }) => {
      const next = new URLSearchParams(searchParams);
      const vals = {
        search:       overrides.search       ?? search,
        resourceType: overrides.resourceType ?? resourceType,
        dateFrom:     overrides.dateFrom     ?? dateFrom,
        dateTo:       overrides.dateTo       ?? dateTo,
      };
      next.set('page', '1');
      if (vals.search.trim())  next.set('search', vals.search.trim()); else next.delete('search');
      if (vals.resourceType)   next.set('resourceType', vals.resourceType); else next.delete('resourceType');
      if (vals.dateFrom)       next.set('dateFrom', vals.dateFrom); else next.delete('dateFrom');
      if (vals.dateTo)         next.set('dateTo', vals.dateTo); else next.delete('dateTo');
      setSearchParams(next, { replace: true });
    },
    [search, resourceType, dateFrom, dateTo, searchParams, setSearchParams],
  );

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next, { replace: true });
  }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', queryString],
    queryFn: async () => {
      const r = await api.get(`/audit-logs?${queryString}`);
      return r.data as { data: AuditLogEntry[]; meta: PaginationMeta };
    },
    staleTime: 30_000,
  });

  const entries = data?.data ?? [];
  const meta = data?.meta;

  // Derived stats from current page data
  const todayCount = entries.filter((e) => isToday(e.createdAt)).length;
  const uniqueUsers = new Set(entries.map((e) => e.user?.id ?? e.userEmail)).size;

  const methodSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const { method } = parseAction(e.action);
      const key = String(method ?? 'UNKNOWN');
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const palette: Record<string, string> = {
      POST: '#16A34A',
      PATCH: '#2563EB',
      PUT: '#2563EB',
      DELETE: '#DC2626',
      API: '#0D9488',
      UNKNOWN: '#6B7280',
    };

    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, color: palette[label] }))
      .sort((a, b) => b.value - a.value);
  }, [entries]);

  const inputCls =
    'px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="All mutating API actions performed by users"
      />

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: <Shield className="h-4 w-4" />,
            label: 'Total entries',
            value: meta ? meta.total.toLocaleString() : '—',
            sub: 'matching current filter',
          },
          {
            icon: <Clock className="h-4 w-4" />,
            label: 'On this page today',
            value: String(todayCount),
            sub: 'entries from today',
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'Unique users',
            value: String(uniqueUsers),
            sub: 'on this page',
          },
        ].map(({ icon, label, value, sub }) => (
          <Card key={label}>
            <CardContent className="py-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent">{icon}</span>
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">{label}</p>
              </div>
              <p className="text-2xl font-black text-text-primary tracking-tight">{value}</p>
              <p className="text-[10px] text-text-secondary mt-1 italic opacity-60 font-medium">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="text-text-primary">Action methods</CardTitle>
          <p className="text-xs text-text-secondary font-medium italic opacity-60">Distribution in current results</p>
        </CardHeader>
        <CardContent>
          <DonutChart data={methodSlices} height={220} showLegend />
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary opacity-40" />
              <input
                className={`${inputCls} pl-9 w-full`}
                placeholder="Search by action or email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters({ search: e.target.value });
                }}
              />
            </div>

            {/* Resource type */}
            <select
              className={`${inputCls} min-w-[160px]`}
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                applyFilters({ resourceType: e.target.value });
              }}
            >
              <option value="">All resource types</option>
              {RESOURCE_TYPES.map((r) => (
                <option key={r} value={r}>{resourceLabel(r)}</option>
              ))}
            </select>

            {/* Date from */}
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest whitespace-nowrap">From</label>
              <input
                type="date"
                className={inputCls}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  applyFilters({ dateFrom: e.target.value });
                }}
              />
            </div>

            {/* Date to */}
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest whitespace-nowrap">To</label>
              <input
                type="date"
                className={inputCls}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  applyFilters({ dateTo: e.target.value });
                }}
              />
            </div>

            {/* Clear */}
            {(search || resourceType || dateFrom || dateTo) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setResourceType('');
                  setDateFrom('');
                  setDateTo('');
                  setSearchParams({}, { replace: true });
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden divide-y divide-border">
            {entries.length > 0 ? (
              entries.map((entry) => {
                const { method, path } = parseAction(entry.action);
                return (
                  <div key={entry.id} className="px-4 py-5 hover:bg-surface transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-tighter">
                          {formatTs(entry.createdAt)}
                        </p>
                        <p className="text-sm font-bold text-text-primary">
                          {entry.user?.name ?? entry.userEmail}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-tighter ${METHOD_COLORS[method] ?? 'bg-surface text-text-secondary'}`}
                          >
                            {method}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${resourceChipColor(entry.resourceType)}`}
                          >
                            {resourceLabel(entry.resourceType)}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary break-all font-mono opacity-80 leading-relaxed">
                          {path || entry.action}
                          {entry.resourceId ? ` · ${entry.resourceId}` : ''}
                        </p>
                        {entry.ipAddress ? (
                          <p className="text-[10px] font-mono text-text-secondary opacity-40">{entry.ipAddress}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-20 text-center">
                <Shield className="h-12 w-12 mx-auto mb-4 text-border opacity-20" />
                <p className="font-bold text-text-primary">No audit log entries found</p>
                <p className="text-xs text-text-secondary mt-1 italic opacity-60">Try adjusting the filters above.</p>
              </div>
            )}
          </div>

          {/* Desktop: full table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface text-[10px] text-text-secondary uppercase font-bold tracking-widest border-b border-border">
                  <th className="px-4 py-4 text-left">Time</th>
                  <th className="px-4 py-4 text-left">User</th>
                  <th className="px-4 py-4 text-left">Action</th>
                  <th className="px-4 py-4 text-left">Resource</th>
                  <th className="px-4 py-4 text-left">IP</th>
                  <th className="px-4 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.length > 0 ? (
                  entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-24 text-center">
                      <Shield className="h-16 w-16 mx-auto mb-4 text-border opacity-20" />
                      <p className="font-bold text-text-primary">No audit log entries found</p>
                      <p className="text-xs text-text-secondary mt-1 italic opacity-60">Try adjusting the filters above.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border flex items-center justify-between text-xs font-medium">
              <span className="text-text-secondary">
                Page <strong className="text-text-primary">{meta.page}</strong> of {meta.totalPages}{' '}
                <span className="opacity-40 italic">({meta.total.toLocaleString()} total)</span>
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!meta.hasPrev}
                  onClick={() => setPage(meta.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!meta.hasNext}
                  onClick={() => setPage(meta.page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
