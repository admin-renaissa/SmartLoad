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

  const lineItems = (data?.lineItems as Record<string, unknown>[]) ?? [];

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

  if (isLoading || !data) {
    return (
      <div className="py-20 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const summary = data.summary as { totalVariants: number; totalBoxes: number; totalPieces: number };
  const createdBy = data.createdBy as { name?: string } | undefined;

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
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-text-secondary uppercase font-bold tracking-wider">Totals</p>
              <p className="text-text-primary">
                Variants <strong className="font-black">{summary.totalVariants}</strong> · Boxes{' '}
                <strong className="font-black">{summary.totalBoxes}</strong> · Pieces <strong className="font-black">{summary.totalPieces}</strong>
              </p>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-text-secondary uppercase font-bold tracking-wider mb-2">Top variants by boxes</p>
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
                  <div key={li.id as string} className="border border-border rounded-xl p-4 bg-surface/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{String(p?.name ?? '')}</p>
                        <p className="text-xs text-text-secondary truncate">
                          <span className="font-mono text-accent font-bold">{String(p?.sku ?? '')}</span>
                          {' · '}
                          {String(v.colourName)} <span className="opacity-50">({String(v.colourCode)})</span>
                        </p>
                      </div>
                      <p className="text-[10px] text-text-secondary shrink-0 uppercase font-bold">Stock now</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-text-secondary uppercase font-bold">Boxes</p>
                        <p className="text-sm font-black text-text-primary">{Number(li.receivedBoxes)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-secondary uppercase font-bold">Pieces</p>
                        <p className="text-sm font-black text-text-primary">{Number(li.receivedPieces)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-accent uppercase font-bold">Now</p>
                        <p className="text-sm font-black text-accent">{stk?.totalBoxes ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-[10px] text-text-secondary uppercase text-left font-bold tracking-widest">
                  <tr>
                    <th className="p-4">SKU</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Colour</th>
                    <th className="p-4 text-right">Boxes</th>
                    <th className="p-4 text-right">Pieces</th>
                    <th className="p-4 text-right">Stock now</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => {
                    const v = li.variant as Record<string, unknown>;
                    const p = v.product as Record<string, unknown>;
                    const stk = v.inventoryStock as { totalBoxes: number } | null | undefined;
                    return (
                      <tr key={li.id as string} className="border-t border-border hover:bg-surface/50 transition-colors">
                        <td className="p-4 font-mono text-xs text-accent font-bold">{String(p?.sku ?? '')}</td>
                        <td className="p-4 text-text-primary font-medium">{String(p?.name ?? '')}</td>
                        <td className="p-4 text-text-primary">
                          {String(v.colourName)} <span className="text-xs text-text-secondary/50 font-mono">({String(v.colourCode)})</span>
                        </td>
                        <td className="p-4 text-right font-black text-text-primary">{Number(li.receivedBoxes)}</td>
                        <td className="p-4 text-right text-text-secondary">{Number(li.receivedPieces)}</td>
                        <td className="p-4 text-right font-bold text-accent">{stk?.totalBoxes ?? '—'}</td>
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
      <p className="text-[10px] uppercase text-text-secondary font-bold tracking-wider mb-0.5">{label}</p>
      <p className="font-semibold text-text-primary">{val}</p>
    </div>
  );
}
