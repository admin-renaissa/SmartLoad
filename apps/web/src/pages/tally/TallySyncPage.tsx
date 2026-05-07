import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RefreshCw, Server, MessageSquare, KeyRound, Mail, AlertTriangle, Database, Activity } from 'lucide-react';
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
      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
      : n.state === 'misconfigured'
        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
        : 'bg-surface text-text-secondary border border-border';
  const label = n.state === 'live' ? 'Live' : n.state === 'misconfigured' ? 'Misconfigured' : 'Mock';
  return <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider', color)}>{label}</span>;
};

export default function TallySyncPage() {
  const canView = usePermission('tally:view');
  const qc = useQueryClient();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pushSessionId, setPushSessionId] = useState('');
  const [pushGrnId, setPushGrnId] = useState('');

  const { data: tallyStatus, isLoading: tl } = useQuery({
    queryKey: ['tally', 'status'],
    queryFn: async () => {
      const r = await api.get('/tally/status');
      return r.data.data as TallyStatus;
    },
    enabled: canView,
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
  });

  const { data: configSnapshot } = useQuery({
    queryKey: ['tally', 'config-snapshot'],
    queryFn: async () => {
      const r = await api.get('/tally/config-snapshot');
      return r.data.data as Record<string, { pulledAt?: string; count?: number } | null>;
    },
    enabled: canView,
    refetchInterval: 60_000,
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
      <div className="space-y-4">
        <PageHeader title="Tally & integrations" />
        <p className="text-sm text-text-secondary italic opacity-60">You do not have access to this page.</p>
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
            'rounded-lg px-4 py-3 text-sm font-medium border shadow-sm',
            message.type === 'ok' 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
              : 'bg-red-500/10 text-red-500 border-red-500/20',
          )}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="text-text-primary">Tally job status</CardTitle>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60 mt-0.5">Distribution from the latest sync log</p>
        </CardHeader>
        <CardContent>
          <DonutChart data={jobStatusSlices} height={230} showLegend />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="bg-surface/30 border-b border-border">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-text-secondary opacity-40" />
              <CardTitle>Tally bridge</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tl ? (
              <LoadingSpinner className="mx-auto" />
            ) : (
              <>
                <div className="flex flex-wrap gap-4 items-center text-xs font-bold uppercase tracking-tighter">
                  <span className="text-text-secondary opacity-60">API bridge</span>
                  {tallyStatus?.bridgeConnected ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <StatusBadge status="COMPLETED" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      <StatusBadge status="FAILED" />
                    </span>
                  )}
                  <span className="text-text-secondary opacity-60 ml-2">Tally on host</span>
                  {tallyStatus?.tallyConnected ? <StatusBadge status="COMPLETED" /> : <StatusBadge status="PENDING" />}
                </div>
                <p className="text-sm text-text-primary font-medium">
                  Last sync:{' '}
                  <span className="text-accent">
                    {tallyStatus?.lastSyncAt
                      ? new Date(tallyStatus.lastSyncAt).toLocaleString('en-IN')
                      : '—'}
                  </span>
                </p>
                <div className="bg-surface border border-border p-3 rounded-lg text-[10px] font-mono space-y-1.5 shadow-inner">
                  <div className="flex justify-between border-b border-border/50 pb-1">
                    <span className="text-text-secondary uppercase tracking-widest opacity-60">Stock Snapshot:</span>
                    <span className="text-text-primary font-bold">{configSnapshot?.stock?.pulledAt ? new Date(configSnapshot.stock.pulledAt).toLocaleTimeString() : '—'} ({configSnapshot?.stock?.count ?? 0})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary uppercase tracking-widest opacity-60">Parties Snapshot:</span>
                    <span className="text-text-primary font-bold">{configSnapshot?.parties?.pulledAt ? new Date(configSnapshot.parties.pulledAt).toLocaleTimeString() : '—'} ({configSnapshot?.parties?.count ?? 0})</span>
                  </div>
                </div>
                <p className="text-[10px] text-text-secondary italic opacity-60 leading-relaxed">
                  Configure <code className="text-accent font-bold">TALLY_BRIDGE_URL</code> and <code className="text-accent font-bold">TALLY_BRIDGE_SECRET</code> on the API host.
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
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">Session ID (CUID) to push</label>
                  <input
                    type="text"
                    value={pushSessionId}
                    onChange={(e) => setPushSessionId(e.target.value)}
                    placeholder="cuid of closed dispatch session"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
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
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">GRN ID to push</label>
                  <input
                    type="text"
                    value={pushGrnId}
                    onChange={(e) => setPushGrnId(e.target.value)}
                    placeholder="grn identifier"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!pushGrnId.trim()}
                  loading={actionKey === 'push-grn'}
                  onClick={() => run('push-grn', `/tally/sync/push-grn/${pushGrnId.trim()}`)}
                >
                  Queue GRN
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-surface/30 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-text-secondary opacity-40" />
              <CardTitle>Customer notifications</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {ni || !notifStatus ? (
              <LoadingSpinner className="mx-auto" />
            ) : (
              <>
                 {notifStatus.forceMock && (
                  <p className="text-xs font-bold flex items-center gap-2 text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 uppercase tracking-tight">
                    <KeyRound className="h-4 w-4 shrink-0" />
                    FORCE_MOCK is on — delivery is log-only.
                  </p>
                )}
                 <ul className="space-y-4 text-sm">
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-text-primary font-medium">SMS (MSG91)</span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.sms)}
                      {notifStatus.channels.sms.detail && (
                        <p className="text-[10px] text-text-secondary mt-1 font-mono italic opacity-60 break-all leading-tight">{notifStatus.channels.sms.detail}</p>
                      )}
                    </div>
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-text-primary font-medium">WhatsApp (WATI)</span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.whatsapp)}
                      {notifStatus.channels.whatsapp.detail && (
                        <p className="text-[10px] text-text-secondary mt-1 font-mono italic opacity-60 break-all leading-tight">{notifStatus.channels.whatsapp.detail}</p>
                      )}
                    </div>
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span className="text-text-primary font-medium flex items-center gap-1.5">
                      <Mail className="h-4 w-4 opacity-40" /> Email (SMTP)
                    </span>
                    <div className="text-right max-w-[65%]">
                      {statePill(notifStatus.channels.email)}
                      {notifStatus.channels.email.detail && (
                        <p className="text-[10px] text-text-secondary mt-1 font-mono italic opacity-60 break-all leading-tight">{notifStatus.channels.email.detail}</p>
                      )}
                    </div>
                  </li>
                </ul>
                <p className="text-[10px] text-text-secondary flex gap-2 items-start italic opacity-60 leading-relaxed border-t border-border pt-4 mt-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  Misconfigured means credentials are partial. See <code className="text-accent font-bold">.env.example</code> on the API.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="flex items-center justify-between text-text-primary">
            Tally sync log
            <Link to="/app/reports" className="text-xs font-bold text-accent uppercase tracking-widest hover:underline">
              Full reports →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sl ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : rowJobs.length === 0 ? (
            <div className="py-20 text-center">
              <Database className="h-12 w-12 text-border mx-auto mb-4 opacity-20" />
              <p className="text-text-primary font-bold">No sync jobs yet</p>
              <p className="text-text-secondary text-xs mt-1 italic opacity-60">Run a pull or close a session to enqueue sync work.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
               <table className="w-full min-w-[640px] text-sm text-left">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold text-text-secondary uppercase tracking-widest bg-surface/50">
                    <th className="px-4 py-4 font-bold">When</th>
                    <th className="px-4 py-4 font-bold">Dir</th>
                    <th className="px-4 py-4 font-bold">Type</th>
                    <th className="px-4 py-4 font-bold">Status</th>
                    <th className="px-4 py-4 font-bold">Note</th>
                    <th className="px-4 py-4 font-bold w-24">Retry</th>
                  </tr>
                </thead>
                <tbody>
                   {rowJobs.map((j) => (
                    <tr key={j.id} className="border-b border-border hover:bg-surface/50 transition-colors group">
                      <td className="px-4 py-4 text-[10px] font-bold text-text-secondary whitespace-nowrap uppercase tracking-tighter opacity-80">
                        {new Date(j.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={j.direction} />
                      </td>
                      <td className="px-4 py-4 font-mono text-[10px] font-black text-text-primary opacity-60 group-hover:opacity-100 transition-opacity">{j.dataType}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="px-4 py-4 text-text-secondary text-[10px] italic opacity-40 max-w-xs truncate font-mono" title={j.errorMessage || j.tallyVoucherId || j.referenceId || ''}>
                        {j.errorMessage || j.tallyVoucherId || j.referenceId || '—'}
                      </td>
                      <td className="px-4 py-4">
                        {(['FAILED', 'PERMANENTLY_FAILED', 'COMPLETED'] as const).some((st) => st === j.status) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-[10px] font-black uppercase tracking-widest"
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
