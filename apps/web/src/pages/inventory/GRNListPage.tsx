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
            className="border border-border rounded-lg px-3 py-2 text-sm flex-1 min-w-[140px] bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="date"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
            value={df}
            onChange={(e) => setDf(e.target.value)}
          />
          <span className="self-center text-text-secondary">→</span>
          <input
            type="date"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
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
              <thead className="bg-surface text-left text-[10px] text-text-secondary uppercase font-bold tracking-widest">
                <tr>
                  <th className="p-4">GRN Number</th>
                  <th className="p-4">Received</th>
                  <th className="p-4">Items</th>
                  <th className="p-4 text-right">Total Boxes</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id as string} className="border-t border-border hover:bg-surface/50 transition-colors">
                    <td className="p-4">
                      <Link
                        to={`/app/inventory/grn/${String(g.id)}`}
                        className="font-mono text-accent font-black hover:underline"
                      >
                        {(g.grnNumber as string) ?? ''}
                      </Link>
                    </td>
                    <td className="p-4 text-text-secondary">
                      {(g.receivedDate as string) ?
                        new Date(g.receivedDate as string).toLocaleDateString('en-IN')
                      : ''}
                    </td>
                    <td className="p-4 text-text-primary">
                      <span className="bg-surface border border-border px-2 py-0.5 rounded text-xs font-bold">
                        {(g._count as { lineItems?: number })?.lineItems ?? '0'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black text-text-primary">{(g.totalBoxes as number) ?? 0}</td>
                    <td className="p-4 text-text-secondary font-medium">{(g.createdBy as { name?: string })?.name ?? '—'}</td>
                    <td className="p-4">
                      <div className="flex gap-4 items-center">
                        <Link className="text-accent text-xs font-black uppercase tracking-tighter" to={`/app/inventory/grn/${String(g.id)}`}>
                          View
                        </Link>
                        <button
                          type="button"
                          className="text-[10px] font-bold uppercase tracking-tighter text-text-secondary hover:text-text-primary transition-colors"
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
            <p className="p-12 text-center text-text-secondary text-sm italic">No GRNs recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
