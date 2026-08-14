import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MovementType } from '@smartload/shared';
import { Button } from '../../components/ui/Button.tsx';
import { useVariantLedger, useAdjustStock } from '../../hooks/useInventory.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import type { LedgerQueryParams } from '../../hooks/useInventory.ts';

function refHref(entry: Record<string, unknown>): string | null {
  const t = entry.referenceType as string;
  const id = entry.referenceId as string;
  if (t === 'GRN') return `/app/inventory/grn/${id}`;
  if (t === 'DISPATCH_SESSION') return `/app/sessions/${id}`;
  return null;
}

export function VariantLedgerDrawer({
  variantId,
  open,
  onClose,
}: {
  variantId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const canAdjust = usePermission('inventory:adjust');
  const [ledgerQuery, setLedgerQuery] = useState<LedgerQueryParams>({
    page: 1,
    limit: 25,
  });
  const [boxes, setBoxes] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isFetching } = useVariantLedger(variantId ?? undefined, ledgerQuery);
  const adjustMut = useAdjustStock(variantId ?? undefined);

  useEffect(() => {
    if (!open) return;
    setLedgerQuery({ page: 1, limit: 25 });
    setBoxes(0);
    setReason('');
    setNotes('');
  }, [open, variantId]);

  if (!variantId || !open) return null;

  const v = data?.ledger?.variant as Record<string, unknown> | undefined;
  const product = v?.product as Record<string, unknown> | undefined;
  const cs = data?.ledger?.currentStock as Record<string, unknown> | undefined;
  const entries = (data?.ledger?.entries as Record<string, unknown>[]) ?? [];
  const meta = data?.meta as { page?: number; totalPages?: number; hasNext?: boolean; hasPrev?: boolean } | undefined;

  const total = Number(cs?.totalBoxes ?? 0);
  const reserved = Number(cs?.reservedBoxes ?? 0);
  const available = Number(cs?.availableBoxes ?? 0);

  const newTotalPreview = total + boxes;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full bg-card shadow-2xl flex flex-col animate-in slide-in-from-right border-l border-border">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {(product?.name as string) ?? '—'} — {(v?.colourName as string) ?? ''}{' '}
              <span className="text-text-secondary/50">({(v?.colourCode as string) ?? ''})</span>
            </h2>
            <p className="font-mono text-sm text-accent mt-1">{(product?.sku as string) ?? ''}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface text-text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border bg-surface/30">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-text-secondary uppercase font-bold tracking-tight">Total</p>
              <p className="text-2xl font-bold text-text-primary">{total}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase font-bold tracking-tight">Reserved</p>
              <p className="text-2xl font-bold text-amber-500">{reserved}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase font-bold tracking-tight">Available</p>
              <p className="text-2xl font-bold text-emerald-500">{available}</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${total > 0 ? Math.min(100, (reserved / total) * 100) : 0}%` }}
            />
          </div>
        </div>

        <Tabs.Root defaultValue="history" className="flex-1 flex flex-col min-h-0">
          <Tabs.List className="flex border-b border-border px-4 gap-4">
            <Tabs.Trigger
              value="history"
              className="py-3 text-sm font-medium text-text-secondary data-[state=active]:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all"
            >
              Movement History
            </Tabs.Trigger>
            {canAdjust && (
              <Tabs.Trigger
                value="adjust"
                className="py-3 text-sm font-medium text-text-secondary data-[state=active]:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all"
              >
                Stock Adjustments
              </Tabs.Trigger>
            )}
          </Tabs.List>

          <Tabs.Content value="history" className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <input
                type="date"
                className="border border-border rounded px-2 py-1 bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                onChange={(e) =>
                  setLedgerQuery((q) => ({ ...q, page: 1, dateFrom: e.target.value || undefined }))
                }
              />
              <input
                type="date"
                className="border border-border rounded px-2 py-1 bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                onChange={(e) =>
                  setLedgerQuery((q) => ({ ...q, page: 1, dateTo: e.target.value || undefined }))
                }
              />
              <select
                className="border border-border rounded px-2 py-1 bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                onChange={(e) =>
                  setLedgerQuery((q) => ({
                    ...q,
                    page: 1,
                    type: (e.target.value || undefined) as MovementType | undefined,
                  }))
                }
              >
                <option value="">All types</option>
                {Object.values(MovementType).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {isFetching && <p className="text-text-secondary/50 text-sm italic">Loading movements…</p>}
            {!isFetching && entries.length === 0 && (
              <p className="text-text-secondary/50 text-sm italic">No movements recorded yet</p>
            )}

            <ul className="space-y-2">
              {entries.map((e) => {
                const inward = e.isInward as boolean;
                const href = refHref(e);
                return (
                  <li
                    key={e.id as string}
                    className="flex gap-3 border border-border rounded-lg p-3 bg-surface shadow-sm"
                  >
                    <div
                      className={`w-1 rounded shrink-0 ${inward ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`}
                    />
                    <div className="flex-1 text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-text-secondary text-[11px] font-medium">
                          {e.createdAt ? new Date(e.createdAt as string).toLocaleString('en-IN') : ''}
                        </span>
                        <span className="font-mono text-[10px] bg-card border border-border px-2 py-0.5 rounded text-text-primary uppercase tracking-tighter">
                          {e.movementType as string}
                        </span>
                      </div>
                      <p className={`font-black text-lg ${inward ? 'text-emerald-500' : 'text-red-500'}`}>
                        {inward ? '+' : ''}{e.signedBoxes as string}
                      </p>
                      <p className="text-xs text-text-secondary font-medium">Balance after: <span className="text-text-primary">{String(e.balanceAfter)}</span></p>
                      <p className="text-[11px] text-text-secondary mt-2 flex items-center justify-between">
                        <span>Ref: {href ? <Link to={href} className="text-accent underline font-bold">{(e.referenceType as string) === 'GRN' ? 'GRN' : 'Session'} {(e.referenceId as string).slice(0, 8)}…</Link> : `${e.referenceType as string}`}</span>
                        <span className="italic opacity-60">By {(e.createdBy as { name?: string })?.name ?? '—'}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {meta && meta.totalPages != null && meta.totalPages > 1 && (
              <div className="flex justify-between text-sm pt-2">
                <button
                  type="button"
                  disabled={!meta.hasPrev}
                  className="text-accent disabled:opacity-30"
                  onClick={() => setLedgerQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!meta.hasNext}
                  className="text-accent disabled:opacity-30"
                  onClick={() => setLedgerQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
                >
                  Next
                </button>
              </div>
            )}
          </Tabs.Content>

          {canAdjust && (
            <Tabs.Content value="adjust" className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1 border border-border rounded bg-surface hover:bg-card text-text-primary"
                  onClick={() => setBoxes((b) => b - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  className="border border-border rounded px-3 py-2 w-28 text-center bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                  value={boxes}
                  onChange={(ev) => setBoxes(Number(ev.target.value) || 0)}
                />
                <button
                  type="button"
                  className="px-3 py-1 border border-border rounded bg-surface hover:bg-card text-text-primary"
                  onClick={() => setBoxes((b) => b + 1)}
                >
                  +
                </button>
              </div>
              <p className="text-sm text-text-secondary">
                New total will be: <strong className="text-text-primary font-black">{newTotalPreview}</strong> boxes
              </p>
              {newTotalPreview < 0 && (
                <p className="text-sm text-red-500 font-bold">⚠ Cannot go below zero.</p>
              )}
              {newTotalPreview < reserved && (
                <p className="text-sm text-red-500 font-bold">⚠ Cannot go below reserved ({reserved}).</p>
              )}
              <div>
                <label className="text-sm font-medium text-text-primary">Reason (min 10 chars)</label>
                <textarea
                  className="w-full border border-border rounded-lg mt-1 px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                  rows={2}
                  value={reason}
                  onChange={(ev) => setReason(ev.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-primary">Notes (optional)</label>
                <textarea
                  className="w-full border border-border rounded-lg mt-1 px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                  rows={2}
                  value={notes}
                  onChange={(ev) => setNotes(ev.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  if (reason.trim().length < 10) {
                    toast.error('Reason must be at least 10 characters');
                    return;
                  }
                  if (boxes === 0) {
                    toast.error('Adjustment cannot be zero');
                    return;
                  }
                  setConfirmOpen(true);
                }}
              >
                Apply Adjustment
              </Button>
            </Tabs.Content>
          )}
        </Tabs.Root>
      </div>

      {confirmOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <p className="font-bold text-lg text-text-primary">Confirm adjustment?</p>
            <div className="p-4 bg-surface rounded-lg border border-border">
              <p className="text-sm text-text-secondary">
                {boxes > 0 ? `Adding` : `Removing`} <strong className="text-text-primary font-black">{Math.abs(boxes)}</strong> boxes.
              </p>
              <p className="text-xs text-text-secondary mt-1">New total will be {newTotalPreview}.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={adjustMut.isPending}
                onClick={() => {
                  adjustMut.mutate(
                    { boxes, reason: reason.trim(), notes: notes.trim() || undefined },
                    {
                      onSuccess: () => setConfirmOpen(false),
                    },
                  );
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
