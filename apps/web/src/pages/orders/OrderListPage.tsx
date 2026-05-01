import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';

export default function OrderListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => { const r = await api.get('/orders?limit=50'); return r.data.data; },
  });
  const orders = Array.isArray(data) ? data : [];
  return (
    <div>
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')} actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/orders/new')}>{t('orders.newOrder')}</Button>} />
      {isLoading ? <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-gray-500 font-medium"><th className="px-6 py-3">{t('orders.poNumber')}</th><th className="px-6 py-3">{t('orders.client')}</th><th className="px-6 py-3">{t('orders.date')}</th><th className="px-6 py-3">{t('orders.items')}</th><th className="px-6 py-3">{t('orders.progress')}</th><th className="px-6 py-3">{t('orders.status')}</th><th className="px-6 py-3"></th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o: Record<string, unknown>) => {
                  const lineItems = (o.lineItems as Array<{orderedBoxes:number;loadedBoxes:number}>) || [];
                  const total = lineItems.reduce((s, li) => s + li.orderedBoxes, 0);
                  const loaded = lineItems.reduce((s, li) => s + li.loadedBoxes, 0);
                  return (
                    <tr key={o.id as string} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-accent">{o.poNumber as string}</td>
                      <td className="px-6 py-4">{(o.client as {name:string})?.name || '—'}</td>
                      <td className="px-6 py-4 text-gray-500">{o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-6 py-4">{(o._count as {lineItems:number})?.lineItems || lineItems.length}</td>
                      <td className="px-6 py-4 w-40"><ProgressBar value={loaded} max={total} size="sm" /></td>
                      <td className="px-6 py-4"><StatusBadge status={o.status as string} /></td>
                      <td className="px-6 py-4"><Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/app/orders/${o.id}`)}>{t('orders.view')}</Button></td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">{t('orders.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
