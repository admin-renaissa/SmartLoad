import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';

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
    isActive: true,
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
        isActive: p.isActive,
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
        isActive: form.isActive,
      };

      await api.patch(`/products/${id}`, payload);
    },
    onSuccess: () => {
      toast.success('Product updated successfully');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
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

      <div className="max-w-2xl">
        <Card>
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

            {/* Status Toggle */}
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-700">Active Status</p>
                <p className="text-xs text-gray-400">Inactive products are hidden from new orders</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.isActive ? 'bg-accent' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(`/app/products/${id}`)}>
                Cancel
              </Button>
              <Button
                id="edit-product-submit"
                icon={<Save className="h-4 w-4" />}
                loading={mutation.isPending}
                disabled={!isValid}
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
