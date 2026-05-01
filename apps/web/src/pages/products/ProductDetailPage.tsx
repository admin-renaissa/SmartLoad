import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, QrCode, Edit2, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

interface Variant {
  id: string;
  colourCode: string;
  colourName: string;
  barcodeValue: string;
  barcodeFormat: string;
  lengthMm: number | null;
  widthMm: number | null;
  thicknessMm: number | null;
  mrpPaise: number | null;
  isActive: boolean;
  inventoryStock: { totalBoxes: number; reservedBoxes: number } | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  hsnCode: string | null;
  unitOfMeasure: string;
  piecesPerBox: number;
  weightPerBoxKg: number | null;
  minStockAlert: number;
  isActive: boolean;
  category: { id: string; name: string };
  variants: Variant[];
}

function AddVariantModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
    const [form, setForm] = useState({
    colourCode: '',
    colourName: '',
    lengthMm: '',
    widthMm: '',
    thicknessMm: '',
    barcodeValue: '',
    mrp: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post(`/products/${productId}/variants`, {
        colourCode: form.colourCode.toUpperCase(),
        colourName: form.colourName,
        lengthMm: form.lengthMm ? Number(form.lengthMm) : undefined,
        widthMm: form.widthMm ? Number(form.widthMm) : undefined,
        thicknessMm: form.thicknessMm ? Number(form.thicknessMm) : undefined,
        barcodeValue: form.barcodeValue,
        mrpPaise: form.mrp ? Math.round(Number(form.mrp) * 100) : undefined,
        barcodeFormat: 'QR',
      });
    },
    onSuccess: () => {
      toast.success('Variant added');
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      onClose();
    },
    onError: () => toast.error('Failed to add variant'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add Colour Variant</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour Code *</label>
              <input value={form.colourCode} onChange={(e) => setForm({ ...form, colourCode: e.target.value })}
                placeholder="e.g. WHT01" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour Name *</label>
              <input value={form.colourName} onChange={(e) => setForm({ ...form, colourName: e.target.value })}
                placeholder="e.g. Pearl White" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['lengthMm', 'widthMm', 'thicknessMm'] as const).map((dim) => (
              <div key={dim}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{dim.replace('Mm', '')} (mm)</label>
                <input type="number" value={form[dim]} onChange={(e) => setForm({ ...form, [dim]: e.target.value })}
                  placeholder="0" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Barcode Value *</label>
            <input value={form.barcodeValue} onChange={(e) => setForm({ ...form, barcodeValue: e.target.value })}
              placeholder="e.g. PVC-WHT01-2400X1200X4" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">MRP per Box (₹)</label>
            <input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              placeholder="e.g. 1200.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.colourCode || !form.colourName || !form.barcodeValue}
            onClick={() => mutation.mutate()}
          >
            Add Variant
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('products:manage');
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState<string[]>([]);

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const r = await api.get(`/products/${id}`);
      return r.data.data;
    },
    enabled: !!id,
  });

  async function handleGenerateLabel(variantId: string) {
    setGeneratingLabels((prev) => [...prev, variantId]);
    try {
      const r = await api.post('/variants/generate-labels', { variantIds: [variantId] }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate label');
    } finally {
      setGeneratingLabels((prev) => prev.filter((v) => v !== variantId));
    }
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (!product) return <div className="text-center py-20 text-gray-500">Product not found</div>;

  return (
    <div className="space-y-6">
      {showAddVariant && <AddVariantModal productId={product.id} onClose={() => setShowAddVariant(false)} />}

      <PageHeader
        title={product.name}
        subtitle={`SKU: ${product.sku}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/app/products')}>
              Back
            </Button>
            {canManage && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddVariant(true)}>
                Add Variant
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Product Info</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {[
                { label: 'SKU', value: <span className="font-mono font-semibold text-accent">{product.sku}</span> },
                { label: 'Category', value: product.category?.name },
                { label: 'HSN Code', value: product.hsnCode || '—' },
                { label: 'Unit', value: product.unitOfMeasure },
                { label: 'Pieces/Box', value: product.piecesPerBox },
                { label: 'Weight/Box', value: product.weightPerBoxKg ? `${product.weightPerBoxKg} kg` : '—' },
                { label: 'Low Stock Alert', value: `${product.minStockAlert} boxes` },
                { label: 'Status', value: <StatusBadge status={product.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Colour Variants ({product.variants.length})</h2>

          {product.variants.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No variants yet</p>
                  {canManage && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddVariant(true)}>
                      Add First Variant
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {product.variants.map((v) => {
                const available = (v.inventoryStock?.totalBoxes ?? 0) - (v.inventoryStock?.reservedBoxes ?? 0);
                const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join(' × ');
                return (
                  <Card key={v.id} className={!v.isActive ? 'opacity-60' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-gray-900">{v.colourName}</span>
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{v.colourCode}</span>
                            <StatusBadge status={v.isActive ? 'ACTIVE' : 'INACTIVE'} />
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            {dims && <span>{dims} mm</span>}
                            <span className="font-mono">{v.barcodeValue}</span>
                            {v.mrpPaise && <span>MRP ₹{(v.mrpPaise / 100).toFixed(2)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">{available}</div>
                            <div className="text-xs text-gray-500">boxes available</div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<QrCode className="h-3.5 w-3.5" />}
                            loading={generatingLabels.includes(v.id)}
                            onClick={() => handleGenerateLabel(v.id)}
                          >
                            Label
                          </Button>
                          {canManage && (
                            <Button variant="ghost" size="sm" icon={<Edit2 className="h-3.5 w-3.5" />}>
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
