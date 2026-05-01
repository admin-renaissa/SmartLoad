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
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';

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
  POST:   'bg-emerald-100 text-emerald-800',
  PATCH:  'bg-blue-100 text-blue-800',
  PUT:    'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:      'bg-purple-100 text-purple-800',
  SUPERVISOR: 'bg-blue-100 text-blue-700',
  OPERATOR:   'bg-orange-100 text-orange-700',
  ACCOUNTS:   'bg-teal-100 text-teal-700',
  DRIVER:     'bg-gray-100 text-gray-700',
  CLIENT:     'bg-amber-100 text-amber-700',
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
    sessions: 'bg-blue-100 text-blue-700',
    products: 'bg-lime-100 text-lime-700',
    orders:   'bg-amber-100 text-amber-700',
    clients:  'bg-teal-100 text-teal-700',
    vehicles: 'bg-orange-100 text-orange-700',
    devices:  'bg-purple-100 text-purple-700',
    users:    'bg-pink-100 text-pink-700',
    settings: 'bg-gray-100 text-gray-600',
    grn:      'bg-emerald-100 text-emerald-700',
    pod:      'bg-sky-100 text-sky-700',
  };
  return map[r] ?? 'bg-gray-100 text-gray-600';
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-gray-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function ExpandedRow({ entry, colSpan }: { entry: AuditLogEntry; colSpan: number }) {
  const hasChanges = entry.oldValues !== null || entry.newValues !== null;
  return (
    <tr className="bg-gray-50/80">
      <td colSpan={colSpan} className="px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full action</p>
            <p className="text-xs font-mono text-gray-700 break-all">{entry.action}</p>
          </div>
          {entry.ipAddress && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</p>
              <p className="text-xs font-mono text-gray-700">{entry.ipAddress}</p>
            </div>
          )}
          {entry.userAgent && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">User agent</p>
              <p className="text-xs text-gray-500 break-all">{entry.userAgent}</p>
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
        className={`hover:bg-gray-50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={hasDetail ? () => setExpanded((s) => !s) : undefined}
      >
        {/* Time */}
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          {formatTs(entry.createdAt)}
        </td>

        {/* User */}
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-800 leading-none">
            {entry.user?.name ?? entry.userEmail}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{entry.userEmail}</p>
          <span
            className={`mt-1 inline-block text-xs px-1.5 py-0.5 rounded font-medium ${
              ROLE_COLORS[entry.userRole] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {entry.userRole}
          </span>
        </td>

        {/* Action */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold ${
                METHOD_COLORS[method] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {method}
            </span>
            <span className="text-xs font-mono text-gray-600 break-all max-w-[200px] truncate">
              {path}
            </span>
          </div>
        </td>

        {/* Resource */}
        <td className="px-4 py-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${resourceChipColor(entry.resourceType)}`}
          >
            {resourceLabel(entry.resourceType)}
          </span>
          {entry.resourceId && (
            <p className="text-xs font-mono text-gray-400 mt-0.5 truncate max-w-[120px]">
              {entry.resourceId}
            </p>
          )}
        </td>

        {/* IP */}
        <td className="px-4 py-3 text-xs font-mono text-gray-500">
          {entry.ipAddress ?? '—'}
        </td>

        {/* Expand */}
        <td className="px-4 py-3 text-right">
          {hasDetail && (
            <span className="text-gray-400">
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

  const inputCls =
    'px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white';

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
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-accent opacity-70">{icon}</span>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
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
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Resource</th>
                  <th className="px-4 py-3 text-left">IP</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.length > 0 ? (
                  entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="font-medium">No audit log entries found</p>
                      <p className="text-xs mt-1">Try adjusting the filters above.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {meta.page} of {meta.totalPages}{' '}
                <span className="text-gray-400">({meta.total.toLocaleString()} total)</span>
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
