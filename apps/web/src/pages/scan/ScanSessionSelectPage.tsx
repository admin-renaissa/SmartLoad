import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Truck, Package, RefreshCw, ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import api from '../../lib/axios.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

export default function ScanSessionSelectPage() {
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      const r = await api.get('/sessions/active');
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 10_000,
  });

  const sessions = data ?? [];

  const scanReadiness = useMemo(() => {
    let totalOrdered = 0;
    let totalLoaded = 0;
    for (const s of sessions) {
      const po = s.purchaseOrder as Record<string, unknown>;
      const lineItems = (po?.lineItems as Record<string, unknown>[]) ?? [];
      for (const li of lineItems) {
        totalOrdered += (li.orderedBoxes as number) ?? 0;
        totalLoaded += (li.loadedBoxes as number) ?? 0;
      }
    }
    const remaining = Math.max(0, totalOrdered - totalLoaded);
    return {
      totalSessions: sessions.length,
      totalLoaded,
      remaining,
    };
  }, [sessions]);

  return (
    <div className="min-h-screen bg-[#0F2044] text-white flex flex-col">
      <div className="px-6 pt-8 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/app/dashboard')}
            className="flex shrink-0 items-center gap-0.5 rounded-lg py-2 pl-2 pr-3 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="h-6 w-6" />
            <span className="font-medium">Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        <div>
          <h1 className="text-2xl font-bold">SmartLoad</h1>
          <p className="text-white/50 text-sm mt-1">Select a dispatch session to begin scanning</p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 space-y-3">
        {/* Scan analytics strip */}
        <div className="grid grid-cols-2 gap-3 mb-1">
          <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
            <div className="text-xs text-white/60 uppercase tracking-wider">Active sessions</div>
            <div className="text-2xl font-black mt-1">{scanReadiness.totalSessions}</div>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
            <div className="text-xs text-white/60 uppercase tracking-wider">Boxes remaining</div>
            <div className="text-2xl font-black mt-1">{scanReadiness.remaining}</div>
          </div>
        </div>

        <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Overall scan progress</div>
              <div className="text-xs text-white/60 mt-1">Loaded vs remaining boxes</div>
            </div>
            <div className="text-right text-xs text-white/60">
              <span className="font-mono text-white">{scanReadiness.totalLoaded}</span> loaded
            </div>
          </div>
          <div className="h-[200px]">
            <DonutChart
              data={[
                { label: 'LOADED', value: scanReadiness.totalLoaded, color: '#16A34A' },
                { label: 'REMAINING', value: scanReadiness.remaining, color: '#2563EB' },
              ]}
              height={200}
              showLegend
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center pt-20">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="text-center pt-20 text-white/40">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No active dispatch sessions</p>
            <p className="text-sm mt-1">Ask your supervisor to create a session</p>
          </div>
        )}

        {!isLoading &&
          sessions.map((s) => {
            const po = s.purchaseOrder as Record<string, unknown>;
            const client = po?.client as Record<string, unknown>;
            const vehicle = s.vehicle as Record<string, unknown>;
            const lineItems = (po?.lineItems as Record<string, unknown>[]) ?? [];
            const totalOrdered = lineItems.reduce((sum, li) => sum + (li.orderedBoxes as number), 0);
            const totalLoaded = lineItems.reduce((sum, li) => sum + (li.loadedBoxes as number), 0);
            const pct = totalOrdered === 0 ? 0 : Math.round((totalLoaded / totalOrdered) * 100);

            return (
              <button
                type="button"
                key={s.id as string}
                onClick={() => navigate(`/scan/${s.id as string}`)}
                className="w-full bg-white/10 hover:bg-white/20 rounded-2xl p-5 text-left transition-colors border border-white/10"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Truck className="w-6 h-6 text-accent shrink-0" />
                  <span className="text-2xl font-black tracking-wider">
                    {(vehicle?.registrationNumber as string) ?? '—'}
                  </span>
                </div>

                <div className="text-sm text-white/70 mb-1">
                  <span className="font-mono text-white/90">{po?.poNumber as string}</span>
                  {' · '}
                  {(client?.name as string) ?? 'Client'}
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>Loading progress</span>
                    <span>
                      {totalLoaded} / {totalOrdered} boxes
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-3 text-xs text-white/40">Tap to enter session →</div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
