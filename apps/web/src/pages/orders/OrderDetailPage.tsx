import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle, Truck, AlertTriangle, QrCode } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

interface LineItem {
  id: string;
  orderedBoxes: number;
  loadedBoxes: number;
  orderedPieces: number;
  ratePerBoxPaise: number;
  gstPercent: number;
  totalAmountPaise: number;
  variant: {
    id: string;
    colourCode: string;
    colourName: string;
    barcodeValue: string;
    lengthMm: number | null;
    widthMm: number | null;
    thicknessMm: number | null;
    product: { sku: string; name: string; piecesPerBox: number };
  };
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedDispatchDate: string | null;
  totalAmountPaise: number;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string; phone: string; clientCode: string };
  lineItems: LineItem[];
  sessions: Array<{
    id: string;
    sessionCode: string;
    status: string;
    openedAt: string;
    totalBoxesScanned: number;
    totalBoxesExpected: number;
    pod?: {
      id: string;
      status: string;
      acknowledgedAt: string | null;
      linkExpiresAt: string;
    } | null;
  }>;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('orders:update');
  const [generatingLabels, setGeneratingLabels] = useState<string[]>([]);

  const { data: po, isLoading } = useQuery<PurchaseOrder>({
    queryKey: ['order', id],
    queryFn: async () => {
      const r = await api.get(`/orders/${id}`);
      return r.data.data;
    },
    enabled: !!id,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => api.patch(`/orders/${id}/confirm`),
    onSuccess: () => {
      toast.success('Order confirmed');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Failed to confirm order'),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => api.patch(`/orders/${id}/cancel`),
    onSuccess: () => {
      toast.success('Order cancelled');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Failed to cancel order'),
  });

  // ── Derived values — MUST be before any early return (Rules of Hooks) ────
  const totalOrdered = po?.lineItems.reduce((s, li) => s + li.orderedBoxes, 0) ?? 0;
  const totalLoaded  = po?.lineItems.reduce((s, li) => s + li.loadedBoxes, 0) ?? 0;
  const loadPercent  = totalOrdered > 0 ? Math.round((totalLoaded / totalOrdered) * 100) : 0;

  const completionSlices = useMemo<DonutSlice[]>(() => {
    const lineItems = po?.lineItems ?? [];
    const lineCount = lineItems.length;
    if (lineCount === 0) return [];
    const completed = lineItems.filter((li) => li.orderedBoxes > 0 && li.loadedBoxes >= li.orderedBoxes).length;
    const incomplete = Math.max(0, lineCount - completed);
    return [
      { label: 'Completed', value: completed, color: '#059669' },
      { label: 'Incomplete', value: incomplete, color: '#DC2626' },
    ];
  }, [po?.lineItems]);

  async function handlePrintLabel(li: LineItem) {
    setGeneratingLabels((prev) => [...prev, li.id]);
    try {
      const r = await api.post(
        '/variants/generate-labels',
        {
          variantIds: [li.variant.id],
          orderInfo: {
            orderId: po?.poNumber,
            clientName: po?.client.name,
            date: new Date(po?.orderDate ?? '').toLocaleDateString('en-IN'),
            totalBoxes: li.orderedBoxes,
          },
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(r.data);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate label');
    } finally {
      setGeneratingLabels((prev) => prev.filter((id) => id !== li.id));
    }
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (!po) return <div className="text-center py-20 text-text-secondary">Order not found</div>;


  return (
    <div className="space-y-6">
      <PageHeader
        title={po.poNumber}
        subtitle={`Client: ${po.client.name}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/app/orders')}>
              Back
            </Button>
            {canManage && po.status === 'DRAFT' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<XCircle className="h-4 w-4" />}
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  icon={<CheckCircle className="h-4 w-4" />}
                  loading={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                >
                  Confirm Order
                </Button>
              </>
            )}
            {canManage && (po.status === 'CONFIRMED' || po.status === 'PARTIALLY_LOADED') && (
              <Button size="sm" icon={<Truck className="h-4 w-4" />} onClick={() => navigate('/app/dispatch/new?poId=' + po.id)}>
                Start Loading
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Order Info</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {[
                  { label: 'PO Number', value: <span className="font-mono font-semibold text-accent">{po.poNumber}</span> },
                  { label: 'Status', value: <StatusBadge status={po.status} /> },
                  { label: 'Client', value: po.client.name },
                  { label: 'Order Date', value: new Date(po.orderDate).toLocaleDateString('en-IN') },
                  { label: 'Expected Dispatch', value: po.expectedDispatchDate ? new Date(po.expectedDispatchDate).toLocaleDateString('en-IN') : '—' },
                  { label: 'Total Amount', value: <span className="font-bold text-accent">₹{(po.totalAmountPaise / 100).toFixed(2)}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <dt className="text-text-secondary flex-shrink-0">{label}</dt>
                    <dd className="font-medium text-text-primary text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Loading Progress</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center mb-3">
                <span className="text-3xl font-bold text-text-primary">{loadPercent}%</span>
                <p className="text-sm text-text-secondary mt-1">{totalLoaded} / {totalOrdered} boxes loaded</p>
              </div>
              <ProgressBar value={totalLoaded} max={totalOrdered} />
              {po.status === 'CONFIRMED' && totalOrdered > 0 && totalLoaded === 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  Ready for dispatch. Start a loading session.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line item completion</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <DonutChart data={completionSlices} height={180} showLegend />
            </CardContent>
          </Card>

          {po.sessions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Dispatch Sessions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {po.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-surface cursor-pointer transition-colors"
                    onClick={() => navigate(`/app/sessions/${s.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium font-mono text-text-primary">{s.sessionCode}</p>
                      <p className="text-xs text-text-secondary">{new Date(s.openedAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <StatusBadge status={s.status} />
                      {s.pod ? (
                        <StatusBadge status={s.pod.status} />
                      ) : (
                        <span className="text-[10px] text-text-secondary/50 uppercase">No POD</span>
                      )}
                      <p className="text-xs text-text-secondary mt-0.5">{s.totalBoxesScanned}/{s.totalBoxesExpected} boxes</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line Items ({po.lineItems.length})</CardTitle>
            </CardHeader>
            <div className="sm:hidden space-y-3 p-4">
              {po.lineItems.map((li) => {
                const dims = [li.variant.lengthMm, li.variant.widthMm, li.variant.thicknessMm].filter(Boolean).join('×');
                const completed = li.loadedBoxes >= li.orderedBoxes && li.orderedBoxes > 0;
                return (
                  <div key={li.id} className="border border-border rounded-xl p-4 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">{li.variant.colourName}</p>
                        <p className="text-xs text-text-secondary truncate">
                          <span className="font-mono text-accent">{li.variant.product.sku}</span>
                          {dims ? <span className="ml-2">{dims}mm</span> : null}
                        </p>
                      </div>
                      <p className={`text-xs font-medium ${completed ? 'text-green-700' : 'text-text-primary'} shrink-0`}>
                        {li.loadedBoxes}/{li.orderedBoxes}
                      </p>
                    </div>

                    <div className="mt-3">
                      <ProgressBar value={li.loadedBoxes} max={li.orderedBoxes} size="sm" />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="xs"
                          icon={<QrCode className="h-3 w-3" />}
                          loading={generatingLabels.includes(li.id)}
                          onClick={() => handlePrintLabel(li)}
                        >
                          Print Labels
                        </Button>
                      </div>
                      <p className="text-xs font-medium tabular-nums text-right text-text-primary">
                        ₹{(li.ratePerBoxPaise / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-text-secondary">Amount</p>
                      <p className="text-sm font-bold tabular-nums text-right text-accent">
                        ₹{(li.totalAmountPaise / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 text-right">
                <p className="text-sm text-text-secondary">Total</p>
                <p className="text-sm font-bold text-accent">
                  ₹{(po.totalAmountPaise / 100).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary font-medium">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3 text-right">Loaded</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {po.lineItems.map((li) => {
                    const dims = [li.variant.lengthMm, li.variant.widthMm, li.variant.thicknessMm].filter(Boolean).join('×');
                    return (
                      <tr key={li.id} className="hover:bg-surface/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{li.variant.colourName}</p>
                          <p className="text-xs text-text-secondary">
                            <span className="font-mono text-accent">{li.variant.product.sku}</span>
                            {dims && <span className="ml-2">{dims}mm</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{li.orderedBoxes}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={li.loadedBoxes === li.orderedBoxes ? 'text-green-600 font-semibold' : 'text-text-primary'}>
                            {li.loadedBoxes}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-28">
                          <ProgressBar value={li.loadedBoxes} max={li.orderedBoxes} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                          ₹{(li.ratePerBoxPaise / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-text-primary">₹{(li.totalAmountPaise / 100).toFixed(2)}</span>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-6 px-2 text-[10px]"
                              icon={<QrCode className="h-3 w-3" />}
                              loading={generatingLabels.includes(li.id)}
                              onClick={() => handlePrintLabel(li)}
                            >
                              Labels
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-semibold text-text-secondary">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-accent">₹{(po.totalAmountPaise / 100).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {po.notes && (
              <div className="px-4 py-3 border-t border-border bg-surface rounded-b-xl">
                <p className="text-xs text-text-secondary font-medium">Notes</p>
                <p className="text-sm text-text-primary mt-1">{po.notes}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
