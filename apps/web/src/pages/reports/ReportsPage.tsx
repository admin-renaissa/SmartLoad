import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import api from '../../lib/axios.ts';
import { downloadJsonRowsAsCsv } from '../../utils/csvDownload.ts';
import { useAuthStore } from '../../store/authStore.ts';

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

type ReportDef = {
  id: string;
  title: string;
  description: string;
  buildUrl: (q: { dateFrom: string; dateTo: string; clientId: string }) => string;
  dateRange?: boolean;
  clientFilter?: boolean;
};

const REPORTS: ReportDef[] = [
  {
    id: 'dispatch-register',
    title: 'Dispatch register',
    description: 'All dispatch sessions in a date range with PO, vehicle, client, supervisor.',
    dateRange: true,
    buildUrl: ({ dateFrom, dateTo, clientId }) => {
      const p = new URLSearchParams();
      p.set('dateFrom', dateFrom);
      p.set('dateTo', dateTo);
      if (clientId.trim()) p.set('clientId', clientId.trim());
      return `/reports/dispatch-register?${p.toString()}`;
    },
    clientFilter: true,
  },
  {
    id: 'vehicle-loading-history',
    title: 'Vehicle loading history',
    description: 'Closed sessions by vehicle (optionally filter by vehicle and dates).',
    dateRange: true,
    buildUrl: ({ dateFrom, dateTo }) => {
      const p = new URLSearchParams();
      p.set('dateFrom', dateFrom);
      p.set('dateTo', dateTo);
      return `/reports/vehicle-loading-history?${p.toString()}`;
    },
  },
  {
    id: 'inventory-ledger',
    title: 'Inventory ledger',
    description: 'Stock movements (inward / outward / adjustment) with references.',
    dateRange: true,
    buildUrl: ({ dateFrom, dateTo }) => {
      const p = new URLSearchParams();
      p.set('dateFrom', dateFrom);
      p.set('dateTo', dateTo);
      return `/reports/inventory-ledger?${p.toString()}`;
    },
  },
  {
    id: 'error-alert-log',
    title: 'Scan error / alert log',
    description: 'Non-success scan events with session and operator.',
    dateRange: true,
    buildUrl: ({ dateFrom, dateTo }) => {
      const p = new URLSearchParams();
      p.set('dateFrom', dateFrom);
      p.set('dateTo', dateTo);
      return `/reports/error-alert-log?${p.toString()}`;
    },
  },
  {
    id: 'pod-status',
    title: 'POD status report',
    description: 'Proof of delivery records with session and client context.',
    dateRange: true,
    buildUrl: ({ dateFrom, dateTo }) => {
      const p = new URLSearchParams();
      p.set('dateFrom', dateFrom);
      p.set('dateTo', dateTo);
      return `/reports/pod-status?${p.toString()}`;
    },
  },
  {
    id: 'tally-sync-log',
    title: 'Tally sync log',
    description: 'Push/pull jobs with status, direction, and errors.',
    buildUrl: () => '/reports/tally-sync-log',
  },
  {
    id: 'outstanding-pos',
    title: 'Outstanding POs',
    description: 'Confirmed / loading / partially dispatched orders not yet fully delivered.',
    buildUrl: () => '/reports/outstanding-pos',
  },
  {
    id: 'client-dispatch-history',
    title: 'Client dispatch history',
    description: 'Orders per client with dispatch sessions and POD status (filter by client ID).',
    clientFilter: true,
    buildUrl: ({ clientId }) => {
      const p = new URLSearchParams();
      if (clientId.trim()) p.set('clientId', clientId.trim());
      return `/reports/client-dispatch-history?${p.toString()}`;
    },
  },
];

const STAFF_ONLY_REPORT_IDS = new Set([
  'dispatch-register',
  'vehicle-loading-history',
  'inventory-ledger',
  'error-alert-log',
  'tally-sync-log',
]);

function filterReportsForRole(role: string | undefined): ReportDef[] {
  if (role === UserRole.CLIENT) {
    return REPORTS.filter((r) => !STAFF_ONLY_REPORT_IDS.has(r.id));
  }
  return REPORTS;
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : { value: row }));
  }
  if (data && typeof data === 'object') {
    return [data as Record<string, unknown>];
  }
  return [];
}

function ReportCard({
  def,
  dateFrom,
  dateTo,
  clientId,
}: {
  def: ReportDef;
  dateFrom: string;
  dateTo: string;
  clientId: string;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  const url = useMemo(
    () => def.buildUrl({ dateFrom, dateTo, clientId }),
    [def, dateFrom, dateTo, clientId],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(url);
      const list = normalizeRows(res.data?.data);
      setRows(list);
      toast.success(`${def.title}: ${list.length} row(s)`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to load report');
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!rows?.length) {
      toast.error('Load data first');
      return;
    }
    downloadJsonRowsAsCsv(`${def.id}-${dateFrom}-to-${dateTo}`, rows);
    toast.success('Download started');
  };

  const downloadServer = async (format: 'excel' | 'pdf') => {
    const sep = url.includes('?') ? '&' : '?';
    try {
      const res = await api.get(`${url}${sep}format=${format}`, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${def.id}-${dateFrom}-to-${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(format === 'excel' ? 'Excel downloaded' : 'PDF downloaded');
    } catch {
      toast.error('Server export failed');
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-accent shrink-0" />
              {def.title}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1 font-normal">{def.description}</p>
          </div>
        </div>
        {def.clientFilter && (
          <p className="text-xs text-amber-700 mt-2">
            Optional: set a client CUID in the global filter (top of page) for this report.
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" loading={loading} onClick={load} icon={<RefreshCw className="h-4 w-4" />}>
            Load data
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={download} disabled={!rows?.length}>
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadServer('excel')}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadServer('pdf')}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
        {rows && (
          <p className="text-xs text-gray-500">
            {rows.length} row{rows.length === 1 ? '' : 's'} in memory. CSV opens in Excel; nested fields are JSON in cells.
          </p>
        )}
        {rows && rows.length > 0 && rows.length <= 8 && (
          <div className="text-xs font-mono bg-gray-50 rounded-lg p-2 max-h-40 overflow-auto border border-gray-100">
            {rows.slice(0, 3).map((r, i) => (
              <div key={i} className="truncate border-b border-gray-100 last:border-0 py-1">
                {Object.entries(r)
                  .slice(0, 4)
                  .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}…`)
                  .join(' | ')}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const visibleReports = useMemo(() => filterReportsForRole(user?.role), [user?.role]);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [clientId, setClientId] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & export"
        subtitle="Load data for preview, then download CSV from the browser or Excel/PDF from the server (full filtered extract, 50k row cap)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Date range (for time-based reports)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Client ID (optional, CUID)</label>
            <input
              type="text"
              placeholder="Filter dispatch register or client history"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDateFrom(defaultDateFrom());
              setDateTo(defaultDateTo());
            }}
          >
            Last 30 days
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleReports.map((def) => (
          <ReportCard key={def.id} def={def} dateFrom={dateFrom} dateTo={dateTo} clientId={clientId} />
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Client role sees POD and order-related reports only. Server exports use the same filters as preview.
      </p>
    </div>
  );
}
