import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoreVertical, PackagePlus, PackageMinus, RefreshCw, Package, Boxes, AlertTriangle, AlertOctagon, Bookmark, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { cn } from '../../utils/cn.ts';
import { getVariantColor } from '../../utils/colors.ts';
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
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-medium">
              <span className="font-bold">{lowBannerCount} items</span> require immediate restocking or are running low.
            </p>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
            onClick={() => {
              setLowOnly(true);
              setOutOnly(false);
              setPage(1);
            }}
          >
            View Critical Inventory
          </Button>
        </div>
      )}

      {/* Analytics Command Center */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: 70% Cards Grid */}
        <div className="lg:w-[70%] grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Total Variants</p>
                  <p className="text-2xl font-bold text-text-primary">{(valuation?.totalVariants as number) ?? meta?.total ?? '—'}</p>
                </div>
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>Active product SKUs</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Available Stock</p>
                  <p className="text-2xl font-bold text-text-primary">{(valuation?.grandTotalBoxes as number) ?? '—'}</p>
                </div>
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                  <Boxes className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Total ready for dispatch</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Reserved Stock</p>
                  <p className="text-2xl font-bold text-text-primary">{(valuation?.grandTotalReservedBoxes as number) ?? '—'}</p>
                </div>
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                  <Bookmark className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span>Allocated to orders</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Low Stock Items</p>
                  <p className="text-2xl font-bold text-amber-600">{Math.max(0, lowBannerCount - outCount)}</p>
                </div>
                <div className="p-2 bg-amber-500/20 rounded-lg text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600/80">
                <span>Nearing minimum alert level</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-600">{outCount}</p>
                </div>
                <div className="p-2 bg-red-500/20 rounded-lg text-red-600">
                  <AlertOctagon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600/80">
                <span className="font-semibold">Urgent action required</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Incoming Stock</p>
                  <p className="text-2xl font-bold text-text-primary">0</p>
                </div>
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                  <ArrowDownToLine className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>Pending GRN warehouse entry</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: 30% Stock Health Chart */}
        <Card className="lg:w-[30%] flex flex-col hover:shadow-md transition-shadow">
          <div className="p-4 pb-0">
            <p className="text-sm font-semibold text-text-primary flex items-center justify-between">
              Stock Health
              <span className="text-[10px] uppercase bg-surface px-2 py-1 rounded-sm text-text-secondary tracking-wider font-medium">Live</span>
            </p>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
              <Boxes className="w-32 h-32" />
            </div>
            <DonutChart data={stockHealthSlices} height={180} showLegend={false} />
            
            <div className="flex justify-center gap-4 mt-2">
              {stockHealthSlices.map(s => (
                <div key={s.label} className="text-center">
                  <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </div>
                  <p className="font-semibold text-sm" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Section */}
      <Card className="p-3 shadow-sm border border-border">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3 items-center w-full">
            <div className="relative flex-1 md:flex-none min-w-[200px]">
              <input
                className="pl-9 pr-3 py-2 text-sm w-full md:w-64 bg-surface border border-border text-text-primary rounded-lg focus:ring-2 focus:ring-accent/30 outline-none transition-shadow"
                placeholder="Search products, SKUs..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <svg className="w-4 h-4 absolute left-3 top-2.5 text-text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <select
              className="bg-surface border border-border text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 min-w-[140px] transition-shadow"
              value={categoryId ?? ''}
              onChange={(e) => {
                setCategoryId(e.target.value || undefined);
                setPage(1);
              }}
            >
              <option value="">All Categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            
            <div className="h-6 w-[1px] bg-border mx-1 hidden md:block"></div>

            <div className="flex bg-surface rounded-lg p-1 border border-border">
              {(['All', 'Low Stock', 'Out of Stock'] as const).map((label) => {
                const isActive = (label === 'All' && !lowOnly && !outOnly) ||
                  (label === 'Low Stock' && lowOnly && !outOnly) ||
                  (label === 'Out of Stock' && outOnly);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      if (label === 'All') { setLowOnly(false); setOutOnly(false); }
                      else if (label === 'Low Stock') { setLowOnly(true); setOutOnly(false); }
                      else { setLowOnly(false); setOutOnly(true); }
                    }}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      isActive ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-card'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {(search || categoryId || lowOnly || outOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategoryId(undefined);
                  setLowOnly(false);
                  setOutOnly(false);
                  setPage(1);
                }}
                className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Clear filters
              </button>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary whitespace-nowrap">Sort by</label>
              <select
                className="bg-surface border border-border text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
                value={`${sortBy}-${sortDir}`}
                onChange={(e) => {
                  const [sb, sd] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
                  setSortBy(sb);
                  setSortDir(sd);
                }}
              >
                <option value="productName-asc">Name A–Z</option>
                <option value="productName-desc">Name Z–A</option>
                <option value="availableBoxes-desc">Available (High)</option>
                <option value="availableBoxes-asc">Available (Low)</option>
              </select>
            </div>
          </div>
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
                    
                    const colorData = getVariantColor((v.colourName as string) ?? '');

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
                          <div className="flex items-center gap-2 group relative">
                            <span
                              className={cn(
                                "w-4 h-4 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-110",
                                colorData.isLight ? "border border-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "shadow-sm border border-transparent dark:border-white/10"
                              )}
                              style={{ backgroundColor: colorData.hex }}
                              aria-label={`Color: ${colorData.name}`}
                            />
                            <span>{colorData.name}</span>
                            
                            {/* Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 -top-8 hidden group-hover:block z-50 pointer-events-none">
                              <div className="bg-slate-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap shadow-xl">
                                {colorData.name} ({colorData.hex})
                              </div>
                              <div className="w-2 h-2 bg-slate-800 rotate-45 mx-auto -mt-1 shadow-xl"></div>
                            </div>
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
