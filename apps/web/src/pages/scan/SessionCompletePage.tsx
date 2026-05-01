import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/axios.ts';
import { Button } from '../../components/ui/Button.tsx';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

export default function SessionCompletePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [showPartialConfirm, setShowPartialConfirm] = useState(false);
  const [partialReason, setPartialReason] = useState('');

  const { data } = useQuery({
    queryKey: ['session', sessionId, 'complete'],
    queryFn: async () => {
      const r = await api.get(`/sessions/${sessionId}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!sessionId,
  });

  const session = data;

  const closeMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await api.post(`/sessions/${sessionId}/close`, body);
      return r.data.data;
    },
    onSuccess: () => {
      toast.success('Session closed');
      navigate(`/app/sessions/${sessionId}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Close failed';
      toast.error(msg);
    },
  });

  const purchaseOrder = session?.purchaseOrder as Record<string, unknown> | undefined;
  const lineItems = (purchaseOrder?.lineItems as Record<string, unknown>[]) ?? [];

  const incompleteItems = lineItems.filter(
    (li) => (li.loadedBoxes as number) < (li.orderedBoxes as number),
  );

  const completion = useMemo(() => {
    let ordered = 0;
    let loaded = 0;
    for (const li of lineItems) {
      ordered += (li.orderedBoxes as number) ?? 0;
      loaded += (li.loadedBoxes as number) ?? 0;
    }
    const remaining = Math.max(0, ordered - loaded);
    return { ordered, loaded, remaining };
  }, [lineItems]);

  const handleClose = () => {
    if (incompleteItems.length > 0) {
      setShowPartialConfirm(true);
    } else {
      closeMutation.mutate({ notes });
    }
  };

  return (
    <div className="min-h-screen bg-[#0F2044] flex flex-col text-white">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigate('/app/dashboard')}
          className="inline-flex items-center gap-0.5 rounded-lg py-2 pl-2 pr-3 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-6 w-6" />
          <span className="font-medium">Dashboard</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
      {incompleteItems.length === 0 ? (
        <>
          <CheckCircle className="w-24 h-24 text-green-400 mb-6" />
          <h1 className="text-3xl font-black mb-2">ALL ITEMS VERIFIED ✓</h1>
          <p className="text-white/60 mb-8">All boxes have been scanned and accepted</p>
        </>
      ) : (
        <>
          <AlertTriangle className="w-24 h-24 text-amber-400 mb-6" />
          <h1 className="text-2xl font-black mb-2">SESSION INCOMPLETE</h1>
          <p className="text-white/60 mb-4">{incompleteItems.length} item(s) are not fully loaded</p>
          <div className="w-full max-w-sm bg-white/10 rounded-xl p-4 mb-6">
            {incompleteItems.map((li) => (
              <div key={li.lineItemId as string} className="flex justify-between text-sm py-1">
                <span className="text-white/80">
                  {(li.productName as string) ?? 'Product'} — {(li.colourName as string) ?? ''}
                </span>
                <span className="text-amber-400 font-mono">
                  {li.loadedBoxes as number}/{li.orderedBoxes as number}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="w-full max-w-sm bg-white/10 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/60 text-sm">Session completion</span>
          <span className="text-white font-mono text-xs">
            {completion.loaded}/{completion.ordered}
          </span>
        </div>
        <div className="h-[160px]">
          <DonutChart
            data={[
              { label: 'LOADED', value: completion.loaded, color: '#16A34A' },
              { label: 'REMAINING', value: completion.remaining, color: '#2563EB' },
            ]}
            height={160}
            showLegend={true}
          />
        </div>
      </div>

      <div className="w-full max-w-sm bg-white/10 rounded-xl p-4 mb-6 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-white/60">Session Code</span>
          <span className="font-mono">{session?.sessionCode as string}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-white/60">Total Boxes Loaded</span>
          <span className="font-bold">{session?.totalBoxesScanned as number}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-white/60">Scan Errors</span>
          <span className={(session?.errorCount as number) > 0 ? 'text-red-400 font-bold' : 'text-green-400'}>
            {session?.errorCount as number}
          </span>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add dispatch notes (optional)..."
        className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 resize-none mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
        rows={3}
      />

      <Button
        variant="primary"
        size="lg"
        className="max-w-sm w-full"
        loading={closeMutation.isPending}
        onClick={handleClose}
      >
        {incompleteItems.length === 0 ? 'Close & Confirm Dispatch' : 'Close with Partial Dispatch'}
      </Button>

      {showPartialConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-gray-900">
            <h3 className="font-bold text-lg mb-2">Confirm Partial Dispatch</h3>
            <p className="text-sm text-gray-500 mb-4">
              {incompleteItems.length} item(s) will be marked as not dispatched. Provide a reason (min 10 chars).
            </p>
            <textarea
              autoFocus
              value={partialReason}
              onChange={(e) => setPartialReason(e.target.value)}
              placeholder="e.g. Item not available in warehouse"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPartialConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={partialReason.trim().length < 10}
                onClick={() =>
                  closeMutation.mutate({
                    notes,
                    forcePartial: true,
                    partialReason,
                  })
                }
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                Confirm Partial
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
