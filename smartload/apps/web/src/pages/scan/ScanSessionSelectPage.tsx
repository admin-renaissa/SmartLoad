import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.ts';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Button } from '../../components/ui/Button.tsx';
import api from '../../lib/axios.ts';

export default function ScanSessionSelectPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: async () => {
      const r = await api.get('/api/v1/sessions/active');
      return r.data.data;
    },
    refetchInterval: 10000,
  });

  const mySessions = (sessions || []).filter((s: Record<string, unknown>) =>
    s.operatorId === user?.id || s.supervisorId === user?.id,
  );

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Truck className="h-8 w-8 text-white" />
          <div>
            <h1 className="text-2xl font-bold text-white">Active Sessions</h1>
            <p className="text-white/60 text-sm">Select a session to start scanning</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : mySessions.length === 0 ? (
          <div className="text-center py-20">
            <Truck className="h-16 w-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">No active sessions</p>
            <p className="text-white/40 text-sm mt-1">Ask your supervisor to create a dispatch session</p>
          </div>
        ) : (
          <div className="grid gap-4 max-w-2xl mx-auto">
            {mySessions.map((session: Record<string, unknown>) => {
              const po = session.po as Record<string, unknown>;
              const vehicle = session.vehicle as Record<string, unknown>;
              const client = po?.client as Record<string, unknown>;
              return (
                <div
                  key={session.id as string}
                  className="bg-white/10 backdrop-blur rounded-xl p-6 cursor-pointer hover:bg-white/15 transition"
                  onClick={() => navigate(`/scan/${session.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-white text-2xl font-black font-mono tracking-wider">
                        {vehicle?.registrationNumber as string}
                      </p>
                      <p className="text-white/70 text-sm mt-0.5">{client?.name as string}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/60 text-sm font-mono">{session.sessionCode as string}</p>
                      <p className="text-white/50 text-xs mt-0.5">{po?.poNumber as string}</p>
                    </div>
                  </div>
                  <ProgressBar
                    value={session.totalBoxesScanned as number}
                    max={session.totalBoxesExpected as number}
                    size="lg"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-white/70 text-sm">
                      {session.totalBoxesScanned as number} / {session.totalBoxesExpected as number} boxes scanned
                    </span>
                    <Button
                      size="sm"
                      className="bg-white text-primary hover:bg-white/90"
                      onClick={(e) => { e.stopPropagation(); navigate(`/scan/${session.id}`); }}
                    >
                      Enter Session →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
