import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Download, Upload, Package, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

interface Category {
  id: string;
  name: string;
  slug: string;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  piecesPerBox: number;
  minStockAlert: number;
  category: Category;
  _count: { variants: number };
}

export default function ProductListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = usePermission('products:manage');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [labelsLoading, setLabelsLoading] = useState(false);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data;
    },
  });

  const { data, isLoading } = useQuery<{ items: Product[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['products', search, categoryId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const r = await api.get(`/products?${params}`);
      return { items: r.data.data, meta: r.data.meta };
    },
  });

  const products = data?.items ?? [];
  const meta = data?.meta;

  const activeStatusSlices = useMemo(() => {
    const active = products.filter((p) => p.isActive).length;
    const inactive = Math.max(0, products.length - active);
    return [
      { label: 'ACTIVE', value: active, color: '#16A34A' },
      { label: 'INACTIVE', value: inactive, color: '#6B7280' },
    ];
  }, [products]);

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
        title={t('products.title')}
        subtitle={t('products.subtitle')}
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

      <Card>
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">Product status</p>
          <p className="text-xs text-gray-500 mt-0.5">Active vs inactive variants on this page</p>
        </div>
        <div className="p-4">
          <DonutChart data={activeStatusSlices} height={210} showLegend={false} />
        </div>
      </Card>

      {canManage && (
        <p className="text-sm text-gray-500">{t('products.selectForLabels')}</p>
      )}

      <Card>
        <div className="p-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('products.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">{t('products.allCategories')}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
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
                  <tr className="border-b border-gray-100 text-left text-gray-500 font-medium">
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
                          className="rounded border-gray-300"
                        />
                      </th>
                    )}
                    <th className="px-6 py-3">{t('products.sku')}</th>
                    <th className="px-6 py-3">{t('products.productName')}</th>
                    <th className="px-6 py-3">{t('products.category')}</th>
                    <th className="px-6 py-3 text-right">{t('products.pcsBox')}</th>
                    <th className="px-6 py-3 text-right">{t('products.variants')}</th>
                    <th className="px-6 py-3">{t('products.status')}</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/app/products/${p.id}`)}
                    >
                      {canManage && (
                        <td className="px-3 py-4" onClick={(e) => toggleRow(p.id, e)}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            readOnly
                            onClick={(e) => toggleRow(p.id, e)}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-mono font-semibold text-accent">{p.sku}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{p.category?.name}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{p.piecesPerBox}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {p._count?.variants ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/app/products/${p.id}`);
                          }}
                        >
                          {t('products.view')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="px-6 py-16 text-center">
                        <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">{t('products.empty')}</p>
                        <p className="text-gray-400 text-xs mt-1">{t('products.emptyHint')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{t('products.totalListed', { count: meta.total })}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((prev) => prev - 1)}>
                    Previous
                  </Button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">
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
