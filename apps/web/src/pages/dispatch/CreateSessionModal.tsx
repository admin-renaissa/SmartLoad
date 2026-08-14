import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { POStatus } from '@smartload/shared';
import api from '../../lib/axios.ts';
import { Button } from '../../components/ui/Button.tsx';

interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  status: string;
  client?: { name?: string };
  lineItems?: Array<{ orderedBoxes: number; loadedBoxes: number }>;
}

interface VehicleRow {
  id: string;
  registrationNumber: string;
  type: string;
  driverName: string;
}

interface OperatorRow {
  id: string;
  name: string;
  email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialPoId?: string | null;
}

export function CreateSessionModal({ open, onClose, initialPoId }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState('');
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [notes, setNotes] = useState('');
  const [createdSession, setCreatedSession] = useState<{ id: string; sessionCode: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreatedSession(null);
    setNotes('');
    setVehicleId('');
    setOperatorId('');
    setSearch('');
    if (initialPoId) {
      setSelectedPoId(initialPoId);
      setStep(2);
    } else {
      setSelectedPoId(null);
      setStep(1);
    }
  }, [open, initialPoId]);

  const { data: confirmed = [] } = useQuery({
    queryKey: ['orders-modal', POStatus.CONFIRMED],
    enabled: open && step === 1,
    queryFn: async () => {
      const r = await api.get(`/orders?status=${POStatus.CONFIRMED}&limit=100`);
      return r.data.data as PurchaseOrderRow[];
    },
  });

  const { data: partial = [] } = useQuery({
    queryKey: ['orders-modal', POStatus.PARTIALLY_LOADED],
    enabled: open && step === 1,
    queryFn: async () => {
      const r = await api.get(`/orders?status=${POStatus.PARTIALLY_LOADED}&limit=100`);
      return r.data.data as PurchaseOrderRow[];
    },
  });

  const mergedPos = useMemo(() => {
    const m = new Map<string, PurchaseOrderRow>();
    for (const o of confirmed) m.set(o.id, o);
    for (const o of partial) m.set(o.id, o);
    return [...m.values()].sort((a, b) => b.poNumber.localeCompare(a.poNumber));
  }, [confirmed, partial]);

  const filteredPos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mergedPos;
    return mergedPos.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        (po.client?.name ?? '').toLowerCase().includes(q),
    );
  }, [mergedPos, search]);

  const { data: detailPo } = useQuery({
    queryKey: ['order-detail-modal', selectedPoId],
    enabled:
      open &&
      !!selectedPoId &&
      step >= 2 &&
      !mergedPos.some((p) => p.id === selectedPoId),
    queryFn: async () => {
      const r = await api.get(`/orders/${selectedPoId}`);
      return r.data.data as PurchaseOrderRow;
    },
  });

  const selectedPo = mergedPos.find((p) => p.id === selectedPoId) ?? detailPo ?? null;

  const { data: vehicles = [], isError: vehiclesError } = useQuery({
    queryKey: ['vehicles-available-modal'],
    enabled: open && step === 2,
    queryFn: async () => {
      const r = await api.get('/vehicles/available');
      return r.data.data as VehicleRow[];
    },
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['users-operators-modal'],
    enabled: open && step === 2,
    queryFn: async () => {
      const r = await api.get('/users?limit=200');
      return r.data.data as OperatorRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post('/sessions', {
        poId: selectedPoId,
        vehicleId,
        operatorId: operatorId || undefined,
        notes: notes || undefined,
      });
      return r.data.data as { id: string; sessionCode: string };
    },
    onSuccess: (session) => {
      setCreatedSession(session);
      setStep(3);
      toast.success(`Session ${session.sessionCode} created`);
      void queryClient.invalidateQueries({ queryKey: ['dispatch-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions-active-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-modal'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles-available-modal'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not create session';
      toast.error(msg);
    },
  });

  if (!open) return null;

  const scanUrl =
    typeof window !== 'undefined' && createdSession
      ? `${window.location.origin}/scan/${createdSession.id}`
      : '';

  const totalBoxesPreview = (po: PurchaseOrderRow | null) => {
    if (!po?.lineItems?.length) return 0;
    return po.lineItems.reduce((s, li) => s + Math.max(0, li.orderedBoxes - li.loadedBoxes), 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 1 && 'Select purchase order'}
            {step === 2 && 'Vehicle & operator'}
            {step === 3 && 'Session ready'}
          </h2>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <input
                type="search"
                placeholder="Search PO number or client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {filteredPos.map((po) => (
                  <button
                    key={po.id}
                    type="button"
                    onClick={() => setSelectedPoId(po.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      selectedPoId === po.id ? 'bg-accent/10 border-l-4 border-accent' : ''
                    }`}
                  >
                    <span className="font-mono font-medium">{po.poNumber}</span>
                    <span className="text-gray-500"> · {po.client?.name ?? 'Client'}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {po.lineItems?.length ?? 0} lines · {totalBoxesPreview(po)} boxes to load
                    </span>
                  </button>
                ))}
                {!filteredPos.length && (
                  <p className="p-4 text-sm text-gray-500 text-center">No matching POs</p>
                )}
              </div>
            </>
          )}

          {step === 2 && selectedPo && (
            <>
              <div className="rounded-xl bg-gray-50 p-3 text-sm">
                <p className="font-mono font-semibold">{selectedPo.poNumber}</p>
                <p className="text-gray-600">{selectedPo.client?.name}</p>
                <p className="text-xs text-gray-500 mt-1">{totalBoxesPreview(selectedPo)} boxes remaining to load</p>
              </div>

              {vehiclesError ? (
                <p className="text-sm text-red-600">
                  Could not load vehicles. Register a vehicle under Vehicles.
                </p>
              ) : null}

              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Vehicle</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNumber} · {v.type} · {v.driverName}
                  </option>
                ))}
              </select>
              {!vehicles.length && !vehiclesError && (
                <p className="text-xs text-amber-700">No available vehicles (all may have open sessions).</p>
              )}

              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Operator (optional)</label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Unassigned</option>
                {operators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Optional dispatch notes"
              />
            </>
          )}

          {step === 3 && createdSession && (
            <div className="flex flex-col items-center text-center space-y-4">
              <p className="font-mono text-accent font-bold">{createdSession.sessionCode}</p>
              <p className="text-sm text-gray-600">Scan this QR on the operator tablet to open the scan screen.</p>
              <div className="p-4 bg-white border rounded-xl inline-block">
                <QRCodeSVG value={scanUrl} size={192} level="M" />
              </div>
              <p className="text-xs font-mono text-gray-500 break-all max-w-full">{scanUrl}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(scanUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Open on tablet
              </Button>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!selectedPoId} onClick={() => setStep(2)}>
                Next
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => (initialPoId ? onClose() : setStep(1))}>
                {initialPoId ? 'Cancel' : 'Back'}
              </Button>
              <Button
                loading={createMutation.isPending}
                disabled={!vehicleId || !selectedPoId}
                onClick={() => createMutation.mutate()}
              >
                Create session
              </Button>
            </>
          )}
          {step === 3 && (
            <Button
              onClick={() => {
                onClose();
              }}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
