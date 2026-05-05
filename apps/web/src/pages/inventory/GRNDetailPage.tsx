import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { useGRN } from '../../hooks/useInventory.ts';
import api from '../../lib/axios.ts';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';

export default function GRNDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading } = useGRN(id);

  const downloadPdf = async () => {
    if (!data) return;
    try {
      const res = await api.get(`/grn/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GRN-${String(data.grnNumber ?? id)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download PDF');
    }
  };

  if (isLoading || !data) {
    return (
      <div className="py-20 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const summary = data.summary as { totalVariants: number; totalBoxes: number; totalPieces: number };
  const lineItems = (data.lineItems as Record<string, unknown>[]) ?? [];
  const createdBy = data.createdBy as { name?: string } | undefined;

  const topVariantSlices = useMemo<DonutSlice[]>(() => {
    if (!lineItems.length) return [];

    const totals = new Map<string, number>();

    for (const li of lineItems) {
      const v = li.variant as Record<string, unknown> | undefined;
      const p = v?.product as Record<string, unknown> | undefined;
      const sku = String(p?.sku ?? 'UNKNOWN SKU');
      const colour = String(v?.colourName ?? 'Unknown colour');
      const key = `${sku} · ${colour}`;
      const boxes = Number(li.receivedBoxes ?? 0);
      if (!Number.isFinite(boxes) || boxes <= 0) continue;
      totals.set(key, (totals.get(key) ?? 0) + boxes);
    }

    const sorted = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => v > 0);

    const top = sorted.slice(0, 5);
    const otherValue = sorted.slice(5).reduce((s, [, v]) => s + v, 0);

    const slices: DonutSlice[] = top.map(([label, value], i) => ({
      label: label.length > 18 ? label.slice(0, 18) + '…' : label,
      value,
      color: undefined,
    }));

    if (otherValue > 0) {
      slices.push({ label: 'Other', value: otherValue, color: '#94A3B8' });
    }

    return slices;
  }, [lineItems]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(data.grnNumber ?? '')}
        subtitle={`Received ${new Date(data.receivedDate as string).toLocaleDateString('en-IN')}`}
        actions={
          <>
            <Link to="/app/inventory/grn">
              <Button variant="outline" size="sm">
                ← All GRNs
              </Button>
            </Link>
            <Button size="sm" onClick={() => downloadPdf()}>
              Download PDF
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <Row label="Received date" val={new Date(data.receivedDate as string).toLocaleString('en-IN')} />
            <Row label="Created by" val={createdBy?.name ?? '—'} />
            <Row label="Notes" val={(data.notes as string) || '—'} />
            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 uppercase">Totals</p>
              <p>
                Variants <strong>{summary.totalVariants}</strong> · Boxes{' '}
                <strong>{summary.totalBoxes}</strong> · Pieces <strong>{summary.totalPieces}</strong>
              </p>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 uppercase">Top variants by boxes</p>
              <DonutChart data={topVariantSlices} height={190} showLegend={false} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="sm:hidden space-y-3 p-4">
              {lineItems.map((li) => {
                const v = li.variant as Record<string, unknown>;
                const p = v.product as Record<string, unknown>;
                const stk = v.inventoryStock as { totalBoxes: number } | null | undefined;
                return (
                  <div key={li.id as string} className="border border-gray-100 rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{String(p?.name ?? '')}</p>
                        <p className="text-xs text-gray-500 truncate">
                          <span className="font-mono text-accent">{String(p?.sku ?? '')}</span>
                          {' · '}
                          {String(v.colourName)} <span className="text-gray-400">{String(v.colourCode)}</span>
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 shrink-0">Stock now</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Boxes</p>
                        <p className="text-sm font-semibold text-gray-800">{Number(li.receivedBoxes)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Pieces</p>
                        <p className="text-sm font-semibold text-gray-800">{Number(li.receivedPieces)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Now</p>
                        <p className="text-sm font-semibold text-gray-800">{stk?.totalBoxes ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase text-left">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Colour</th>
                    <th className="p-3 text-right">Boxes</th>
                    <th className="p-3 text-right">Pieces</th>
                    <th className="p-3 text-right">Stock now</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => {
                    const v = li.variant as Record<string, unknown>;
                    const p = v.product as Record<string, unknown>;
                    const stk = v.inventoryStock as { totalBoxes: number } | null | undefined;
                    return (
                      <tr key={li.id as string} className="border-t">
                        <td className="p-3 font-mono text-xs">{String(p?.sku ?? '')}</td>
                        <td className="p-3">{String(p?.name ?? '')}</td>
                        <td className="p-3">
                          {String(v.colourName)} <span className="text-xs text-gray-400">{String(v.colourCode)}</span>
                        </td>
                        <td className="p-3 text-right font-semibold">{Number(li.receivedBoxes)}</td>
                        <td className="p-3 text-right">{Number(li.receivedPieces)}</td>
                        <td className="p-3 text-right text-gray-700">{stk?.totalBoxes ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="font-medium">{val}</p>
    </div>
  );
}
