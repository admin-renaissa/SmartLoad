import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Download, Upload, Package } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

interface Category { id: string; name: string; slug: string; }
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
  const navigate = useNavigate();
  const canManage = usePermission('products:manage');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/api/v1/products/categories');
      return r.data.data;
    },
  });

  const { data, isLoading } = useQuery<{ items: Product[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['products', search, categoryId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const r = await api.get(`/api/v1/products?${params}`);
      return { items: r.data.data, meta: r.data.meta };
    },
  });

  const products = data?.items ?? [];
  const meta = data?.meta;

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
  }

  async function handleExport() {
    const r = await api.get('/api/v1/products/export', { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Master"
        subtitle="Manage PVC sheet products and colour variants"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
              Export CSV
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/app/products/import')}>
                  Import CSV
                </Button>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/app/products/new')}>
                  New Product
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card>
        <div className="p-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SKU or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">All Categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button type="submit" size="sm">Search</Button>
          </form>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500 font-medium">
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3">Product Name</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3 text-right">Pcs/Box</th>
                    <th className="px-6 py-3 text-right">Variants</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/app/products/${p.id}`)}>
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
                          {p._count?.variants ?? 0} variants
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="px-6 py-4">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/app/products/${p.id}`); }}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No products found</p>
                        <p className="text-gray-400 text-xs mt-1">Try adjusting your search or add a new product</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{meta.total} total products</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {meta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page === meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
