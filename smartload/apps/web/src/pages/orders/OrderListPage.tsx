import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';

export default function OrderListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => { const r = await api.get('/api/v1/orders?limit=50'); return r.data.data; },
  });
  const orders = Array.isArray(data) ? data : [];
  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Manage and track all client orders" actions={<Button icon={<Plus className="h-4 w-4"/>} onClick={() => navigate('/app/orders/new')}>New Order</Button>} />
      {isLoading ? <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-gray-500 font-medium"><th className="px-6 py-3">PO Number</th><th className="px-6 py-3">Client</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Items</th><th className="px-6 py-3">Progress</th><th className="px-6 py-3">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o: Record<string, unknown>) => {
                  const lineItems = (o.lineItems as Array<{orderedBoxes:number;loadedBoxes:number}>) || [];
                  const total = lineItems.reduce((s,li) => s + li.orderedBoxes, 0);
                  const loaded = lineItems.reduce((s,li) => s + li.loadedBoxes, 0);
                  return (
                    <tr key={o.id as string} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-accent">{o.poNumber as string}</td>
                      <td className="px-6 py-4">{(o.client as {name:string})?.name || '—'}</td>
                      <td className="px-6 py-4 text-gray-500">{o.orderDate ? new Date(o.orderDate as string).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-6 py-4">{(o._count as {lineItems:number})?.lineItems || lineItems.length}</td>
                      <td className="px-6 py-4 w-40"><ProgressBar value={loaded} max={total} size="sm" /></td>
                      <td className="px-6 py-4"><StatusBadge status={o.status as string} /></td>
                      <td className="px-6 py-4"><Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4"/>} onClick={() => navigate(`/app/orders/${o.id}`)}>View</Button></td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No orders yet. Create your first purchase order.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
