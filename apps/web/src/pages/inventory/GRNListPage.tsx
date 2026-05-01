import { Link } from 'react-router-dom';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { useGRNs } from '../../hooks/useInventory.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import api from '../../lib/axios.ts';

export default function GRNListPage() {
  const canCreate = usePermission('grn:create');
  const [page] = useState(1);
  const [search, setSearch] = useState('');
  const [df, setDf] = useState('');
  const [dt, setDt] = useState('');

  const { data, isLoading } = useGRNs({
    page,
    limit: 25,
    search: search || undefined,
    dateFrom: df || undefined,
    dateTo: dt || undefined,
  });

  const rows = ((data?.data as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];

  const downloadPdf = async (id: string, num?: string) => {
    try {
      const res = await api.get(`/grn/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = num ? `GRN-${num}.pdf` : `GRN-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download PDF');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods Receipt Notes"
        subtitle="Inbound stock confirmations"
        actions={
          canCreate ?
            <Link to="/app/inventory/grn/new">
              <Button size="sm">Create GRN</Button>
            </Link>
          : null
        }
      />

      <Card>
        <CardContent className="py-6 flex flex-wrap gap-4">
          <input
            placeholder="GRN search…"
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[140px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={df}
            onChange={(e) => setDf(e.target.value)}
          />
          <span className="self-center text-gray-500">→</span>
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={dt}
            onChange={(e) => setDt(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ?
            <div className="py-16 flex justify-center">
              <LoadingSpinner />
            </div>
          : <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                <tr>
                  <th className="p-3">GRN Number</th>
                  <th className="p-3">Received</th>
                  <th className="p-3">Items</th>
                  <th className="p-3 text-right">Total Boxes</th>
                  <th className="p-3">Created By</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id as string} className="border-t hover:bg-gray-50/70">
                    <td className="p-3">
                      <Link
                        to={`/app/inventory/grn/${String(g.id)}`}
                        className="font-mono text-accent font-semibold hover:underline"
                      >
                        {(g.grnNumber as string) ?? ''}
                      </Link>
                    </td>
                    <td className="p-3">
                      {(g.receivedDate as string) ?
                        new Date(g.receivedDate as string).toLocaleDateString('en-IN')
                      : ''}
                    </td>
                    <td className="p-3">
                      {(g._count as { lineItems?: number })?.lineItems ?? '—'}
                    </td>
                    <td className="p-3 text-right font-medium">{(g.totalBoxes as number) ?? 0}</td>
                    <td className="p-3">{(g.createdBy as { name?: string })?.name ?? '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-3 items-center">
                        <Link className="text-accent text-xs font-medium" to={`/app/inventory/grn/${String(g.id)}`}>
                          View
                        </Link>
                        <button
                          type="button"
                          className="text-xs font-medium underline text-gray-700"
                          onClick={() => downloadPdf(String(g.id), String(g.grnNumber ?? ''))}
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          {!isLoading && !rows.length && (
            <p className="p-8 text-center text-gray-500 text-sm">No GRNs recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
