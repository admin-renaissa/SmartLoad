import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { useVehicleHistory } from '../../hooks/useVehicles.ts';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';

function plateWrap(reg: string) {
  const spaced =
    reg.length > 6 ? `${reg.slice(0, 2)} ${reg.slice(2, 4)} ${reg.slice(4, 6)} ${reg.slice(6)}` : reg;
  return (
    <span className="inline-block bg-[#fcecb5] border-4 border-black rounded-md px-4 py-3 font-black tracking-widest text-lg md:text-xl text-black uppercase shadow-inner whitespace-nowrap">
      {spaced}
    </span>
  );
}

export default function VehicleHistoryPage() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const [df, setDf] = useState('');
  const [dt, setDt] = useState('');

  const { data, isLoading } = useVehicleHistory(id, {
    page,
    limit: 10,
    dateFrom: df || undefined,
    dateTo: dt || undefined,
  });

  const bundle = data?.payload;
  const meta = data?.meta as { totalPages?: number; hasNext?: boolean; hasPrev?: boolean } | undefined;
  const vehicle = bundle?.vehicle as Record<string, unknown> | undefined;
  const sessions = (bundle?.sessions as Record<string, unknown>[]) ?? [];
  const stats = bundle?.stats as Record<string, unknown> | undefined;

  const reg = vehicle?.registrationNumber as string | undefined;

  const mostClient =
    stats?.mostFrequentClient != null ? String(stats.mostFrequentClient) : '—';

  const prettyType = useMemo(() => {
    const t = vehicle?.type as string | undefined;
    return t ? t.replace('_', ' ') : '—';
  }, [vehicle?.type]);

  const statusSlices = useMemo<DonutSlice[]>(() => {
    if (!sessions.length) return [];
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const st = String((s as Record<string, unknown>).status ?? 'UNKNOWN');
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.map(([label, value], i) => ({
      label,
      value,
      color: ['#2563EB', '#059669', '#DC2626', '#F59E0B', '#7C3AED'][i % 5],
    }));
  }, [sessions]);

  if (isLoading && !bundle) {
    return (
      <div className="py-24 flex justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={reg ? plateWrap(reg) : 'Vehicle'}
        subtitle=""
        actions={
          <Link to="/app/vehicles">
            <Button variant="outline" size="sm" icon={<ChevronLeft className="h-4 w-4" />}>
              Fleet
            </Button>
          </Link>
        }
      />

      <div className="text-sm text-gray-700 space-y-1">
        <p>
          <strong>{String(vehicle?.driverName ?? '')}</strong> · {prettyType}
        </p>
        <p className="text-gray-600">
          Lifetime dispatches: <strong>{String(stats?.totalSessions ?? '—')}</strong> · Boxes moved{' '}
          <strong>{String(stats?.totalBoxesMoved ?? '—')}</strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block">From</label>
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={df}
            onChange={(e) => setDf(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block">To</label>
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={dt}
            onChange={(e) => setDt(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { k: 'Dispatches', v: stats?.totalSessions ?? '—' },
          { k: 'Boxes Moved', v: stats?.totalBoxesMoved ?? '—' },
          { k: 'Avg Duration (min)', v: stats?.avgDurationMin ?? '—' },
          { k: 'Most Frequent Client', v: mostClient },
        ].map((c) => (
          <Card key={String(c.k)}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">{c.k}</p>
              <p className="text-lg font-bold text-gray-900">{String(c.v)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Session status mix</h3>
            <span className="text-xs text-gray-500">{sessions.length} sessions</span>
          </div>
          <DonutChart data={statusSlices} height={190} showLegend />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h3 className="font-semibold text-gray-900">Dispatch timeline</h3>
        <div className="relative border-l-2 border-gray-200 ml-4 space-y-6 pl-8 pb-8">
          {sessions.map((s) => (
            <div key={String(s.id)} className="relative">
              <span className="absolute -left-[31px] top-2 w-3 h-3 rounded-full bg-accent border-4 border-white" />
              <p className="text-xs text-gray-500 mb-2">
                {s.closedAt ? new Date(s.closedAt as string).toLocaleString('en-IN') : '—'}
              </p>
              <Card>
                <CardContent className="py-4 text-sm space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono text-accent">{String(s.sessionCode)}</span>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{String(s.status)}</span>
                  </div>
                  <p>
                    PO:{' '}
                    <Link
                      to={`/app/orders/${String((s.purchaseOrder as { id?: string })?.id ?? '')}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {String((s.poNumber as string) ?? '')}
                    </Link>
                  </p>
                  <p>Client: {String(s.client ?? '')}</p>
                  <p className="text-xs text-gray-600">
                    Supervisor {(s.supervisor as { name?: string })?.name ?? '—'} · Operator{' '}
                    {(s.operator as { name?: string })?.name ?? '—'}
                  </p>
                  <p>
                    Duration:{' '}
                    <strong>
                      {s.durationMinutes != null ? `${Number(s.durationMinutes)} min` : '—'}
                    </strong>{' '}
                    · Boxes: <strong>{Number(s.totalBoxesScanned ?? 0)}</strong>
                  </p>
                  <Link
                    className="text-accent text-xs font-semibold inline-block mt-2"
                    to={`/app/sessions/${String(s.id)}`}
                  >
                    View session →
                  </Link>
                </CardContent>
              </Card>
            </div>
          ))}
          {!sessions.length && (
            <p className="text-gray-500 text-sm">No closed sessions in this period.</p>
          )}
        </div>
      </div>

      {(meta?.totalPages ?? 0) > 1 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!meta?.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!meta?.hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
