import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoreVertical } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { cn } from '../../utils/cn.ts';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { useAuthStore } from '../../store/authStore.ts';
import {
  useStockSummary,
  useLowStockVariants,
  useInventoryValuation,
  useExportInventory,
  useImportOpeningStock,
  useTransferStock,
} from '../../hooks/useInventory.ts';
import { VariantLedgerDrawer } from './VariantLedgerDrawer.tsx';

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
              <label className="inline-flex items-center justify-center rounded-button font-medium text-sm h-8 px-3 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer">
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
          className="w-full text-left rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm font-medium"
        >
          ⚠ {lowBannerCount} items are running low or out of stock — tap to filter
        </button>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Search</label>
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Product, SKU, colour…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Category</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
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
                  : 'bg-white text-gray-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Sort</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
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
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ?
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          : <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
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
                        'border-l-4 border-l-red-500 bg-red-50/40'
                      : isLow ?
                        'border-l-4 border-l-amber-400'
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
                      : '#e5e7eb';

                    const statusBadge = isOut ?
                      cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', 'bg-red-100 text-red-800')
                    : isLow ?
                      cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium border border-amber-500 text-amber-700',
                      )
                    : cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800');

                    const statusLabel = isOut ? 'OUT' : isLow ? 'LOW' : 'OK';

                    return (
                      <tr
                        key={oid}
                        className={cn(
                          'border-t hover:bg-gray-50/80 cursor-pointer',
                          borderLeft,
                        )}
                        onClick={() => setDrawerVariantId(oid)}
                      >
                        <td className="p-3">
                          <span className="font-mono text-xs text-accent block">{(p.sku as string) ?? ''}</span>
                          {(p.name as string) ?? ''}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                            {(cat?.name as string) ?? ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-6 h-6 rounded-full border shrink-0"
                              style={{ background: swatchBg }}
                            />
                            <span>{(v.colourName as string) ?? ''}</span>
                          </div>
                        </td>
                        <td className="p-3 text-xs font-mono text-gray-600">{dim}</td>
                        <td className="p-3 text-right text-gray-600">{Number(r.totalBoxes)}</td>
                        <td
                          className={cn(
                            'p-3 text-right',
                            Number(r.reservedBoxes) > 0 ? 'text-amber-700 font-medium' : 'text-gray-500',
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
                          <span className="block text-[10px] text-gray-500 mt-1">
                            {Number(r.totalPieces)} pcs avail
                          </span>
                        </td>
                        <td className="p-3 relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-gray-100"
                            onClick={() => setOpenMenu(openMenu === oid ? null : oid)}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenu === oid && (
                            <div className="absolute right-0 z-10 mt-1 w-48 bg-white border rounded-lg shadow-lg py-1 text-xs">
                              <button
                                type="button"
                                className="block w-full text-left px-3 py-2 hover:bg-gray-50"
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
                                    className="block w-full text-left px-3 py-2 hover:bg-gray-50"
                                    onClick={() => {
                                      setDrawerVariantId(oid);
                                      setOpenMenu(null);
                                    }}
                                  >
                                    Adjust Stock
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 hover:bg-gray-50"
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-3">
            <h3 className="font-semibold">Transfer stock</h3>
            <p className="text-xs text-gray-500 font-mono">From: {transferFrom}</p>
            <div>
              <label className="text-xs font-medium text-gray-600">To variant ID (cuid)</label>
              <input
                className="w-full border rounded-lg mt-1 px-3 py-2 text-sm font-mono"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value.trim())}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Boxes</label>
              <input
                type="number"
                min={1}
                className="w-full border rounded-lg mt-1 px-3 py-2 text-sm"
                value={transferBoxes}
                onChange={(e) => setTransferBoxes(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Reason (min 10 chars)</label>
              <textarea
                className="w-full border rounded-lg mt-1 px-3 py-2 text-sm"
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
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

      <VariantLedgerDrawer
        variantId={drawerVariantId}
        open={!!drawerVariantId}
        onClose={() => setDrawerVariantId(null)}
      />
    </div>
  );
}
