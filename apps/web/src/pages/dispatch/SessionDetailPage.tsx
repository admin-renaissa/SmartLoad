import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserRole } from '@smartload/shared';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { useDownloadChallan, useDownloadManifest } from '../../hooks/useSessions.ts';
import { useAuthStore } from '../../store/authStore.ts';

function formatDuration(openedAt: string, closedAt?: string | null) {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function dimLabel(v: Record<string, unknown>) {
  const L = v.lengthMm as number | undefined;
  const W = v.widthMm as number | undefined;
  const T = v.thicknessMm as number | undefined;
  if (L == null && W == null && T == null) return '—';
  return [L, W, T].map((x) => (x != null ? `${x}` : '—')).join(' × ');
}

export default function SessionDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const canClose = usePermission('sessions:close');
  const canManifest = usePermission('sessions:manifest');
  const canChallan = usePermission('sessions:challan');
  const manifestDl = useDownloadManifest();
  const challanDl = useDownloadChallan();

  const [feedTab, setFeedTab] = useState<'all' | 'errors'>('all');
  const [scanPage, setScanPage] = useState(1);
  const [closeNotes, setCloseNotes] = useState('');
  const [showPartial, setShowPartial] = useState(false);
  const [partialReason, setPartialReason] = useState('');
  const [podPdfLoading, setPodPdfLoading] = useState(false);

  const user = useAuthStore((s) => s.user);
  const canDownloadPodPdf =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.SUPERVISOR ||
    user?.role === UserRole.ACCOUNTS ||
    user?.role === UserRole.CLIENT;

  const { data: session, isLoading } = useQuery({
    queryKey: ['session-detail', id],
    queryFn: async () => {
      const r = await api.get(`/sessions/${id}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: scanPayload } = useQuery({
    queryKey: ['session-scan-log', id, scanPage],
    queryFn: async () => {
      const r = await api.get(`/sessions/${id}/scan-log?page=${scanPage}&limit=25`);
      return r.data as { data: Record<string, unknown>[]; meta: Record<string, unknown> };
    },
    enabled: !!id && feedTab === 'all',
    refetchInterval: 3000,
  });

  const { data: errorEvents } = useQuery({
    queryKey: ['session-errors', id],
    queryFn: async () => {
      const r = await api.get(`/sessions/${id}/errors`);
      return r.data.data as Record<string, unknown>[];
    },
    enabled: !!id && feedTab === 'errors',
    refetchInterval: 3000,
  });

  const po = session?.purchaseOrder as Record<string, unknown> | undefined;
  const poId = po?.id as string | undefined;
  const lineItems = (po?.lineItems as Record<string, unknown>[]) ?? [];

  const completionSlices = useMemo<DonutSlice[]>(() => {
    const lineCount = lineItems.length;
    if (lineCount === 0) return [];

    const completed = lineItems.filter((li) => {
      const ordered = Number(li.orderedBoxes ?? 0);
      const loaded = Number(li.loadedBoxes ?? 0);
      return ordered > 0 && loaded >= ordered;
    }).length;

    const incomplete = Math.max(0, lineCount - completed);

    return [
      { label: 'Completed', value: completed, color: '#059669' },
      { label: 'Incomplete', value: incomplete, color: '#DC2626' },
    ];
  }, [lineItems]);

  const vehicle = session?.vehicle as Record<string, unknown> | undefined;
  const pod = session?.pod as Record<string, unknown> | null | undefined;

  const events = scanPayload?.data ?? [];
  const meta = scanPayload?.meta ?? {};
  const displayEvents = feedTab === 'errors' ? errorEvents ?? [] : events;

  const closeMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await api.post(`/sessions/${id}/close`, body);
      return r.data.data;
    },
    onSuccess: () => {
      toast.success('Session closed');
      setShowPartial(false);
      void queryClient.invalidateQueries({ queryKey: ['session-detail', id] });
      void queryClient.invalidateQueries({ queryKey: ['dispatch-summary'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Close failed';
      toast.error(msg);
    },
  });

  const resendPodMutation = useMutation({
    mutationFn: async (podId: string) => {
      await api.post(`/pod/${podId}/resend-link`);
    },
    onSuccess: () => toast.success('POD link queued'),
    onError: () => toast.error('Could not resend POD'),
  });

  const downloadPodPdf = async (podId: string) => {
    setPodPdfLoading(true);
    try {
      const r = await api.get(`/pod/${podId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `POD-${podId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download POD PDF');
    } finally {
      setPodPdfLoading(false);
    }
  };

  const incompleteCount = lineItems.filter(
    (li) => (li.loadedBoxes as number) < (li.orderedBoxes as number),
  ).length;

  const handleCloseClick = () => {
    if (incompleteCount > 0) {
      setShowPartial(true);
    } else {
      closeMutation.mutate({ notes: closeNotes || undefined });
    }
  };

  if (isLoading || !session) {
    return (
      <div className="p-8 text-center text-gray-500">
        {isLoading ? 'Loading session…' : 'Session not found'}
      </div>
    );
  }

  const status = session.status as string;
  const isOpen = status === 'OPEN';
  const isClosed = status === 'CLOSED';

  const vehicleReg =
    vehicle && typeof vehicle.registrationNumber === 'string' ? vehicle.registrationNumber : 'Vehicle';
  const progressPct = Number(session.progressPercent ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.sessionCode as string}
        subtitle={`Dispatch session · ${vehicleReg}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/app/dispatch">
              <Button variant="outline" size="sm">
                ← Dispatch
              </Button>
            </Link>
            <Link to={`/scan/${id}`}>
              <Button size="sm">Open scan UI</Button>
            </Link>
            {canClose && isOpen && (
              <Button
                variant="danger"
                size="sm"
                loading={closeMutation.isPending}
                onClick={handleCloseClick}
              >
                Close session
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-sm text-gray-500">
          Progress {progressPct}% · {(session.errorCount as number) ?? 0} scan errors
          (recent)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardContent className="space-y-2 text-sm">
              <h3 className="font-semibold text-gray-900">Session</h3>
              <p>
                <span className="text-gray-500">Opened</span>{' '}
                {session.openedAt
                  ? new Date(session.openedAt as string).toLocaleString('en-IN')
                  : '—'}
              </p>
              <p>
                <span className="text-gray-500">Duration</span>{' '}
                {formatDuration(session.openedAt as string, session.closedAt as string | null)}
              </p>
              {session.closedAt != null && session.closedAt !== '' ? (
                <p>
                  <span className="text-gray-500">Closed</span>{' '}
                  {new Date(session.closedAt as string).toLocaleString('en-IN')}
                </p>
              ) : null}
              <p>
                <span className="text-gray-500">Supervisor</span>{' '}
                {(session.supervisor as Record<string, unknown>)?.name as string}
              </p>
              <p>
                <span className="text-gray-500">Operator</span>{' '}
                {((session.operator as Record<string, unknown>)?.name as string) ?? '—'}
              </p>
              <p>
                <span className="text-gray-500">Boxes</span>{' '}
                {(session.totalBoxesScanned as number) ?? 0} / {(session.totalBoxesExpected as number) ?? 0}{' '}
                scanned
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                <div
                  className="h-2 rounded-full bg-accent transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {isOpen && (
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Close notes (optional)"
                  rows={2}
                  className="w-full mt-2 border rounded-lg px-2 py-1 text-xs"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Line item completion</h3>
                <span className="text-xs text-gray-500">{lineItems.length} lines</span>
              </div>
              <DonutChart data={completionSlices} height={190} showLegend={false} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 text-sm">
              <h3 className="font-semibold text-gray-900">Vehicle</h3>
              <p className="text-xl font-bold tracking-wide">{vehicle?.registrationNumber as string}</p>
              <p className="text-gray-600">{vehicle?.type as string}</p>
              <p>
                {vehicle?.driverName as string} · {vehicle?.driverPhone as string}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 text-sm">
              <h3 className="font-semibold text-gray-900">Purchase order</h3>
              {poId && (
                <Link to={`/app/orders/${poId}`} className="font-mono text-accent hover:underline">
                  {po?.poNumber as string}
                </Link>
              )}
              <p>{(po?.client as Record<string, unknown>)?.name as string}</p>
            </CardContent>
          </Card>

          {pod?.id ? (
            <Card>
              <CardContent className="space-y-2 text-sm">
                <h3 className="font-semibold text-gray-900">Proof of delivery</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={String(pod.status)} />
                  {pod.acknowledgedAt != null ? (
                    <span className="text-xs text-gray-500">
                      Acknowledged{' '}
                      {new Date(String(pod.acknowledgedAt)).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  ) : null}
                </div>
                {pod.receiverName ? (
                  <p className="text-gray-600">
                    <span className="text-gray-500">Receiver</span> {pod.receiverName as string}
                  </p>
                ) : null}
                {pod.discrepancyNotes ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-md p-2">
                    {pod.discrepancyNotes as string}
                  </p>
                ) : null}
                {pod.podPdfUrl ? (
                  <p className="text-xs text-gray-500">Signed POD PDF is on file.</p>
                ) : null}
                <div className="flex flex-col gap-2 pt-1">
                  {canDownloadPodPdf && !isOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      loading={podPdfLoading}
                      onClick={() => void downloadPodPdf(pod.id as string)}
                    >
                      Download POD (PDF)
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm">Actions</h3>
              {canManifest ?
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  loading={manifestDl.isPending}
                  onClick={() =>
                    manifestDl.mutate({
                      sessionId: id,
                      sessionCode: typeof session.sessionCode === 'string' ? session.sessionCode : undefined,
                    })
                  }
                >
                  Download manifest (PDF)
                </Button>
              : null}
              {canChallan ?
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!isClosed || challanDl.isPending}
                  loading={challanDl.isPending}
                  title={!isClosed ? 'Available after session is closed' : undefined}
                  onClick={() =>
                    challanDl.mutate({
                      sessionId: id,
                      sessionCode: typeof session.sessionCode === 'string' ? session.sessionCode : undefined,
                    })
                  }
                >
                  Download challan
                </Button>
              : null}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!pod?.id || isOpen}
                loading={resendPodMutation.isPending}
                onClick={() => pod?.id && resendPodMutation.mutate(pod.id as string)}
              >
                Resend POD link
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-left text-gray-500">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Colour</th>
                    <th className="p-3">Dimensions (mm)</th>
                    <th className="p-3">Ordered</th>
                    <th className="p-3">Loaded</th>
                    <th className="p-3">Remaining</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li) => {
                    const variant = li.variant as Record<string, unknown>;
                    const ordered = li.orderedBoxes as number;
                    const loaded = li.loadedBoxes as number;
                    const remaining = ordered - loaded;
                    const rowClass =
                      loaded >= ordered ? 'bg-green-50/80' : loaded > 0 ? 'bg-amber-50/80' : '';

                    return (
                      <tr key={li.id as string} className={rowClass}>
                        <td className="p-3 font-medium">
                          {(variant?.product as Record<string, unknown>)?.name as string}
                        </td>
                        <td className="p-3">{variant?.colourName as string}</td>
                        <td className="p-3 font-mono text-xs">{dimLabel(variant)}</td>
                        <td className="p-3">{ordered}</td>
                        <td className="p-3">{loaded}</td>
                        <td className="p-3">{remaining}</td>
                        <td className="p-3">
                          {loaded >= ordered ? (
                            <span className="text-green-700 text-xs font-semibold">Complete</span>
                          ) : loaded > 0 ? (
                            <span className="text-amber-800 text-xs font-semibold">Partial</span>
                          ) : (
                            <span className="text-gray-500 text-xs">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t text-xs text-gray-500">
                Row colours: green = complete, amber = partial load.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Scan event feed</h3>
                <div className="flex rounded-lg border overflow-hidden text-xs">
                  <button
                    type="button"
                    className={`px-3 py-1 ${feedTab === 'all' ? 'bg-accent text-white' : 'bg-white'}`}
                    onClick={() => setFeedTab('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 ${feedTab === 'errors' ? 'bg-red-600 text-white' : 'bg-white'}`}
                    onClick={() => setFeedTab('errors')}
                  >
                    Errors only
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b text-left text-gray-500">
                    <tr>
                      <th className="p-2">Time</th>
                      <th className="p-2">Barcode</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Operator</th>
                      <th className="p-2">Result</th>
                      <th className="p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayEvents.map((ev) => {
                      const err = ev.result !== 'SUCCESS';
                      return (
                        <tr key={ev.id as string} className={err ? 'bg-red-50' : ''}>
                          <td className="p-2 whitespace-nowrap">
                            {ev.scannedAt
                              ? new Date(ev.scannedAt as string).toLocaleTimeString('en-IN')
                              : '—'}
                          </td>
                          <td className="p-2 font-mono max-w-[140px] truncate">
                            {ev.scannedBarcode as string}
                          </td>
                          <td className="p-2 max-w-[120px] truncate">
                            {(
                              (ev.resolvedVariant as Record<string, unknown>)?.product as Record<
                                string,
                                unknown
                              >
                            )?.name as string}
                          </td>
                          <td className="p-2">
                            {(ev.operator as Record<string, unknown>)?.name as string}
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded-full ${
                                ev.result === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {ev.result as string}
                            </span>
                          </td>
                          <td className="p-2 text-gray-600 max-w-[180px] truncate">
                            {(ev.errorReason as string) ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!displayEvents.length && (
                  <p className="p-6 text-center text-gray-500 text-sm">No events on this page</p>
                )}
              </div>

              <div className="flex justify-between items-center mt-3 text-sm">
                <button
                  type="button"
                  disabled={feedTab !== 'all' || scanPage <= 1}
                  className="text-accent disabled:opacity-40"
                  onClick={() => setScanPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-gray-500">
                  {feedTab === 'all'
                    ? `Page ${scanPage} / ${Math.max(1, Number(meta.totalPages) || 1)}`
                    : `${displayEvents.length} error(s)`}
                </span>
                <button
                  type="button"
                  disabled={feedTab !== 'all' || !meta.hasNext}
                  className="text-accent disabled:opacity-40"
                  onClick={() => setScanPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showPartial && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Partial dispatch</h3>
            <p className="text-sm text-gray-600">
              {incompleteCount} line item(s) are incomplete. Provide a reason (min 10 characters).
            </p>
            <textarea
              value={partialReason}
              onChange={(e) => setPartialReason(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Reason for closing without full load…"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPartial(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={partialReason.trim().length < 10}
                loading={closeMutation.isPending}
                onClick={() =>
                  closeMutation.mutate({
                    notes: closeNotes || undefined,
                    forcePartial: true,
                    partialReason: partialReason.trim(),
                  })
                }
              >
                Close partial
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
