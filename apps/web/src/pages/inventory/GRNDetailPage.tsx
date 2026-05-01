import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { useGRN } from '../../hooks/useInventory.ts';
import api from '../../lib/axios.ts';

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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
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
