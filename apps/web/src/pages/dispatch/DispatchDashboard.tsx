import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Truck,
  Activity,
  AlertTriangle,
  CheckCircle,
  Plus,
  RefreshCw,
  Package,
} from 'lucide-react';
import api from '../../lib/axios.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { CreateSessionModal } from './CreateSessionModal.tsx';
import { POStatus } from '@smartload/shared';

interface DashboardSummary {
  sessionsOpenedToday: number;
  activeSessions: number;
  boxesScannedToday: number;
  errorScansToday: number;
  podsPending: number;
}

export default function DispatchDashboard() {
  const [modalOpen, setModalOpen] = useState(false);
  const [prefillPoId, setPrefillPoId] = useState<string | null>(null);

  const openCreateModal = (poId?: string) => {
    setPrefillPoId(poId ?? null);
    setModalOpen(true);
  };

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['dispatch-summary'],
    queryFn: async () => {
      const r = await api.get('/sessions/supervisor-summary');
      return r.data.data as DashboardSummary;
    },
    refetchInterval: 5000,
  });

  const { data: activeSessions, refetch: refetchActive } = useQuery({
    queryKey: ['sessions-active-dashboard'],
    queryFn: async () => {
      const r = await api.get('/sessions/active');
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 5000,
  });

  const { data: errorsFeed, refetch: refetchErrors } = useQuery({
    queryKey: ['scan-errors-recent'],
    queryFn: async () => {
      const r = await api.get('/sessions/errors/recent?limit=10');
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 10_000,
  });

  const { data: confirmedOrders } = useQuery({
    queryKey: ['orders-confirmed-dispatch'],
    queryFn: async () => {
      const r = await api.get(`/orders?status=${POStatus.CONFIRMED}&limit=50`);
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 30_000,
  });

  const { data: partialOrders } = useQuery({
    queryKey: ['orders-partial-dispatch'],
    queryFn: async () => {
      const r = await api.get(`/orders?status=${POStatus.PARTIALLY_LOADED}&limit=50`);
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 30_000,
  });

  const pendingPos = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const o of confirmedOrders ?? []) map.set(o.id as string, o);
    for (const o of partialOrders ?? []) map.set(o.id as string, o);
    return [...map.values()].filter((po) => {
      const status = po.status as string;
      return status === POStatus.CONFIRMED || status === POStatus.PARTIALLY_LOADED;
    });
  }, [confirmedOrders, partialOrders]);

  const refreshAll = () => {
    void refetchSummary();
    void refetchActive();
    void refetchErrors();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dispatch Operations"
        subtitle="Live supervisor dashboard — sessions, PO readiness, and scan errors."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={refreshAll}>
              Refresh
            </Button>
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => openCreateModal()}>
              New Dispatch
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Sessions opened today" value={summary?.sessionsOpenedToday ?? 0} icon={<Activity />} />
        <StatCard label="Active sessions" value={summary?.activeSessions ?? 0} accent icon={<Truck />} />
        <StatCard label="Boxes scanned today" value={summary?.boxesScannedToday ?? 0} icon={<Package />} />
        <StatCard label="Error scans today" value={summary?.errorScansToday ?? 0} danger icon={<AlertTriangle />} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="PODs pending" value={summary?.podsPending ?? 0} icon={<CheckCircle />} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Active Dispatch Sessions
            <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">
              {activeSessions?.length ?? 0}
            </span>
          </h2>
        </div>

        {!activeSessions?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              All dispatches complete for now
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {activeSessions.map((s) => (
              <SessionCard key={s.id as string} session={s} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Ready to Dispatch</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">PO Number</th>
                  <th className="text-left p-3">Client</th>
                  <th className="text-left p-3">Items</th>
                  <th className="text-left p-3">Total boxes</th>
                  <th className="text-left p-3">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {pendingPos.map((po) => {
                  const lis = (po.lineItems as Array<{ orderedBoxes: number }>) ?? [];
                  const totalBoxes = lis.reduce((s, li) => s + li.orderedBoxes, 0);
                  return (
                  <tr key={po.id as string} className="border-b">
                    <td className="p-3 font-mono">{po.poNumber as string}</td>
                    <td className="p-3">
                      {(po.client as Record<string, unknown>)?.name as string}
                    </td>
                    <td className="p-3">
                      {Array.isArray(po.lineItems) ? po.lineItems.length : '—'}
                    </td>
                    <td className="p-3">{totalBoxes}</td>
                    <td className="p-3">{po.status as string}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openCreateModal(po.id as string)}>
                        Start Loading
                      </Button>
                    </td>
                  </tr>
                  );
                })}
                {!pendingPos.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      No confirmed POs awaiting dispatch
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Scan Errors Today</h2>
        <Card>
          <CardContent className="divide-y max-h-80 overflow-y-auto">
            {(errorsFeed ?? []).map((ev) => (
              <div key={ev.id as string} className="py-3 flex gap-3 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono truncate text-gray-800">{ev.scannedBarcode as string}</p>
                  <p className="text-gray-500 text-xs">
                    {(ev.session as Record<string, unknown>)?.sessionCode as string} ·{' '}
                    {(ev.operator as Record<string, unknown>)?.name as string} · {ev.result as string}
                  </p>
                </div>
              </div>
            ))}
            {!errorsFeed?.length && (
              <p className="py-8 text-center text-gray-500 text-sm">No errors recorded today</p>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateSessionModal
        open={modalOpen}
        initialPoId={prefillPoId}
        onClose={() => {
          setModalOpen(false);
          setPrefillPoId(null);
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  danger,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className={danger ? 'border-red-200' : accent ? 'border-accent/30' : ''}>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-700">{icon}</div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCard({ session }: { session: Record<string, unknown> }) {
  const po = session.purchaseOrder as Record<string, unknown>;
  const client = po?.client as Record<string, unknown>;
  const vehicle = session.vehicle as Record<string, unknown>;
  const operator = session.operator as Record<string, unknown> | null;
  const pct =
    session.totalBoxesExpected && (session.totalBoxesExpected as number) > 0
      ? Math.round(
          ((session.totalBoxesScanned as number) / (session.totalBoxesExpected as number)) * 100,
        )
      : 0;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-start">
          <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">OPEN</span>
          <span className="font-mono text-sm text-gray-600">{session.sessionCode as string}</span>
        </div>
        <p className="text-3xl font-black tracking-wider text-gray-900">
          {(vehicle?.registrationNumber as string) ?? '—'}
        </p>
        <p className="text-sm text-gray-600">
          {(client?.name as string) ?? 'Client'} ·{' '}
          <span className="font-mono">{(po?.poNumber as string) ?? ''}</span>
        </p>
        {operator && (
          <p className="text-xs text-gray-500">
            Operator: {(operator.name as string) ?? '—'}
          </p>
        )}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-500">
          {(session.totalBoxesScanned as number) ?? 0} / {(session.totalBoxesExpected as number) ?? 0} boxes ({pct}
          %)
        </p>
        <div className="flex gap-2 pt-2">
          <Link to={`/app/sessions/${session.id as string}`}>
            <Button size="sm" variant="outline">
              View Session →
            </Button>
          </Link>
          <Link to={`/scan/${session.id as string}`}>
            <Button size="sm">Open Scan UI</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
