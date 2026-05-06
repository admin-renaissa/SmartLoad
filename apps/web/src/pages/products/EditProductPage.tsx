import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, Save, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { cn } from '../../utils/cn.ts';
import api from '../../lib/axios.ts';

import { ProductStatus } from '@smartload/shared';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  hsnCode: string | null;
  unitOfMeasure: string;
  piecesPerBox: number;
  weightPerBoxKg: number | null;
  minStockAlert: number;
  status: ProductStatus;
  isActive: boolean;
}

const FIELD_CLS =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:bg-gray-50 disabled:text-gray-500';
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    sku: '',
    name: '',
    categoryId: '',
    hsnCode: '',
    unitOfMeasure: 'BOX',
    piecesPerBox: '',
    weightPerBoxKg: '',
    minStockAlert: '0',
    status: ProductStatus.ACTIVE,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data;
    },
  });

  const { isLoading: isLoadingProduct } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const r = await api.get(`/products/${id}`);
      const p = r.data.data;
      setForm({
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        hsnCode: p.hsnCode || '',
        unitOfMeasure: p.unitOfMeasure,
        piecesPerBox: String(p.piecesPerBox),
        weightPerBoxKg: p.weightPerBoxKg != null ? String(p.weightPerBoxKg) : '',
        minStockAlert: String(p.minStockAlert),
        status: p.status || (p.isActive ? ProductStatus.ACTIVE : ProductStatus.INACTIVE),
      });
      return p;
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        unitOfMeasure: form.unitOfMeasure,
        piecesPerBox: Number(form.piecesPerBox),
        minStockAlert: Number(form.minStockAlert),
        hsnCode: form.hsnCode.trim() || null,
        weightPerBoxKg: form.weightPerBoxKg ? Number(form.weightPerBoxKg) : null,
        status: form.status,
        isActive: form.status === ProductStatus.ACTIVE,
      };

      await api.patch(`/products/${id}`, payload);
    },
    onSuccess: () => {
      toast.success('Product updated successfully');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['product-stats'] });
      navigate(`/app/products/${id}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to update product';
      toast.error(msg);
    },
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  const isValid =
    form.name.trim() &&
    form.categoryId &&
    Number(form.piecesPerBox) > 0;

  if (isLoadingProduct) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const isArchived = form.status === ProductStatus.ARCHIVED;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Product"
        subtitle={`Editing: ${form.sku}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(`/app/products/${id}`)}
          >
            Back
          </Button>
        }
      />

      {isArchived && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 text-blue-800">
          <AlertTriangle className="h-5 w-5 text-blue-500" />
          <div className="text-sm">
            <p className="font-semibold">This product is Archived</p>
            <p className="opacity-90">Archived products are read-only. Change the status to Active or Inactive to enable editing.</p>
          </div>
        </div>
      )}

      <div className="max-w-2xl">
        <Card className={cn(isArchived && "opacity-80 pointer-events-none")}>
          <div className={cn("absolute inset-0 z-10", !isArchived && "hidden")} />

          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-accent" />
              Product Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* SKU (ReadOnly) + Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>
                  SKU <span className="text-gray-400 font-normal">(Cannot be changed)</span>
                </label>
                <input
                  id="product-sku"
                  value={form.sku}
                  disabled
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="product-name"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="e.g. PVC Sheet 4mm White"
                  className={FIELD_CLS}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className={LABEL_CLS}>
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="product-category"
                value={form.categoryId}
                onChange={set('categoryId')}
                className={FIELD_CLS}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* HSN + Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>HSN Code</label>
                <input
                  id="product-hsn"
                  value={form.hsnCode}
                  onChange={set('hsnCode')}
                  placeholder="e.g. 39209990"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Unit of Measure</label>
                <select
                  id="product-uom"
                  value={form.unitOfMeasure}
                  onChange={set('unitOfMeasure')}
                  className={FIELD_CLS}
                >
                  {['BOX', 'PCS', 'SQM', 'RFT', 'KG'].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pieces/Box + Weight + Min Stock */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LABEL_CLS}>
                  Pieces per Box <span className="text-red-500">*</span>
                </label>
                <input
                  id="product-pieces-per-box"
                  type="number"
                  min="1"
                  value={form.piecesPerBox}
                  onChange={set('piecesPerBox')}
                  placeholder="e.g. 10"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Weight per Box (kg)</label>
                <input
                  id="product-weight"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.weightPerBoxKg}
                  onChange={set('weightPerBoxKg')}
                  placeholder="e.g. 12.5"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Low Stock Alert (boxes)</label>
                <input
                  id="product-min-stock"
                  type="number"
                  min="0"
                  value={form.minStockAlert}
                  onChange={set('minStockAlert')}
                  placeholder="e.g. 20"
                  className={FIELD_CLS}
                />
              </div>
            </div>

            {/* Lifecycle Status */}
            <div className="pt-4 border-t border-gray-100 pointer-events-auto">
              <label className={LABEL_CLS}>Product Lifecycle Status</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: ProductStatus.ACTIVE, label: 'Active', color: 'peer-checked:border-green-500 peer-checked:bg-green-50' },
                  { id: ProductStatus.INACTIVE, label: 'Inactive', color: 'peer-checked:border-amber-500 peer-checked:bg-amber-50' },
                  { id: ProductStatus.ARCHIVED, label: 'Archived', color: 'peer-checked:border-blue-500 peer-checked:bg-blue-50' },
                ].map((s) => (
                  <label key={s.id} className="relative block cursor-pointer group">
                    <input
                      type="radio"
                      name="product-status"
                      value={s.id}
                      checked={form.status === s.id}
                      onChange={() => setForm((prev) => ({ ...prev, status: s.id as ProductStatus }))}
                      className="sr-only peer"
                    />
                    <div className={cn(
                      "px-4 py-3 border border-gray-200 rounded-xl text-center transition-all",
                      "group-hover:border-gray-300",
                      s.color
                    )}>
                      <p className={cn(
                        "text-sm font-semibold",
                        form.status === s.id ? "text-gray-900" : "text-gray-500"
                      )}>
                        {s.label}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 px-1">
                Active: Visible everywhere. Inactive: Hidden from orders. Archived: Historical reference only.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 pointer-events-auto">
              <Button variant="outline" onClick={() => navigate(`/app/products/${id}`)}>
                Cancel
              </Button>
              <Button
                id="edit-product-submit"
                icon={<Save className="h-4 w-4" />}
                loading={mutation.isPending}
                disabled={!isValid || (isArchived && form.status === ProductStatus.ARCHIVED)}
                onClick={() => mutation.mutate()}
              >
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
