import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { POStatus, PODStatus } from '@smartload/shared';

interface DashboardSummary {
  sessionsOpenedToday: number;
  activeSessions: number;
  boxesScannedToday: number;
  errorScansToday: number;
  podsPending: number;
}

export default function DispatchDashboard() {
  const { t } = useTranslation();
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

  const { data: completedToday, refetch: refetchCompleted } = useQuery({
    queryKey: ['sessions-completed-today-dashboard'],
    queryFn: async () => {
      const t = new Date();
      const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const r = await api.get(
        `/sessions?status=CLOSED&dateFrom=${encodeURIComponent(ymd)}&dateTo=${encodeURIComponent(ymd)}&limit=10`,
      );
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 15_000,
  });

  const { data: partialOrders } = useQuery({
    queryKey: ['orders-partial-dispatch'],
    queryFn: async () => {
      const r = await api.get(`/orders?status=${POStatus.PARTIALLY_LOADED}&limit=50`);
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 30_000,
  });

  const { data: disputedData, refetch: refetchDisputed } = useQuery({
    queryKey: ['pods-disputed-dashboard'],
    queryFn: async () => {
      const r = await api.get(`/pod?status=${PODStatus.DISPUTED}&limit=15`);
      const meta = r.data.meta as { total?: number } | undefined;
      const items = r.data.data as Record<string, unknown>[];
      return {
        items,
        total: meta?.total ?? items.length,
      };
    },
    refetchInterval: 15_000,
  });

  const { data: disputedSessions, refetch: refetchDisputedSessions } = useQuery({
    queryKey: ['sessions-pod-disputed-dashboard'],
    queryFn: async () => {
      const r = await api.get('/sessions?podStatus=DISPUTED&limit=15');
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 15_000,
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
    void refetchDisputed();
    void refetchDisputedSessions();
    void refetchCompleted();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('dispatch.title')}
        subtitle={t('dispatch.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={refreshAll}>
              {t('dispatch.refresh')}
            </Button>
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => openCreateModal()}>
              {t('dispatch.newDispatch')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('dispatch.sessionsOpenedToday')} value={summary?.sessionsOpenedToday ?? 0} icon={<Activity />} />
        <StatCard label={t('dispatch.activeSessions')} value={summary?.activeSessions ?? 0} accent icon={<Truck />} />
        <StatCard label={t('dispatch.boxesScannedToday')} value={summary?.boxesScannedToday ?? 0} icon={<Package />} />
        <StatCard label={t('dispatch.errorScansToday')} value={summary?.errorScansToday ?? 0} danger icon={<AlertTriangle />} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('dispatch.podsPending')} value={summary?.podsPending ?? 0} icon={<CheckCircle />} />
        <StatCard
          label={t('dispatch.podsDisputed')}
          value={disputedData?.total ?? 0}
          danger
          icon={<AlertTriangle />}
        />
      </div>

      {!!disputedData?.items.length && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            {t('dispatch.disputedPodsTitle')}
            <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
              {disputedData.total}
            </span>
          </h2>
          <Card className="border-amber-200">
            <CardContent className="divide-y max-h-80 overflow-y-auto p-0">
              {disputedData.items.map((pod) => (
                <DisputedPodRow key={pod.id as string} pod={pod} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {!!disputedSessions?.length && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            {t('dispatch.sessionsDisputedPodTitle')}
            <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
              {disputedSessions.length}
            </span>
          </h2>
          <Card className="border-amber-200">
            <CardContent className="divide-y max-h-64 overflow-y-auto p-0">
              {disputedSessions.map((s) => (
                <DisputedSessionRow key={s.id as string} session={s} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          {t('dispatch.completedTodayTitle')}
          <span className="text-xs bg-green-100 text-green-900 px-2 py-0.5 rounded-full">
            {completedToday?.length ?? 0}
          </span>
        </h2>
        <p className="text-sm text-gray-500 mb-2">{t('dispatch.completedTodaySubtitle')}</p>
        <Card className="border-green-100">
          <CardContent className="divide-y max-h-72 overflow-y-auto p-0">
            {completedToday?.length ? (
              completedToday.map((s) => <CompletedSessionRow key={s.id as string} session={s} />)
            ) : (
              <div className="py-8 text-center text-gray-500 text-sm px-4">{t('dispatch.noCompletedToday')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {t('dispatch.activeDispatchTitle')}
            <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">
              {activeSessions?.length ?? 0}
            </span>
          </h2>
        </div>

        {!activeSessions?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              {t('dispatch.allDispatchesComplete')}
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
        <h2 className="text-lg font-semibold mb-3">{t('dispatch.readyToDispatch')}</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">{t('dispatch.poNumber')}</th>
                  <th className="text-left p-3">{t('dispatch.client')}</th>
                  <th className="text-left p-3">{t('dispatch.items')}</th>
                  <th className="text-left p-3">{t('dispatch.totalBoxes')}</th>
                  <th className="text-left p-3">{t('dispatch.status')}</th>
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
                        {t('dispatch.startLoading')}
                      </Button>
                    </td>
                  </tr>
                  );
                })}
                {!pendingPos.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      {t('dispatch.noConfirmedPOs')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">{t('dispatch.recentScanErrors')}</h2>
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
              <p className="py-8 text-center text-gray-500 text-sm">{t('dispatch.noErrorsToday')}</p>
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

function CompletedSessionRow({ session }: { session: Record<string, unknown> }) {
  const { t } = useTranslation();
  const po = session.purchaseOrder as Record<string, unknown> | undefined;
  const client = po?.client as Record<string, unknown> | undefined;
  const closedAt = session.closedAt as string | null | undefined;
  return (
    <div className="py-3 px-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-mono font-semibold text-gray-900">{session.sessionCode as string}</p>
        <p className="text-gray-500 text-xs truncate">
          {(po?.poNumber as string) ?? '—'} · {(client?.name as string) ?? '—'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {(session.totalBoxesScanned as number) ?? 0} / {(session.totalBoxesExpected as number) ?? 0} boxes
        </p>
        {closedAt ? (
          <p className="text-xs text-gray-400 mt-0.5">
            {t('dispatch.closedAt')}: {new Date(closedAt).toLocaleString('en-IN')}
          </p>
        ) : null}
      </div>
      <Link to={`/app/sessions/${session.id as string}`}>
        <Button size="sm" variant="outline">{t('orders.view')}</Button>
      </Link>
    </div>
  );
}

function DisputedSessionRow({ session }: { session: Record<string, unknown> }) {
  const { t } = useTranslation();
  const po = session.purchaseOrder as Record<string, unknown> | undefined;
  const pod = session.pod as Record<string, unknown> | null | undefined;
  const client = po?.client as Record<string, unknown> | undefined;
  const vehicle = session.vehicle as Record<string, unknown> | undefined;
  return (
    <div className="py-3 px-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-mono font-semibold text-gray-900">{session.sessionCode as string}</p>
        <p className="text-gray-500 text-xs truncate">
          {(po?.poNumber as string) ?? '—'} · {(client?.name as string) ?? '—'} ·{' '}
          {(vehicle?.registrationNumber as string) ?? '—'}
        </p>
        {pod?.status != null ? (
          <p className="text-xs text-amber-800 mt-1">
            {t('dispatch.podLabel')}: {String(pod.status)}
          </p>
        ) : null}
      </div>
      <Link to={`/app/sessions/${session.id as string}`}>
        <Button size="sm" variant="outline">
          {t('dispatch.openSession')}
        </Button>
      </Link>
    </div>
  );
}

function DisputedPodRow({ pod }: { pod: Record<string, unknown> }) {
  const { t } = useTranslation();
  const session = pod.session as Record<string, unknown> | undefined;
  const po = session?.purchaseOrder as Record<string, unknown> | undefined;
  const client = po?.client as Record<string, unknown> | undefined;
  const vehicle = session?.vehicle as Record<string, unknown> | undefined;
  const sessionId = session?.id as string | undefined;
  return (
    <div className="py-3 px-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-mono text-gray-800 truncate">{(po?.poNumber as string) ?? '—'}</p>
        <p className="text-gray-500 text-xs truncate">
          {(client?.name as string) ?? 'Client'} · {(vehicle?.registrationNumber as string) ?? '—'}
        </p>
      </div>
      {sessionId && (
        <Link to={`/app/sessions/${sessionId}`}>
          <Button size="sm" variant="outline">
            {t('dispatch.viewSession')}
          </Button>
        </Link>
      )}
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
  const { t } = useTranslation();
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
            {t('dispatch.operatorLabel')}: {(operator.name as string) ?? '—'}
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
              {t('dispatch.viewSession')}
            </Button>
          </Link>
          <Link to={`/scan/${session.id as string}`}>
            <Button size="sm">{t('dispatch.openScanUi')}</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
