import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';

export default function OrderListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => { const r = await api.get('/orders?limit=50'); return r.data.data; },
  });
  const orders = Array.isArray(data) ? data : [];

  const statusSlices = useMemo(() => {
    const colors: Record<string, string> = {
      CONFIRMED: '#2563EB',
      PARTIALLY_LOADED: '#F59E0B',
      DISPATCHED: '#0D9488',
      DELIVERED: '#16A34A',
      CANCELLED: '#DC2626',
    };

    const m = new Map<string, number>();
    for (const o of orders) {
      const st = String(o.status ?? 'UNKNOWN');
      m.set(st, (m.get(st) || 0) + 1);
    }

    return [...m.entries()]
      .map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value,
        color: colors[label],
      }))
      .sort((a, b) => b.value - a.value) as DonutSlice[];
  }, [orders]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')} actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/orders/new')}>{t('orders.newOrder')}</Button>} />
      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="text-text-primary">Order status mix</CardTitle>
          <p className="text-xs text-text-secondary font-medium italic opacity-60">Distribution in the current list</p>
        </CardHeader>
        <CardContent>
          <DonutChart data={statusSlices} height={220} showLegend />
        </CardContent>
      </Card>
      {isLoading ? <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div> : (
        <Card>
          {/* Mobile stacked cards */}
          <div className="sm:hidden">
            {orders.length === 0 ? (
              <div className="px-6 py-20 text-center text-text-secondary italic opacity-40 text-sm">{t('orders.empty')}</div>
            ) : (
              <div className="divide-y divide-border">
                {orders.map((o: Record<string, unknown>) => {
                  const lineItems = (o.lineItems as Array<{ orderedBoxes: number; loadedBoxes: number }>) || [];
                  const total = lineItems.reduce((s, li) => s + li.orderedBoxes, 0);
                  const loaded = lineItems.reduce((s, li) => s + li.loadedBoxes, 0);
                  return (
                    <div key={o.id as string} className="p-5 hover:bg-surface transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="font-mono font-black text-accent truncate text-lg tracking-tight">{o.poNumber as string}</div>
                          <div className="text-sm text-text-primary font-bold truncate">{(o.client as { name: string })?.name || '—'}</div>
                          <div className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60">
                            {o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'} · {t('orders.items')}: {((o._count as { lineItems: number })?.lineItems ?? lineItems.length) as number}
                          </div>
                        </div>
                        <StatusBadge status={o.status as string} />
                      </div>

                      <div className="mt-4">
                        <div className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-1.5 opacity-60">{t('orders.progress')}</div>
                        <ProgressBar value={loaded} max={total} size="sm" />
                      </div>

                      <div className="mt-3">
                        <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/app/orders/${o.id}`)}>
                          {t('orders.view')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface/30 text-[10px] text-text-secondary uppercase font-bold tracking-widest border-b border-border">
                    <th className="px-6 py-4">{t('orders.poNumber')}</th>
                    <th className="px-6 py-4">{t('orders.client')}</th>
                    <th className="px-6 py-4">{t('orders.date')}</th>
                    <th className="px-6 py-4">{t('orders.items')}</th>
                    <th className="px-6 py-4">{t('orders.progress')}</th>
                    <th className="px-6 py-4">{t('orders.status')}</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((o: Record<string, unknown>) => {
                    const lineItems = (o.lineItems as Array<{ orderedBoxes: number; loadedBoxes: number }>) || [];
                    const total = lineItems.reduce((s, li) => s + li.orderedBoxes, 0);
                    const loaded = lineItems.reduce((s, li) => s + li.loadedBoxes, 0);
                    return (
                      <tr key={o.id as string} className="hover:bg-surface transition-colors group">
                        <td className="px-6 py-5 font-mono font-black text-accent tracking-tight">{o.poNumber as string}</td>
                        <td className="px-6 py-5 font-bold text-text-primary">{(o.client as { name: string })?.name || '—'}</td>
                        <td className="px-6 py-5 text-text-secondary text-xs font-medium">
                          {o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-6 py-5 font-bold text-text-primary text-xs tracking-widest">{((o._count as { lineItems: number })?.lineItems ?? lineItems.length) as number}</td>
                        <td className="px-6 py-5 w-48">
                          <ProgressBar value={loaded} max={total} size="sm" />
                        </td>
                        <td className="px-6 py-5">
                          <StatusBadge status={o.status as string} />
                        </td>
                        <td className="px-6 py-5 text-right">
                          <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/app/orders/${o.id}`)}>
                            {t('orders.view')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-24 text-center text-text-secondary italic opacity-40">
                        {t('orders.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
