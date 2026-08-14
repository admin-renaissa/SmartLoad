import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Wifi,
  Usb,
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  BarChart3,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceStats {
  totalScans: number;
  successScans: number;
  errorScans: number;
  successRate: number | null;
  totalSessions: number;
  firstUsedAt: string | null;
}

interface DeviceDetail {
  id: string;
  name: string;
  serialNumber: string;
  driverName: string;
  deviceType: string;
  ipAddress: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  registeredBy: { id: string; name: string; email: string };
  stats: DeviceStats;
}

interface ScanHistoryEvent {
  id: string;
  scannedBarcode: string;
  result: string;
  errorReason: string | null;
  scannedAt: string;
  deviceId: string | null;
  operator: { id: string; name: string } | null;
  resolvedVariant: { id: string; colourName: string; product: { id: string; name: string } } | null;
  session: {
    id: string;
    sessionCode: string;
    status: string;
    purchaseOrder: { poNumber: string; client: { id: string; name: string } };
  } | null;
}

interface DispatchSession {
  id: string;
  sessionCode: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  deviceScanCount: number;
  purchaseOrder: { poNumber: string; client: { id: string; name: string } };
  vehicle: { registrationNumber: string } | null;
  supervisor: { id: string; name: string } | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function driverIcon(driver: string) {
  switch (driver) {
    case 'zebra-datawedge': return <Wifi className="h-5 w-5" />;
    case 'serial':          return <Terminal className="h-5 w-5" />;
    case 'camera':          return <Camera className="h-5 w-5" />;
    default:                return <Usb className="h-5 w-5" />;
  }
}

function driverLabel(driver: string) {
  const map: Record<string, string> = {
    'hid-keyboard':    'USB / Keyboard Wedge',
    'serial':          'RS-232 Serial',
    'zebra-datawedge': 'Zebra DataWedge',
    'camera':          'Camera',
  };
  return map[driver] ?? driver;
}

function deviceTypeLabel(t: string) {
  const map: Record<string, string> = {
    BARCODE_SCANNER:   'Barcode Scanner',
    BLUETOOTH_SCANNER: 'Bluetooth Scanner',
    ZEBRA_HANDHELD:    'Zebra Handheld',
    ZEBRA_FIXED:       'Zebra Fixed / Presentation',
    ANDROID_DEVICE:    'Android + DataWedge',
    MOBILE_CAMERA:     'Mobile Camera',
    DESKTOP_CAMERA:    'Desktop / Webcam',
    SERIAL_SCANNER:    'RS-232 Scanner',
  };
  return map[t] ?? t;
}

function formatTs(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

function statusPill(result: string) {
  if (result === 'SUCCESS') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
      <XCircle className="h-3 w-3" /> {result.replace(/_/g, ' ')}
    </span>
  );
}

function sessionStatusPill(status: string) {
  const cls: Record<string, string> = {
    OPEN:   'bg-blue-100 text-blue-800',
    CLOSED: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[status] ?? 'bg-yellow-100 text-yellow-800'}`}>
      {status}
    </span>
  );
}

function lastSeenLabel(ts: string | null, isActive: boolean) {
  if (!isActive) return { label: 'INACTIVE', cls: 'bg-gray-200 text-gray-600' };
  if (!ts) return { label: 'NEVER SEEN', cls: 'bg-gray-100 text-gray-500' };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5 * 60_000)  return { label: 'ACTIVE',      cls: 'bg-emerald-100 text-emerald-800' };
  if (diff < 60 * 60_000) return { label: 'RECENT',      cls: 'bg-yellow-100 text-yellow-700' };
  return { label: 'REGISTERED', cls: 'bg-gray-100 text-gray-600' };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-accent opacity-70">{icon}</span>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ deviceId }: { deviceId: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['devices', deviceId, 'history', page],
    queryFn: async () => {
      const r = await api.get(`/devices/${deviceId}/history?page=${page}&limit=20`);
      return r.data as { data: ScanHistoryEvent[]; meta: PaginatedResponse<ScanHistoryEvent>['meta'] };
    },
  });

  if (isLoading) return <div className="py-12 flex justify-center"><LoadingSpinner /></div>;

  const events = data?.data ?? [];
  const meta = data?.meta;

  if (events.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Activity className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No scan history yet</p>
        <p className="text-sm mt-1">Scans will appear here once this device starts scanning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Barcode</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">Session</th>
              <th className="px-4 py-3 text-left">Operator</th>
              <th className="px-4 py-3 text-left">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((ev) => (
              <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                  {new Date(ev.scannedAt).toLocaleTimeString()}<br />
                  <span className="text-gray-400">{new Date(ev.scannedAt).toLocaleDateString()}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[140px] truncate">
                  {ev.scannedBarcode}
                </td>
                <td className="px-4 py-3 text-gray-700 max-w-[160px]">
                  {ev.resolvedVariant ? (
                    <span>{ev.resolvedVariant.product.name}<br />
                      <span className="text-xs text-gray-400">{ev.resolvedVariant.colourName}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {ev.session ? (
                    <Link
                      to={`/app/dispatch/${ev.session.id}`}
                      className="text-accent hover:underline font-mono text-xs"
                    >
                      {ev.session.sessionCode}
                    </Link>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {ev.operator?.name ?? '—'}
                </td>
                <td className="px-4 py-3">{statusPill(ev.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {meta.page} of {meta.totalPages} ({meta.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sessions tab ──────────────────────────────────────────────────────────────

function SessionsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['devices', deviceId, 'sessions'],
    queryFn: async () => {
      const r = await api.get(`/devices/${deviceId}/sessions`);
      return r.data.data as DispatchSession[];
    },
  });

  if (isLoading) return <div className="py-12 flex justify-center"><LoadingSpinner /></div>;

  const sessions = data ?? [];

  if (sessions.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No dispatch sessions yet</p>
        <p className="text-sm mt-1">Sessions that used this device for scanning will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3 text-left">Session</th>
            <th className="px-4 py-3 text-left">PO / Client</th>
            <th className="px-4 py-3 text-left">Vehicle</th>
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Scans by device</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  to={`/app/dispatch/${s.id}`}
                  className="font-mono text-accent hover:underline text-xs font-medium"
                >
                  {s.sessionCode}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p className="font-mono text-xs text-gray-700">{s.purchaseOrder.poNumber}</p>
                <p className="text-xs text-gray-400">{s.purchaseOrder.client.name}</p>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                {s.vehicle?.registrationNumber ?? '—'}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                {formatDate(s.openedAt)}
                {s.closedAt && <><br /><span className="text-gray-400">→ {formatDate(s.closedAt)}</span></>}
              </td>
              <td className="px-4 py-3">{sessionStatusPill(s.status)}</td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-semibold text-gray-700">{s.deviceScanCount}</span>
                <span className="text-xs text-gray-400 ml-1">scan{s.deviceScanCount !== 1 ? 's' : ''}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'history' | 'sessions';

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('history');

  const { data: device, isLoading, isError } = useQuery({
    queryKey: ['devices', id],
    queryFn: async () => {
      const r = await api.get(`/devices/${id}`);
      return r.data.data as DeviceDetail;
    },
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium mb-2">Device not found</p>
        <Button variant="outline" onClick={() => navigate('/app/devices')}>Back to devices</Button>
      </div>
    );
  }

  const { label: statusLabel, cls: statusCls } = lastSeenLabel(device.lastSeenAt, device.isActive);

  const scanOutcomeSlices = useMemo<DonutSlice[]>(() => {
    const success = device.stats.successScans;
    const errors = device.stats.errorScans;
    const total = success + errors;
    if (total === 0) return [];

    return [
      { label: 'Success', value: success, color: '#059669' },
      { label: 'Errors', value: errors, color: '#DC2626' },
    ];
  }, [device.stats.successScans, device.stats.errorScans]);

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/app/devices')} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Scanner Devices
      </Button>

      {/* Header */}
      <PageHeader
        title={device.name}
        subtitle={`Serial: ${device.serialNumber}`}
        actions={
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusCls}`}>
            {statusLabel}
          </span>
        }
      />

      {/* Identity card */}
      <Card>
        <CardContent className="py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Driver</p>
              <div className="flex items-center gap-1.5 text-gray-700">
                {driverIcon(device.driverName)}
                <span>{driverLabel(device.driverName)}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Device type</p>
              <p className="text-gray-700">{deviceTypeLabel(device.deviceType)}</p>
            </div>
            {device.location && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Location</p>
                <p className="text-gray-700">{device.location}</p>
              </div>
            )}
            {device.ipAddress && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">IP Address</p>
                <p className="font-mono text-gray-700">{device.ipAddress}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Last seen</p>
              <p className="text-gray-700">{formatTs(device.lastSeenAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Registered by</p>
              <p className="text-gray-700">{device.registeredBy.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Registered on</p>
              <p className="text-gray-700">{formatDate(device.createdAt)}</p>
            </div>
            {device.stats.firstUsedAt && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">First scan</p>
                <p className="text-gray-700">{formatDate(device.stats.firstUsedAt)}</p>
              </div>
            )}
          </div>
          {device.notes && (
            <p className="mt-4 text-sm text-gray-500 italic border-t pt-3">{device.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* Lifetime stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Total scans"
          value={device.stats.totalScans}
          sub="all time"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Success rate"
          value={device.stats.successRate !== null ? `${device.stats.successRate}%` : '—'}
          sub={`${device.stats.successScans} successful`}
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="Errors"
          value={device.stats.errorScans}
          sub="failed scans"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Sessions used in"
          value={device.stats.totalSessions}
          sub="dispatch sessions"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Scan outcomes</h3>
            <p className="text-xs text-gray-500">{device.stats.totalScans} total</p>
          </div>
          <DonutChart data={scanOutcomeSlices} height={190} showLegend />
        </CardContent>
      </Card>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(['history', 'sessions'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'history' ? 'Scan History' : 'Dispatch Sessions'}
            </button>
          ))}
        </div>

        {tab === 'history' && id && <HistoryTab deviceId={id} />}
        {tab === 'sessions' && id && <SessionsTab deviceId={id} />}
      </div>
    </div>
  );
}
