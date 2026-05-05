import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RefreshCw, Server, MessageSquare, KeyRound, Mail, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { DonutChart } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { cn } from '../../utils/cn.ts';

type TallyStatus = {
  bridgeConnected: boolean;
  tallyConnected: boolean;
  lastSyncAt: string | null;
};

type NotifState = { state: 'mock' | 'live' | 'misconfigured'; detail?: string };
type NotifStatus = { forceMock: boolean; channels: { sms: NotifState; whatsapp: NotifState; email: NotifState } };

type TallyJob = {
  id: string;
  direction: 'PULL' | 'PUSH';
  dataType: string;
  status: string;
  referenceId: string | null;
  tallyVoucherId: string | null;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
};

const statePill = (n: NotifState) => {
  const color =
    n.state === 'live'
      ? 'bg-green-100 text-green-800'
      : n.state === 'misconfigured'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-gray-100 text-gray-700';
  const label = n.state === 'live' ? 'Live' : n.state === 'misconfigured' ? 'Misconfigured' : 'Mock';
  return <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium', color)}>{label}</span>;
};

export default function TallySyncPage() {
  const canView = usePermission('tally:view');
  const qc = useQueryClient();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pushSessionId, setPushSessionId] = useState('');

  const { data: tallyStatus, isLoading: tl } = useQuery({
    queryKey: ['tally', 'status'],
    queryFn: async () => {
      const r = await api.get('/tally/status');
      return r.data.data as TallyStatus;
    },
    enabled: canView,
  });

  const { data: notifStatus, isLoading: ni } = useQuery({
    queryKey: ['integrations', 'notifications'],
    queryFn: async () => {
      const r = await api.get('/integrations/notifications');
      return r.data.data as NotifStatus;
    },
    enabled: canView,
  });

  const { data: syncLog, isLoading: sl } = useQuery({
    queryKey: ['tally', 'sync-log'],
    queryFn: async () => {
      const r = await api.get('/tally/sync-log?limit=25&page=1');
      return { items: r.data.data as TallyJob[], meta: r.data.meta as { total: number; page: number; limit: number } };
    },
    enabled: canView,
  });

  const retryMut = useMutation({
    mutationFn: async (jobId: string) => api.post(`/tally/sync/retry/${jobId}`),
    onSuccess: async () => {
      toast.success('Job re-queued');
      await qc.invalidateQueries({ queryKey: ['tally', 'sync-log'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Retry failed';
      toast.error(msg);
    },
  });

  const run = async (key: string, path: string) => {
    setActionKey(key);
    setMessage(null);
    try {
      const r = await api.post(path);
      setMessage({ type: 'ok', text: (r.data as { data?: { message?: string } }).data?.message ?? 'Done' });
      await qc.invalidateQueries({ queryKey: ['tally'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setMessage({
        type: 'err',
        text: err.response?.data?.error || err.response?.data?.message || err.message || 'Request failed',
      });
    } finally {
      setActionKey(null);
    }
  };

  const rowJobs = syncLog?.items ?? [];

  const jobStatusSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of rowJobs) {
      const st = String(j.status ?? 'UNKNOWN');
      counts.set(st, (counts.get(st) || 0) + 1);
    }

    const palette: Record<string, string> = {
      COMPLETED: '#16A34A',
      FAILED: '#DC2626',
      PERMANENTLY_FAILED: '#B91C1C',
      RETRYING: '#F59E0B',
    };

    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, color: palette[label] }))
      .sort((a, b) => b.value - a.value);
  }, [rowJobs]);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Tally & integrations" />
        <p className="text-gray-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tally & integrations"
        subtitle="Bridge health, Tally pull/push, and customer notification channel status"
        actions={
          <Button
            type="button"
            variant="outline"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['tally'] });
              qc.invalidateQueries({ queryKey: ['integrations'] });
            }}
          >
            Refresh
          </Button>
        }
      />

      {message && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
          )}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tally job status</CardTitle>
          <p className="text-sm text-gray-500 font-normal">Distribution from the latest sync log</p>
        </CardHeader>
        <CardContent>
          <DonutChart data={jobStatusSlices} height={230} showLegend />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-gray-500" />
              <CardTitle>Tally bridge</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tl ? (
              <LoadingSpinner className="mx-auto" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <span className="text-gray-500">API bridge</span>
                  {tallyStatus?.bridgeConnected ? (
                    <StatusBadge status="COMPLETED" />
                  ) : (
                    <StatusBadge status="FAILED" />
                  )}
                  <span className="text-gray-500 ml-2">Tally on host</span>
                  {tallyStatus?.tallyConnected ? <StatusBadge status="COMPLETED" /> : <StatusBadge status="PENDING" />}
                </div>
                <p className="text-sm text-gray-600">
                  Last sync:{' '}
                  {tallyStatus?.lastSyncAt
                    ? new Date(tallyStatus.lastSyncAt).toLocaleString('en-IN')
                    : '—'}
                </p>
                <p className="text-xs text-gray-500">
                  Configure TALLY_BRIDGE_URL and TALLY_BRIDGE_SECRET on the API host. The bridge process must be running on
                  the machine that can reach Tally.
                </p>
              </>
            )}

            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                loading={actionKey === 'pull-stock'}
                onClick={() => run('pull-stock', '/tally/sync/pull-stock')}
              >
                Pull stock
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={actionKey === 'pull-parties'}
                onClick={() => run('pull-parties', '/tally/sync/pull-parties')}
              >
                Pull parties
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={actionKey === 'pull-orders'}
                onClick={() => run('pull-orders', '/tally/sync/pull-orders')}
              >
                Pull orders
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-500 mb-1">Session ID (CUID) to push to Tally</label>
                <input
                  type="text"
                  value={pushSessionId}
                  onChange={(e) => setPushSessionId(e.target.value)}
                  placeholder="cuid of closed dispatch session"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!pushSessionId.trim()}
                loading={actionKey === 'push'}
                onClick={() => run('push', `/tally/sync/push/${pushSessionId.trim()}`)}
              >
                Queue push
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-gray-500" />
              <CardTitle>Customer notifications (SMS, WhatsApp, email)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {ni || !notifStatus ? (
              <LoadingSpinner className="mx-auto" />
            ) : (
              <>
                {notifStatus.forceMock && (
                  <p className="text-sm flex items-center gap-2 text-amber-800 bg-amber-50 rounded-md px-3 py-2">
                    <KeyRound className="h-4 w-4 shrink-0" />
                    NOTIFICATIONS_FORCE_MOCK is on — all channels use log-only delivery.
                  </p>
                )}
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-gray-600">SMS (MSG91)</span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.sms)}
                      {notifStatus.channels.sms.detail && (
                        <p className="text-xs text-gray-500 mt-1">{notifStatus.channels.sms.detail}</p>
                      )}
                    </div>
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-gray-600">WhatsApp (WATI)</span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.whatsapp)}
                      {notifStatus.channels.whatsapp.detail && (
                        <p className="text-xs text-gray-500 mt-1">{notifStatus.channels.whatsapp.detail}</p>
                      )}
                    </div>
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-gray-600 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> Email (SMTP)
                    </span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.email)}
                      {notifStatus.channels.email.detail && (
                        <p className="text-xs text-gray-500 mt-1">{notifStatus.channels.email.detail}</p>
                      )}
                    </div>
                  </li>
                </ul>
                <p className="text-xs text-gray-500 flex gap-1.5 items-start">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  Misconfigured means credentials are partial — fix env before expecting live sends. See <code className="text-gray-700">.env.example</code> on
                  the API.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Tally sync log
            <Link to="/app/reports" className="text-sm font-normal text-accent hover:underline">
              Full reports
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sl ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : rowJobs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No jobs yet. Run a pull or close a session to enqueue sync work.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[640px] text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="py-2 pr-2 font-medium">When</th>
                    <th className="py-2 pr-2 font-medium">Dir</th>
                    <th className="py-2 pr-2 font-medium">Type</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 pr-2 font-medium">Note</th>
                    <th className="py-2 font-medium w-24">Retry</th>
                  </tr>
                </thead>
                <tbody>
                  {rowJobs.map((j) => (
                    <tr key={j.id} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">
                        {new Date(j.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 pr-2">
                        <StatusBadge status={j.direction} />
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{j.dataType}</td>
                      <td className="py-2 pr-2">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="py-2 pr-2 text-gray-500 text-xs max-w-xs truncate" title={j.errorMessage || j.tallyVoucherId || j.referenceId || ''}>
                        {j.errorMessage || j.tallyVoucherId || j.referenceId || '—'}
                      </td>
                      <td className="py-2">
                        {(['FAILED', 'PERMANENTLY_FAILED', 'COMPLETED'] as const).some((st) => st === j.status) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            loading={retryMut.isPending && retryMut.variables === j.id}
                            onClick={() => retryMut.mutate(j.id)}
                          >
                            {j.status === 'COMPLETED' ? 'Re-run' : 'Retry'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
