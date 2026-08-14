import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Download, Upload, Package, Tag,
  MoreVertical, Eye, Edit2, Trash2, AlertTriangle,
  Pause, Archive
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/DropdownMenu.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/AlertDialog.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';
import { cn } from '../../utils/cn.ts';

import { ProductStatus } from '@smartload/shared';

interface Category {
  id: string;
  name: string;
  slug: string;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  status: ProductStatus;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  piecesPerBox: number;
  minStockAlert: number;
  category: Category;
  _count: { variants: number };
  stockHealth?: 'available' | 'low-stock' | 'out-of-stock' | 'no-stock-data';
}

function ProductActions({ product, onUpdated }: { product: Product; onUpdated: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('products:manage');
  const [showLifecycleModal, setShowLifecycleModal] = useState(false);
  const [actionType, setActionType] = useState<'INACTIVE' | 'ARCHIVED' | 'TRASH' | 'RESTORE' | 'PERMANENT_DELETE' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleAction() {
    if (!actionType) return;
    setIsProcessing(true);
    try {
      if (actionType === 'TRASH') {
        await api.delete(`/products/${product.id}`);
        toast.success('Product moved to trash');
      } else if (actionType === 'RESTORE') {
        await api.post(`/products/${product.id}/restore`);
        toast.success('Product restored successfully');
      } else if (actionType === 'PERMANENT_DELETE') {
        await api.delete(`/products/${product.id}/permanent`);
        toast.success('Product permanently deleted');
      } else {
        // INACTIVE or ARCHIVED
        await api.post(`/products/${product.id}/status`, { status: actionType });
        toast.success(`Product marked as ${actionType.toLowerCase()}`);
      }
      onUpdated();
      queryClient.invalidateQueries({ queryKey: ['product-stats'] });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || `Failed to ${actionType.toLowerCase()} product`;
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      setShowLifecycleModal(false);
      setActionType(null);
    }
  }

  const menuItems = useMemo(() => {
    if (!canManage) return [];
    
    if (product.isDeleted) {
      return [
        { label: 'Restore Product', icon: <Plus className="h-4 w-4 text-green-600" />, action: () => { setActionType('RESTORE'); setShowLifecycleModal(true); } },
        { label: 'Permanently Delete', icon: <Trash2 className="h-4 w-4 text-red-600" />, action: () => { setActionType('PERMANENT_DELETE'); setShowLifecycleModal(true); } },
      ];
    }

    const items = [];
    if (product.status !== ProductStatus.ARCHIVED) {
      items.push({ label: t('common.edit', 'Edit'), icon: <Edit2 className="h-4 w-4 text-text-secondary" />, action: () => navigate(`/app/products/${product.id}/edit`) });
    }

    if (product.status === ProductStatus.ACTIVE) {
      items.push({ label: 'Mark Inactive', icon: <Eye className="h-4 w-4 text-amber-500" />, action: () => { setActionType('INACTIVE'); setShowLifecycleModal(true); } });
    } else if (product.status === ProductStatus.INACTIVE) {
      items.push({ label: 'Mark Active', icon: <Eye className="h-4 w-4 text-green-500" />, action: () => { setActionType('RESTORE'); setShowLifecycleModal(true); } });
    }

    if (product.status !== ProductStatus.ARCHIVED) {
      items.push({ label: 'Archive Product', icon: <Download className="h-4 w-4 text-blue-500" />, action: () => { setActionType('ARCHIVED'); setShowLifecycleModal(true); } });
    } else {
      items.push({ label: 'Unarchive (Restore)', icon: <Plus className="h-4 w-4 text-green-500" />, action: () => { setActionType('RESTORE'); setShowLifecycleModal(true); } });
    }

    items.push({ label: 'Move to Trash', icon: <Trash2 className="h-4 w-4 text-red-600" />, action: () => { setActionType('TRASH'); setShowLifecycleModal(true); } });

    return items;
  }, [product, canManage, t, navigate]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4 text-text-secondary" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/app/products/${product.id}`)}>
            <Eye className="h-4 w-4 text-blue-500" />
            <span>{t('products.view')}</span>
          </DropdownMenuItem>
          {menuItems.map((item, i) => (
            <DropdownMenuItem key={i} onClick={(e) => { e.stopPropagation(); item.action(); }}>
              {item.icon}
              <span>{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showLifecycleModal} onOpenChange={setShowLifecycleModal}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={cn("h-5 w-5", actionType === 'PERMANENT_DELETE' ? "text-red-600" : "text-amber-500")} />
              {actionType === 'TRASH' && 'Move to Trash'}
              {actionType === 'RESTORE' && 'Restore Product'}
              {actionType === 'ARCHIVED' && 'Archive Product'}
              {actionType === 'INACTIVE' && 'Mark as Inactive'}
              {actionType === 'PERMANENT_DELETE' && 'Permanent Delete'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'TRASH' && (
                <>Are you sure you want to move <strong>{product.name}</strong> to trash? It will be hidden from all active operations but can be restored later.</>
              )}
              {actionType === 'RESTORE' && (
                <>Restore <strong>{product.name}</strong> to active status? This will make it visible in orders and catalog selections.</>
              )}
              {actionType === 'ARCHIVED' && (
                <>Archive <strong>{product.name}</strong>? Archived products are read-only and preserved for historical reference. They cannot be used in new orders.</>
              )}
              {actionType === 'INACTIVE' && (
                <>Mark <strong>{product.name}</strong> as inactive? It will be hidden from new orders but remain visible in admin listings.</>
              )}
              {actionType === 'PERMANENT_DELETE' && (
                <>
                  <span className="text-red-600 font-bold block mb-2">WARNING: THIS ACTION CANNOT BE UNDONE.</span>
                  Are you sure you want to PERMANENTLY delete <strong>{product.name}</strong>? 
                  This will only succeed if the product has no historical dependencies (orders or inventory movements).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(actionType === 'PERMANENT_DELETE' || actionType === 'TRASH' ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent/90")}
              onClick={handleAction}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StockBadge({ health }: { health?: 'available' | 'low-stock' | 'out-of-stock' | 'no-stock-data' }) {
  if (!health || health === 'no-stock-data') return null;
  if (health === 'available') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
        Available
      </span>
    );
  }
  if (health === 'low-stock') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        Low Stock
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
      Out of Stock
    </span>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

function StatCard({ title, value, subtitle, icon: Icon, color, bgColor, borderColor }: StatCardProps) {
  return (
    <Card className="group p-5 flex flex-col justify-between relative overflow-hidden h-full border-none shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 bg-card rounded-[20px]">
      <div className="flex justify-between items-start mb-2">
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.05em]">{title}</span>
          <div className="text-3xl font-extrabold text-text-primary tracking-tight leading-none pt-1">{value}</div>
        </div>
        <div className={cn("p-2.5 rounded-[14px] transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm", bgColor)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
      </div>
      
      <div className="mt-auto">
        <p className="text-[11px] text-text-secondary font-medium mb-3.5 opacity-80">{subtitle}</p>
        <div className={cn("h-[3px] w-full rounded-full opacity-80", borderColor)} />
      </div>
    </Card>
  );
}

export default function ProductListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('products:manage');
  const [currentTab, setCurrentTab] = useState<'ALL' | 'INACTIVE' | 'ARCHIVED' | 'TRASH'>('ALL');
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'low-stock' | 'out-of-stock' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [labelsLoading, setLabelsLoading] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['product-stats'],
    queryFn: async () => {
      const r = await api.get('/products/stats');
      return r.data.data;
    }
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data;
    },
  });

  const { data, isLoading, refetch } = useQuery<{ items: Product[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['products', search, categoryId, page, currentTab, stockFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      if (stockFilter !== 'all') params.set('stockFilter', stockFilter);
      
      if (currentTab === 'TRASH') {
        params.set('isDeleted', 'true');
      } else if (currentTab !== 'ALL') {
        params.set('status', currentTab);
      }
      
      const r = await api.get(`/products?${params}`);
      return { items: r.data.data, meta: r.data.meta };
    },
  });

  const products = data?.items ?? [];
  const meta = data?.meta;

  const totalCount = useMemo(() => {
    if (!stats) return 0;
    return (stats.active || 0) + (stats.inactive || 0) + (stats.archived || 0) + (stats.deleted || 0);
  }, [stats]);

  const lifecycleSlices = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Active', value: stats.active, color: '#16A34A' },
      { label: 'Inactive', value: stats.inactive, color: '#F59E0B' },
      { label: 'Archived', value: stats.archived, color: '#3B82F6' },
      { label: 'Trash', value: stats.deleted, color: '#EF4444' },
    ];
  }, [stats]);

  const allPageSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
  }

  async function handleExport() {
    const r = await api.get('/products/export', { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleRow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) for (const p of products) next.delete(p.id);
      else for (const p of products) next.add(p.id);
      return next;
    });
  }

  async function handleLabelPdf() {
    if (selectedIds.size === 0) return;
    setLabelsLoading(true);
    try {
      const variantIds: string[] = [];
      for (const pid of selectedIds) {
        const r = await api.get(`/products/${pid}`);
        const variants = (r.data.data.variants || []) as { id: string; isActive: boolean }[];
        for (const v of variants) if (v.isActive) variantIds.push(v.id);
      }
      if (!variantIds.length) {
        toast.error(t('products.labelDownloadNoVariants'));
        return;
      }
      const r = await api.post('/products/labels/pdf', { variantIds }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'variant-labels.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('products.labelDownloadFailed'));
    } finally {
      setLabelsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('products.title', 'Product Master')}
        subtitle={t('products.subtitle', 'Manage PVC sheet products and colour variants')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && selectedIds.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                icon={<Tag className="h-4 w-4" />}
                loading={labelsLoading}
                onClick={() => void handleLabelPdf()}
              >
                {t('products.downloadLabels')}
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void handleExport()}>
              {t('products.exportCsv')}
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/app/products/import')}>
                  {t('products.importCsv')}
                </Button>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/products/new')}>
                  {t('products.newProduct')}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        <Card className="p-5 lg:col-span-1 flex flex-col border-none shadow-lg shadow-black/5 bg-card rounded-[20px]">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.05em]">Lifecycle Overview</p>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-surface rounded-full">
              <MoreVertical className="h-4 w-4 text-text-secondary" />
            </Button>
          </div>
          
          <div className="flex-1 flex flex-col justify-center items-center min-h-[140px]">
            <div className="relative w-full flex justify-center">
              <DonutChart data={lifecycleSlices} height={140} showLegend={false} />
            </div>
            
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
              {lifecycleSlices.filter(s => s.value > 0).map((slice, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="text-[9px] font-bold text-text-secondary whitespace-nowrap tracking-tight uppercase">
                    {slice.label} {slice.value} ({totalCount > 0 ? Math.round((slice.value / totalCount) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <StatCard
          title="Available"
          value={stats?.stockAvailable ?? 0}
          subtitle="Products in stock"
          icon={Package}
          color="text-green-600"
          bgColor="bg-green-50"
          borderColor="bg-green-500"
        />
        <StatCard
          title="Low Stock"
          value={stats?.stockLow ?? 0}
          subtitle="Needs restock"
          icon={AlertTriangle}
          color="text-amber-600"
          bgColor="bg-amber-50"
          borderColor="bg-amber-500"
        />
        <StatCard
          title="Out of Stock"
          value={stats?.stockOut ?? 0}
          subtitle="Zero inventory"
          icon={Pause}
          color="text-red-600"
          bgColor="bg-red-50"
          borderColor="bg-red-500"
        />
        <StatCard
          title="Archived"
          value={stats?.archived ?? 0}
          subtitle="Products are archived"
          icon={Archive}
          color="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="bg-blue-500"
        />
      </div>

      <div className="flex border-b border-border">
        {[
          { id: 'ALL', label: 'All Products', count: stats?.total },
          { id: 'INACTIVE', label: 'Inactive', count: stats?.inactive },
          { id: 'ARCHIVED', label: 'Archived', count: stats?.archived },
          { id: 'TRASH', label: 'Trash / Deleted', count: stats?.deleted },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setCurrentTab(tab.id as any);
              setPage(1);
            }}
            className={cn(
              "px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
              currentTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border"
            )}
          >
            {tab.label}
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold",
              currentTab === tab.id ? "bg-accent/10 text-accent" : "bg-surface text-text-secondary"
            )}>
              {tab.count ?? 0}
            </span>
          </button>
        ))}
      </div>

      {canManage && (
        <p className="text-sm text-text-secondary">{t('products.selectForLabels')}</p>
      )}

      <Card>
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 w-full gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="text"
                placeholder={t('products.searchPlaceholder', 'Search by SKU or name...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-card text-text-primary"
              />
            </div>
            
            <div className="relative min-w-[160px]">
              <select
                value={stockFilter}
                onChange={(e) => {
                  setStockFilter(e.target.value as any);
                  setPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-text-primary appearance-none"
              >
                <option value="all">All Products</option>
                <option value="available">Available Products</option>
                <option value="low-stock">Low Stock Products</option>
                <option value="out-of-stock">Out of Stock Products</option>
                <option value="archived">Archived Products</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="h-4 w-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div className="relative min-w-[160px]">
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-text-primary appearance-none"
              >
                <option value="">{t('products.allCategories', 'All Categories')}</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="h-4 w-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <Button type="submit" size="sm" className="hidden sm:flex">
              {t('products.search')}
            </Button>
          </form>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary font-medium">
                    {canManage && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={allPageSelected}
                          readOnly
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePage(e);
                          }}
                          className="rounded border-border bg-card"
                        />
                      </th>
                    )}
                    <th className="px-6 py-3">{t('products.sku')}</th>
                    <th className="px-6 py-3">{t('products.productName')}</th>
                    <th className="px-6 py-3">{t('products.category')}</th>
                    <th className="px-6 py-3 text-right">{t('products.pcsBox')}</th>
                    <th className="px-6 py-3 text-right">{t('products.variants')}</th>
                    <th className="px-6 py-3">{t('products.status')}</th>
                    <th className="px-6 py-3 text-right">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className={cn("hover:bg-surface/50 transition-colors", p.status === 'ARCHIVED' && "opacity-60")}
                    >
                      {canManage && (
                        <td className="px-3 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              setSelectedIds(next);
                            }}
                            className="rounded border-border bg-card cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate(`/app/products/${p.id}`)}
                          className="font-mono font-semibold text-accent hover:underline text-left"
                        >
                          {p.sku}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate(`/app/products/${p.id}`)}
                          className="flex items-center gap-2 group text-left"
                        >
                          <Package className="h-4 w-4 text-text-secondary flex-shrink-0 group-hover:text-accent transition-colors" />
                          <span className="font-medium text-text-primary group-hover:text-accent transition-colors">
                            {p.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-text-secondary">{p.category?.name}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{p.piecesPerBox}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {p._count?.variants ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          {p.isDeleted ? (
                            <StatusBadge status="DELETED" />
                          ) : (
                            <StatusBadge status={p.status} />
                          )}
                          {!p.isDeleted && p.status !== 'ARCHIVED' && (
                            <StockBadge health={p.stockHealth} />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <ProductActions product={p} onUpdated={() => refetch()} />
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="px-6 py-16 text-center">
                        <Package className="h-10 w-10 text-text-secondary/30 mx-auto mb-3" />
                        <p className="text-text-secondary font-medium">
                          {stockFilter === 'low-stock' 
                            ? 'No low stock products found 🎉'
                            : stockFilter === 'out-of-stock'
                            ? 'All products are sufficiently stocked.'
                            : t('products.empty')}
                        </p>
                        {stockFilter === 'all' && (
                          <p className="text-text-secondary/50 text-xs mt-1">{t('products.emptyHint')}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-text-secondary">{t('products.totalListed', { count: meta.total })}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((prev) => prev - 1)}>
                    Previous
                  </Button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">
                    Page {page} of {meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === meta.totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
