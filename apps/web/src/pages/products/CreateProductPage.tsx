import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import api from '../../lib/axios.ts';

interface Category {
  id: string;
  name: string;
}

interface CreateProductPayload {
  sku: string;
  name: string;
  categoryId: string;
  hsnCode?: string;
  unitOfMeasure: string;
  piecesPerBox: number;
  weightPerBoxKg?: number;
  minStockAlert: number;
}

const FIELD_CLS =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent';
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1';

export default function CreateProductPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    sku: '',
    name: '',
    categoryId: '',
    hsnCode: '',
    unitOfMeasure: 'BOX',
    piecesPerBox: '',
    weightPerBoxKg: '',
    minStockAlert: '0',
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: CreateProductPayload = {
        sku: form.sku.trim().toUpperCase(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        unitOfMeasure: form.unitOfMeasure,
        piecesPerBox: Number(form.piecesPerBox),
        minStockAlert: Number(form.minStockAlert),
      };
      if (form.hsnCode.trim()) payload.hsnCode = form.hsnCode.trim();
      if (form.weightPerBoxKg) payload.weightPerBoxKg = Number(form.weightPerBoxKg);

      const r = await api.post('/products', payload);
      return r.data.data as { id: string };
    },
    onSuccess: (product) => {
      toast.success('Product created successfully');
      navigate(`/app/products/${product.id}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
          ?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create product';
      toast.error(msg);
    },
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  const isValid =
    form.sku.trim() &&
    form.name.trim() &&
    form.categoryId &&
    Number(form.piecesPerBox) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Product"
        subtitle="Add a product to the master catalogue"
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate('/app/products')}
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
            {/* SKU + Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>
                  SKU <span className="text-red-500">*</span>
                </label>
                <input
                  id="product-sku"
                  value={form.sku}
                  onChange={set('sku')}
                  placeholder="e.g. PVC-4MM-WHT"
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

            <p className="text-xs text-gray-400">
              After creating the product you will be taken to the detail page where you can add
              colour variants and barcodes.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate('/app/products')}>
                Cancel
              </Button>
              <Button
                id="create-product-submit"
                icon={<Plus className="h-4 w-4" />}
                loading={mutation.isPending}
                disabled={!isValid}
                onClick={() => mutation.mutate()}
              >
                Create Product
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
