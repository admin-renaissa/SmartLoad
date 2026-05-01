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
        <CardHeader>
          <CardTitle>Order status mix</CardTitle>
          <p className="text-sm text-gray-500 font-normal">Distribution in the current list</p>
        </CardHeader>
        <CardContent>
          <DonutChart data={statusSlices} height={220} showLegend />
        </CardContent>
      </Card>
      {isLoading ? <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div> : (
        <Card>
          {/* Mobile stacked cards */}
          <div className="sm:hidden">
            {orders.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">{t('orders.empty')}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map((o: Record<string, unknown>) => {
                  const lineItems = (o.lineItems as Array<{ orderedBoxes: number; loadedBoxes: number }>) || [];
                  const total = lineItems.reduce((s, li) => s + li.orderedBoxes, 0);
                  const loaded = lineItems.reduce((s, li) => s + li.loadedBoxes, 0);
                  return (
                    <div key={o.id as string} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono font-medium text-accent truncate">{o.poNumber as string}</div>
                          <div className="text-xs text-gray-500 mt-1 truncate">{(o.client as { name: string })?.name || '—'}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'} · {t('orders.items')}: {((o._count as { lineItems: number })?.lineItems ?? lineItems.length) as number}
                          </div>
                        </div>
                        <StatusBadge status={o.status as string} />
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">{t('orders.progress')}</div>
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
                  <tr className="border-b border-gray-100 text-left text-gray-500 font-medium">
                    <th className="px-6 py-3">{t('orders.poNumber')}</th>
                    <th className="px-6 py-3">{t('orders.client')}</th>
                    <th className="px-6 py-3">{t('orders.date')}</th>
                    <th className="px-6 py-3">{t('orders.items')}</th>
                    <th className="px-6 py-3">{t('orders.progress')}</th>
                    <th className="px-6 py-3">{t('orders.status')}</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o: Record<string, unknown>) => {
                    const lineItems = (o.lineItems as Array<{ orderedBoxes: number; loadedBoxes: number }>) || [];
                    const total = lineItems.reduce((s, li) => s + li.orderedBoxes, 0);
                    const loaded = lineItems.reduce((s, li) => s + li.loadedBoxes, 0);
                    return (
                      <tr key={o.id as string} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-accent">{o.poNumber as string}</td>
                        <td className="px-6 py-4">{(o.client as { name: string })?.name || '—'}</td>
                        <td className="px-6 py-4 text-gray-500">
                          {o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-6 py-4">{((o._count as { lineItems: number })?.lineItems ?? lineItems.length) as number}</td>
                        <td className="px-6 py-4 w-40">
                          <ProgressBar value={loaded} max={total} size="sm" />
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={o.status as string} />
                        </td>
                        <td className="px-6 py-4">
                          <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/app/orders/${o.id}`)}>
                            {t('orders.view')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
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
