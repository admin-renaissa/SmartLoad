import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoreVertical, PackagePlus, PackageMinus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { cn } from '../../utils/cn.ts';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { useAuthStore } from '../../store/authStore.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';
import {
  useStockSummary,
  useLowStockVariants,
  useInventoryValuation,
  useExportInventory,
  useImportOpeningStock,
  useTransferStock,
  useAdjustStock,
} from '../../hooks/useInventory.ts';
import { VariantLedgerDrawer } from './VariantLedgerDrawer.tsx';

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-surface text-text-primary';
const LABEL_CLS = 'block text-sm font-medium text-text-primary mb-1';

type AdjustDirection = 'add' | 'remove';

function AdjustStockModal({
  variantId,
  variantLabel,
  currentStock,
  onClose,
}: {
  variantId: string;
  variantLabel: string;
  currentStock: { total: number; available: number };
  onClose: () => void;
}) {
  const [boxes, setBoxes] = useState(1);
  const [direction, setDirection] = useState<AdjustDirection>('add');
  const [reason, setReason] = useState('');
  const adjustMut = useAdjustStock(variantId);

  // Backend expects positive boxes for add, negative for remove
  const signedBoxes = direction === 'add' ? boxes : -boxes;

  const reasonOptions = [
    'Opening stock entry',
    'Physical count correction',
    'Damaged / write-off',
    'Return from customer',
    'Found in warehouse',
    'Other',
  ];

  const canSubmit = boxes > 0 && reason.trim().length >= 3;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Adjust Stock</h2>
          <p className="text-sm text-text-secondary mt-0.5 font-mono truncate">{variantLabel}</p>
        </div>

        {/* Current stock summary */}
        <div className="px-6 pt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface p-3 text-center border border-border">
            <p className="text-xs text-text-secondary">Current Total</p>
            <p className="text-xl font-bold text-text-primary">{currentStock.total}</p>
            <p className="text-xs text-text-secondary/50">boxes</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center border border-border">
            <p className="text-xs text-text-secondary">Available</p>
            <p className={`text-xl font-bold ${currentStock.available <= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {currentStock.available}
            </p>
            <p className="text-xs text-text-secondary/50">boxes</p>
          </div>
        </div>

        {/* No stock CTA */}
        {currentStock.total === 0 && (
          <div className="mx-6 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
            No stock available. Use <strong>Add Stock</strong> below to set the opening quantity.
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Direction selector */}
          <div>
            <label className={LABEL_CLS}>Action</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'add', label: 'Add Stock', icon: PackagePlus, color: 'emerald' },
                { id: 'remove', label: 'Remove Stock', icon: PackageMinus, color: 'red' },
              ] as const).map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDirection(id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                    direction === id
                      ? color === 'emerald'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                        : 'border-red-500 bg-red-500/10 text-red-500'
                      : 'border-border text-text-secondary hover:bg-surface',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className={LABEL_CLS}>
              Quantity (boxes) <span className="text-red-500">*</span>
            </label>
            <input
              id="adjust-boxes"
              type="number"
              min={1}
              value={boxes}
              onChange={(e) => setBoxes(Math.max(1, Number(e.target.value)))}
              className={INPUT_CLS}
            />
          </div>

          {/* Reason */}
          <div>
            <label className={LABEL_CLS}>
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              className={INPUT_CLS + ' mb-2'}
              value={reasonOptions.includes(reason) ? reason : 'Other'}
              onChange={(e) => {
                if (e.target.value !== 'Other') setReason(e.target.value);
                else setReason('');
              }}
            >
              {reasonOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
            {(!reasonOptions.slice(0, -1).includes(reason)) && (
              <input
                id="adjust-reason"
                placeholder="Describe the reason…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={INPUT_CLS}
              />
            )}
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-sm">
            <span className="text-blue-500">
              New total after adjustment:{' '}
              <strong className="font-semibold">
                {Math.max(0, currentStock.total + signedBoxes)} boxes
              </strong>
            </span>
          </div>
        </div>

        <div className="p-6 pt-0 flex gap-3 justify-end border-t border-border mt-4 pt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            id="adjust-stock-submit"
            loading={adjustMut.isPending}
            disabled={!canSubmit}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => {
              adjustMut.mutate(
                { boxes: signedBoxes, reason: reason.trim() },
                { onSuccess: () => onClose() },
              );
            }}
          >
            Apply Adjustment
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function StockViewPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canAdjust = usePermission('inventory:adjust');
  const canExport =
    role === 'ADMIN' || role === 'ACCOUNTS' || role === 'SUPERVISOR';
  const canImportOpening = role === 'ADMIN';

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data as { id: string; name: string }[];
    },
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [lowOnly, setLowOnly] = useState(false);
  const [outOnly, setOutOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'productName' | 'availableBoxes'>('productName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const summaryQuery = {
    page,
    limit: 25,
    search: debouncedSearch || undefined,
    categoryId,
    lowStockOnly: lowOnly || undefined,
    outOfStock: outOnly || undefined,
    sortBy,
    sortDir,
  };

  const { data: stockRes, isLoading } = useStockSummary(summaryQuery);
  const stocks = useMemo(() => (stockRes?.data as Record<string, unknown>[]) ?? [], [stockRes]);
  const stockHealthSlices = useMemo(() => {
    let ok = 0;
    let low = 0;
    let out = 0;
    for (const row of stocks) {
      const r = row as Record<string, unknown>;
      const isOut = !!r.isOutOfStock;
      const isLow = !!r.isLowStock && !isOut;
      if (isOut) out++;
      else if (isLow) low++;
      else ok++;
    }

    return [
      { label: 'OK', value: ok, color: '#16A34A' },
      { label: 'LOW', value: low, color: '#F59E0B' },
      { label: 'OUT', value: out, color: '#DC2626' },
    ];
  }, [stocks]);
  const meta = stockRes?.meta as {
    total?: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  } | undefined;

  const { data: lowStock = [] } = useLowStockVariants();
  const { data: valuation } = useInventoryValuation();
  const exportMut = useExportInventory();
  const importMut = useImportOpeningStock();
  const transferMut = useTransferStock();

  const [drawerVariantId, setDrawerVariantId] = useState<string | null>(null);
  const [adjustVariantId, setAdjustVariantId] = useState<string | null>(null);
  const [adjustVariantLabel, setAdjustVariantLabel] = useState('');
  const [adjustCurrentStock, setAdjustCurrentStock] = useState({ total: 0, available: 0 });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferBoxes, setTransferBoxes] = useState(1);
  const [transferReason, setTransferReason] = useState('');

  const lowBannerCount = Array.isArray(lowStock) ? lowStock.length : 0;
  const outCount =
    Array.isArray(lowStock) ?
      lowStock.filter((r) => (r as { isOutOfStock?: boolean }).isOutOfStock).length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Live stock levels across all variants"
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                loading={exportMut.isPending}
                onClick={() => exportMut.mutate()}
              >
                Export Excel
              </Button>
            )}
            {canImportOpening && (
              <label className="inline-flex items-center justify-center rounded-button font-medium text-sm h-8 px-3 border border-border bg-surface text-text-primary hover:bg-card cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) importMut.mutate(f);
                    ev.target.value = '';
                  }}
                />
                {importMut.isPending ? 'Importing…' : 'Import Opening Stock'}
              </label>
            )}
            <Link to="/app/inventory/grn/new">
              <Button size="sm">Receive Goods (GRN)</Button>
            </Link>
            <Link to="/app/inventory/grn">
              <Button variant="outline" size="sm">
                GRN List
              </Button>
            </Link>
          </div>
        }
      />

      {lowBannerCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setLowOnly(true);
            setOutOnly(false);
            setPage(1);
          }}
          className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-500 text-sm font-medium"
        >
          ⚠ {lowBannerCount} items are running low or out of stock — tap to filter
        </button>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-text-secondary block mb-1">Search</label>
          <input
            className="border border-border rounded-lg px-3 py-2 text-sm w-56 bg-surface text-text-primary focus:ring-2 focus:ring-accent/30 outline-none"
            placeholder="Product, SKU, colour…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Category</label>
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:ring-2 focus:ring-accent/30 outline-none"
            value={categoryId ?? ''}
            onChange={(e) => {
              setCategoryId(e.target.value || undefined);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['All', 'Low Stock', 'Out of Stock'] as const).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPage(1);
                if (label === 'All') {
                  setLowOnly(false);
                  setOutOnly(false);
                } else if (label === 'Low Stock') {
                  setLowOnly(true);
                  setOutOnly(false);
                } else {
                  setLowOnly(false);
                  setOutOnly(true);
                }
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border',
                (label === 'All' && !lowOnly && !outOnly) ||
                  (label === 'Low Stock' && lowOnly && !outOnly) ||
                  (label === 'Out of Stock' && outOnly)
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-text-secondary border-border hover:bg-card',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Sort</label>
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:ring-2 focus:ring-accent/30 outline-none"
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [sb, sd] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
              setSortBy(sb);
              setSortDir(sd);
            }}
          >
            <option value="productName-asc">Name A–Z</option>
            <option value="productName-desc">Name Z–A</option>
            <option value="availableBoxes-desc">Available (high)</option>
            <option value="availableBoxes-asc">Available (low)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Variants', value: meta?.total ?? '—' },
          { label: 'Available Boxes', value: (valuation?.grandTotalBoxes as number) ?? '—' },
          { label: 'Low Stock Items', value: Math.max(0, lowBannerCount - outCount) },
          { label: 'Out of Stock', value: outCount },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-text-secondary">{c.label}</p>
              <p className="text-2xl font-bold text-text-primary">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-border">
          <p className="text-sm font-medium text-text-primary">Stock health</p>
          <p className="text-xs text-text-secondary mt-0.5">OK vs LOW vs OUT based on current page filters</p>
        </div>
        <div className="p-4">
          <DonutChart data={stockHealthSlices} height={220} showLegend />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ?
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          : <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface text-text-secondary text-xs uppercase">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Colour</th>
                    <th className="p-3">Dimensions</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Reserved</th>
                    <th className="p-3 text-right">Available</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((row) => {
                    const r = row as Record<string, unknown>;
                    const v = r.variant as Record<string, unknown>;
                    const p = v.product as Record<string, unknown>;
                    const cat = p.category as Record<string, unknown>;
                    const oid = r.variantId as string;
                    const isOut = !!r.isOutOfStock;
                    const isLow = !!r.isLowStock && !isOut;
                    const borderLeft = isOut ?
                        'border-l-4 border-l-red-500 bg-red-500/10'
                      : isLow ?
                        'border-l-4 border-l-amber-500 bg-amber-500/10'
                      : '';
                    const L = v.lengthMm;
                    const W = v.widthMm;
                    const T = v.thicknessMm;
                    const fmtMm = (x: unknown) =>
                      typeof x === 'number' && Number.isFinite(x) ? String(x) : '—';
                    const dim =
                      [L, W, T].every((x) => x == null) ?
                        '—'
                      : `${fmtMm(L)}×${fmtMm(W)}×${fmtMm(T)} mm`;
                    const code = ((v.colourCode as string) ?? '').trim();
                    const swatchBg =
                      /^[0-9A-F]{6}$/i.test(code) ?
                        `#${code}`
                      : /^[0-9A-F]{3}$/i.test(code) ?
                        `#${code
                          .split('')
                          .map((c) => c + c)
                          .join('')}`
                      : 'var(--bg-secondary)';

                    const statusBadge = isOut ?
                      cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', 'bg-red-500/10 text-red-500')
                    : isLow ?
                      cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-500',
                      )
                    : cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500');

                    const statusLabel = isOut ? 'OUT' : isLow ? 'LOW' : 'OK';

                    return (
                      <tr
                        key={oid}
                        className={cn(
                          'border-t border-border hover:bg-surface/50 cursor-pointer',
                          borderLeft,
                        )}
                        onClick={() => setDrawerVariantId(oid)}
                      >
                        <td className="p-3">
                          <span className="font-mono text-xs text-accent block">{(p.sku as string) ?? ''}</span>
                          {(p.name as string) ?? ''}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-surface border border-border text-text-primary">
                            {(cat?.name as string) ?? ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-6 h-6 rounded-full border border-border shrink-0"
                              style={{ background: swatchBg }}
                            />
                            <span>{(v.colourName as string) ?? ''}</span>
                          </div>
                        </td>
                        <td className="p-3 text-xs font-mono text-text-secondary">{dim}</td>
                        <td className="p-3 text-right text-text-primary">{Number(r.totalBoxes)}</td>
                        <td
                          className={cn(
                            'p-3 text-right',
                            Number(r.reservedBoxes) > 0 ? 'text-amber-500 font-medium' : 'text-text-secondary',
                          )}
                        >
                          {Number(r.reservedBoxes)}
                        </td>
                        <td
                          className={cn(
                            'p-3 text-right font-semibold',
                            isOut ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-emerald-700',
                          )}
                        >
                          {Number(r.availableBoxes)}
                        </td>
                        <td className="p-3">
                          <span className={statusBadge}>{statusLabel}</span>
                          <span className="block text-[10px] text-text-secondary/50 mt-1">
                            {Number(r.totalPieces)} pcs avail
                          </span>
                        </td>
                        <td className="p-3 relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-surface border border-transparent hover:border-border"
                            onClick={() => setOpenMenu(openMenu === oid ? null : oid)}
                          >
                            <MoreVertical className="h-4 w-4 text-text-secondary" />
                          </button>
                          {openMenu === oid && (
                            <div className="absolute right-0 z-10 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 text-xs text-text-primary">
                              <button
                                type="button"
                                className="block w-full text-left px-3 py-2 hover:bg-surface"
                                onClick={() => {
                                  setDrawerVariantId(oid);
                                  setOpenMenu(null);
                                }}
                              >
                                View Ledger
                              </button>
                              {canAdjust && (
                                <>
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 hover:bg-surface"
                                    onClick={() => {
                                      const label = `${(p.sku as string) ?? ''} — ${(v.colourName as string) ?? ''} (${(v.colourCode as string) ?? ''})`;
                                      setAdjustVariantId(oid);
                                      setAdjustVariantLabel(label);
                                      setAdjustCurrentStock({
                                        total: Number(r.totalBoxes),
                                        available: Number(r.availableBoxes),
                                      });
                                      setOpenMenu(null);
                                    }}
                                  >
                                    Adjust Stock
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 hover:bg-surface"
                                    onClick={() => {
                                      setTransferFrom(oid);
                                      setTransferOpen(true);
                                      setOpenMenu(null);
                                    }}
                                  >
                                    Transfer Stock
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!stocks.length && (
                <p className="p-8 text-center text-gray-500 text-sm">No stock rows match your filters.</p>
              )}
              {meta?.totalPages != null && meta.totalPages > 1 && (
                <div className="flex justify-between items-center px-4 py-3 border-t text-sm">
                  <button
                    type="button"
                    disabled={!meta?.hasPrev}
                    className="text-accent disabled:opacity-40"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="text-gray-600">
                    Page {page} / {meta.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={!meta?.hasNext}
                    className="text-accent disabled:opacity-40"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          }
        </CardContent>
      </Card>

      {transferOpen && transferFrom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-3 shadow-2xl">
            <h3 className="font-semibold text-text-primary">Transfer stock</h3>
            <p className="text-xs text-text-secondary font-mono">From: {transferFrom}</p>
            <div>
              <label className="text-xs font-medium text-text-secondary">To variant ID (cuid)</label>
              <input
                className="w-full border border-border rounded-lg mt-1 px-3 py-2 text-sm font-mono bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value.trim())}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Boxes</label>
              <input
                type="number"
                min={1}
                className="w-full border border-border rounded-lg mt-1 px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                value={transferBoxes}
                onChange={(e) => setTransferBoxes(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Reason (min 10 chars)</label>
              <textarea
                className="w-full border border-border rounded-lg mt-1 px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={transferMut.isPending}
                onClick={() => {
                  if (transferReason.trim().length < 10 || !transferTo) return;
                  transferMut.mutate(
                    {
                      fromVariantId: transferFrom,
                      toVariantId: transferTo,
                      boxes: transferBoxes,
                      reason: transferReason.trim(),
                    },
                    {
                      onSuccess: () => setTransferOpen(false),
                    },
                  );
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {adjustVariantId && (
        <AdjustStockModal
          variantId={adjustVariantId}
          variantLabel={adjustVariantLabel}
          currentStock={adjustCurrentStock}
          onClose={() => setAdjustVariantId(null)}
        />
      )}

      <VariantLedgerDrawer
        variantId={drawerVariantId}
        open={!!drawerVariantId}
        onClose={() => setDrawerVariantId(null)}
      />
    </div>
  );
}
