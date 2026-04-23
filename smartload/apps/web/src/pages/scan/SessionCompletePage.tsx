import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import toast from 'react-hot-toast';

export default function SessionCompletePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => { const r = await api.get(`/api/v1/sessions/${sessionId}`); return r.data.data; },
  });

  const closeMutation = useMutation({
    mutationFn: async ({ notes, forcePartial }: { notes?: string; forcePartial?: boolean }) =>
      api.post(`/api/v1/sessions/${sessionId}/close`, { notes, forcePartial }),
    onSuccess: () => { toast.success('Session closed successfully!'); navigate('/scan'); },
  });

  if (isLoading) return <div className="min-h-screen bg-green-500 flex items-center justify-center"><LoadingSpinner /></div>;

  const lineItems = session?.po?.lineItems || [];
  const underLoaded = lineItems.filter((li: { orderedBoxes: number; loadedBoxes: number }) => li.loadedBoxes < li.orderedBoxes);
  const allComplete = underLoaded.length === 0;

  return (
    <div className={`min-h-screen ${allComplete ? 'bg-green-500' : 'bg-amber-500'} flex flex-col`}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {allComplete
          ? <CheckCircle className="h-28 w-28 text-white mb-6" strokeWidth={1.5} />
          : <AlertTriangle className="h-28 w-28 text-white mb-6" strokeWidth={1.5} />}
        <h1 className="text-4xl font-black text-white text-center">
          {allComplete ? 'ALL ITEMS VERIFIED ✓' : 'PARTIAL LOAD'}
        </h1>
        <p className="text-white/80 text-xl mt-3 text-center">
          {session?.totalBoxesScanned} boxes scanned
        </p>

        {!allComplete && (
          <div className="mt-6 bg-black/20 rounded-xl p-4 w-full max-w-md">
            <p className="text-white font-semibold mb-2">Under-loaded items:</p>
            {underLoaded.map((li: Record<string, unknown>) => (
              <p key={li.id as string} className="text-white/80 text-sm">
                • {(li.variant as Record<string, unknown>)?.colourName as string}: {li.loadedBoxes as number}/{li.orderedBoxes as number} boxes
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 pb-8">
        {session?.status === 'OPEN' && (
          <Button
            className="w-full bg-white text-primary hover:bg-white/90 font-bold text-lg h-14"
            onClick={() => closeMutation.mutate({ forcePartial: !allComplete })}
            loading={closeMutation.isPending}
          >
            {allComplete ? 'Close Session & Dispatch' : 'Close as Partial Dispatch'}
          </Button>
        )}
        <Button variant="ghost" className="w-full mt-3 text-white/70 hover:text-white hover:bg-white/10" onClick={() => navigate('/scan')}>
          Back to Sessions
        </Button>
      </div>
    </div>
  );
}
