import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText,
  RefreshCw,
  Send,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { cn } from '../../utils/cn.ts';

type POD = {
  id: string;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  podPdfUrl: string | null;
  session: {
    id: string;
    purchaseOrder: {
      poNumber: string;
      client: { id: string; name: string };
    };
    vehicle: { registrationNumber: string };
  };
};

type Stats = Record<string, number>;

const POD_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'LINK_SENT', label: 'Link sent' },
  { value: 'OTP_VERIFIED', label: 'OTP verified' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'EXPIRED', label: 'Expired' },
];

const statusIcon = (status: string) => {
  switch (status) {
    case 'ACKNOWLEDGED': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'DISPUTED':     return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case 'EXPIRED':      return <XCircle className="h-4 w-4 text-red-400" />;
    default:             return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

export default function PODListPage() {
  const canView = usePermission('pod:view');
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ['pod', 'stats'],
    queryFn: async () => {
      const r = await api.get('/pod/stats');
      return r.data.data as Stats;
    },
    enabled: canView,
    refetchInterval: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['pod', 'list', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const r = await api.get(`/pod?${params}`);
      return {
        pods: r.data.data as POD[],
        meta: r.data.meta as { total: number; page: number; limit: number },
      };
    },
    enabled: canView,
  });

  const resendMut = useMutation({
    mutationFn: async (podId: string) => api.post(`/pod/${podId}/resend-link`),
    onSuccess: () => toast.success('POD link resent'),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Resend failed';
      toast.error(msg);
    },
  });

  if (!canView) {
    return (
      <div>
        <PageHeader title="Proof of Delivery" />
        <p className="text-gray-500">You do not have access to this page.</p>
      </div>
    );
  }

  const totalPages = Math.ceil((data?.meta.total ?? 0) / 20);

  const statBadge = (label: string, value: number, color: string) => (
    <div key={label} className={cn('rounded-xl px-4 py-3 text-center', color)}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proof of Delivery"
        subtitle="Digital acknowledgement records for all dispatched orders"
        actions={
          <Button
            type="button"
            variant="outline"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => qc.invalidateQueries({ queryKey: ['pod'] })}
          >
            Refresh
          </Button>
        }
      />

      {/* Status summary chips */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statBadge('Link sent',    stats.LINK_SENT    ?? 0, 'bg-blue-50 text-blue-800')}
          {statBadge('OTP verified', stats.OTP_VERIFIED ?? 0, 'bg-indigo-50 text-indigo-800')}
          {statBadge('Acknowledged', stats.ACKNOWLEDGED ?? 0, 'bg-green-50 text-green-800')}
          {statBadge('Disputed',     stats.DISPUTED     ?? 0, 'bg-amber-50 text-amber-800')}
          {statBadge('Expired',      stats.EXPIRED      ?? 0, 'bg-red-50 text-red-700')}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-500" />
              POD records
              {data?.meta.total !== undefined && (
                <span className="text-sm font-normal text-gray-500 ml-1">({data.meta.total} total)</span>
              )}
            </CardTitle>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {POD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : !data?.pods.length ? (
            <p className="text-sm text-gray-500 text-center py-12">
              No POD records found. Close a dispatch session to generate a POD link.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[700px] text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="py-2 pr-3 font-medium">Created</th>
                      <th className="py-2 pr-3 font-medium">PO / Client</th>
                      <th className="py-2 pr-3 font-medium">Vehicle</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Acknowledged</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.pods.map((pod) => (
                      <tr key={pod.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 pr-3 text-gray-500 whitespace-nowrap">
                          {new Date(pod.createdAt).toLocaleString('en-IN', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-medium text-gray-900">{pod.session.purchaseOrder.poNumber}</p>
                          <p className="text-xs text-gray-500">{pod.session.purchaseOrder.client.name}</p>
                        </td>
                        <td className="py-3 pr-3 text-gray-600">
                          {pod.session.vehicle.registrationNumber}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-1.5">
                            {statusIcon(pod.status)}
                            <StatusBadge status={pod.status} />
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-gray-500 text-xs whitespace-nowrap">
                          {pod.acknowledgedAt
                            ? new Date(pod.acknowledgedAt).toLocaleString('en-IN', {
                                month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                          {pod.receiverName && (
                            <span className="block text-gray-400">{pod.receiverName}</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/app/sessions/${pod.session.id}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                              title="View session"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                            {pod.podPdfUrl && (
                              <a
                                href={pod.podPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Download PDF"
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            )}
                            {pod.status !== 'ACKNOWLEDGED' && pod.status !== 'DISPUTED' && (
                              <button
                                type="button"
                                title="Resend link"
                                disabled={resendMut.isPending && resendMut.variables === pod.id}
                                onClick={() => resendMut.mutate(pod.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages} · {data.meta.total} records
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
