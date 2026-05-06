import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, QrCode, Edit2, Package,
  Ruler, Barcode, Tag, CheckCircle2, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

import { ProductStatus } from '@smartload/shared';

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
  status: ProductStatus;
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
  status: ProductStatus;
  isActive: boolean;
  isDeleted: boolean;
  category: { id: string; name: string };
  variants: Variant[];
}

/* ─── Shared input styles ─────────────────────────────────────────────────── */
const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30';
const LABEL_STYLE = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

/* ─── Add Variant Modal ──────────────────────────────────────────────────────*/
function AddVariantModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ colourCode: '', colourName: '', lengthMm: '', widthMm: '', thicknessMm: '', barcodeValue: '', mrp: '' });

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
    onSuccess: () => { toast.success('Variant added'); queryClient.invalidateQueries({ queryKey: ['product', productId] }); onClose(); },
    onError: () => toast.error('Failed to add variant'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Colour Variant</h2>
          <p className="text-xs text-gray-500 mt-0.5">Fill in the variant details below</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL_STYLE}>Colour Code *</label><input value={form.colourCode} onChange={e => setForm({ ...form, colourCode: e.target.value })} placeholder="e.g. WHT01" className={INPUT} /></div>
            <div><label className={LABEL_STYLE}>Colour Name *</label><input value={form.colourName} onChange={e => setForm({ ...form, colourName: e.target.value })} placeholder="e.g. Pearl White" className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['lengthMm', 'widthMm', 'thicknessMm'] as const).map(dim => (
              <div key={dim}>
                <label className={LABEL_STYLE}>{dim.replace('Mm', '')} mm</label>
                <input type="number" value={form[dim]} onChange={e => setForm({ ...form, [dim]: e.target.value })} placeholder="0" className={INPUT} />
              </div>
            ))}
          </div>
          <div><label className={LABEL_STYLE}>Barcode Value *</label><input value={form.barcodeValue} onChange={e => setForm({ ...form, barcodeValue: e.target.value })} placeholder="e.g. PVC-WHT01-2400X1200X4" className={INPUT} /></div>
          <div><label className={LABEL_STYLE}>MRP per Box (₹)</label><input type="number" value={form.mrp} onChange={e => setForm({ ...form, mrp: e.target.value })} placeholder="e.g. 1200.00" className={INPUT} /></div>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!form.colourCode || !form.colourName || !form.barcodeValue} onClick={() => mutation.mutate()}>Add Variant</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Variant Modal ─────────────────────────────────────────────────────*/
function EditVariantModal({ productId, variant, onClose }: { productId: string; variant: Variant; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    colourCode: variant.colourCode,
    colourName: variant.colourName,
    lengthMm: variant.lengthMm != null ? String(variant.lengthMm) : '',
    widthMm: variant.widthMm != null ? String(variant.widthMm) : '',
    thicknessMm: variant.thicknessMm != null ? String(variant.thicknessMm) : '',
    barcodeValue: variant.barcodeValue,
    barcodeFormat: variant.barcodeFormat,
    mrp: variant.mrpPaise != null ? String(variant.mrpPaise / 100) : '',
    isActive: variant.isActive,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/products/${productId}/variants/${variant.id}`, {
        colourCode: form.colourCode.toUpperCase(),
        colourName: form.colourName,
        lengthMm: form.lengthMm ? Number(form.lengthMm) : undefined,
        widthMm: form.widthMm ? Number(form.widthMm) : undefined,
        thicknessMm: form.thicknessMm ? Number(form.thicknessMm) : undefined,
        barcodeValue: form.barcodeValue,
        barcodeFormat: form.barcodeFormat,
        mrpPaise: form.mrp ? Math.round(Number(form.mrp) * 100) : undefined,
        isActive: form.isActive,
      });
    },
    onSuccess: () => { toast.success('Variant updated'); queryClient.invalidateQueries({ queryKey: ['product', productId] }); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update variant';
      toast.error(msg);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Edit Variant</h2>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{variant.colourName} ({variant.colourCode})</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL_STYLE}>Colour Code *</label><input value={form.colourCode} onChange={e => setForm({ ...form, colourCode: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL_STYLE}>Colour Name *</label><input value={form.colourName} onChange={e => setForm({ ...form, colourName: e.target.value })} className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['lengthMm', 'widthMm', 'thicknessMm'] as const).map(dim => (
              <div key={dim}><label className={LABEL_STYLE}>{dim.replace('Mm', '')} mm</label><input type="number" value={form[dim]} onChange={e => setForm({ ...form, [dim]: e.target.value })} placeholder="0" className={INPUT} /></div>
            ))}
          </div>
          <div><label className={LABEL_STYLE}>Barcode Value *</label><input value={form.barcodeValue} onChange={e => setForm({ ...form, barcodeValue: e.target.value })} className={INPUT} /></div>
          <div>
            <label className={LABEL_STYLE}>Barcode Format</label>
            <select value={form.barcodeFormat} onChange={e => setForm({ ...form, barcodeFormat: e.target.value })} className={INPUT}>
              {['QR', 'CODE128', 'CODE39', 'DATAMATRIX', 'EAN13'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div><label className={LABEL_STYLE}>MRP per Box (₹)</label><input type="number" value={form.mrp} onChange={e => setForm({ ...form, mrp: e.target.value })} placeholder="e.g. 1200.00" className={INPUT} /></div>
          <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">Active</p>
              <p className="text-xs text-gray-400">Inactive variants hidden from dispatch</p>
            </div>
            <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? 'bg-accent' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!form.colourCode || !form.colourName || !form.barcodeValue} onClick={() => mutation.mutate()}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────*/
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('products:manage');
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [generatingLabels, setGeneratingLabels] = useState<string[]>([]);

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => { const r = await api.get(`/products/${id}`); return r.data.data; },
    enabled: !!id && id !== 'new',
  });

  async function handleGenerateLabel(variantId: string) {
    setGeneratingLabels(prev => [...prev, variantId]);
    try {
      const r = await api.post('/variants/generate-labels', { 
        variantIds: [variantId],
        orderInfo: undefined // Stock master labels have no order context
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to generate label'); }
    finally { setGeneratingLabels(prev => prev.filter(v => v !== variantId)); }
  }

  /* Hooks MUST be before early returns */
  const variantHealthSlices = useMemo<DonutSlice[]>(() => {
    const variants = product?.variants ?? [];
    const active = variants.filter(v => v.isActive).length;
    const inactive = variants.length - active;

    // If no variants, show a full gray slice as a placeholder
    if (variants.length === 0) {
      return [{ label: 'No variants', value: 1, color: '#f3f4f6' }];
    }

    return [
      { label: 'Active', value: active, color: '#22c55e' },
      { label: 'Inactive', value: inactive, color: '#e5e7eb' },
    ];
  }, [product?.variants]);

  if (isLoading) return <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>;
  if (!product) return <div className="flex flex-col items-center justify-center py-24 text-gray-400"><Package className="h-12 w-12 mb-3 opacity-40" /><p className="text-base font-medium">Product not found</p></div>;

  const activeCount = product.variants.filter(v => v.isActive).length;
  const inactiveCount = product.variants.length - activeCount;

  const infoRows = [
    { label: 'SKU',             value: <span className="font-mono font-bold text-accent">{product.sku}</span> },
    { label: 'Category',        value: product.category?.name },
    { label: 'HSN Code',        value: product.hsnCode || '—' },
    { label: 'Unit',            value: product.unitOfMeasure },
    { label: 'Pieces/Box',      value: product.piecesPerBox },
    { label: 'Weight/Box',      value: product.weightPerBoxKg ? `${product.weightPerBoxKg} kg` : '—' },
    { label: 'Status',          value: <StatusBadge status={product.isDeleted ? 'DELETED' : product.status} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Modals */}
      {showAddVariant && <AddVariantModal productId={product.id} onClose={() => setShowAddVariant(false)} />}
      {editingVariant && <EditVariantModal productId={product.id} variant={editingVariant} onClose={() => setEditingVariant(null)} />}

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">SKU: {product.sku}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/app/products')}>
            Back
          </Button>
          {canManage && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddVariant(true)}>
              Add Variant
            </Button>
          )}
        </div>
      </div>

      {/* ── 2-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-6 items-start">

        {/* ── LEFT: Product Info + Health ── */}
        <div className="space-y-6">

          {/* Product Info Card */}
          <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Product Info</h2>
            <div className="space-y-2.5">
              {infoRows.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-2 items-center">
                  <span className="text-[13px] text-gray-500">{label}</span>
                  <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Variant Health Card */}
          <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Variant Health</h2>
              <span className="text-xs text-gray-400">{product.variants.length} total</span>
            </div>
            
            <div className="mt-4 flex flex-col items-center justify-center">
              <div className="w-full space-y-6">
                <div className="flex justify-center items-center h-[160px]">
                  <DonutChart data={variantHealthSlices} height={160} showLegend={false} />
                </div>
                <div className="flex flex-col gap-2 w-full pt-2 border-t border-gray-50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                      <span className="text-gray-600">Active</span>
                    </div>
                    <span className="font-semibold">{activeCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#e5e7eb]" />
                      <span className="text-gray-600">Inactive</span>
                    </div>
                    <span className="font-semibold">{inactiveCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Variants ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Colour Variants ({product.variants.length})</h2>

          {product.variants.length === 0 ? (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16">
              <Package className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">No variants yet</p>
              {canManage && (
                <Button variant="outline" size="sm" className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddVariant(true)}>
                  Add First Variant
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {product.variants.map(v => {
                const available = (v.inventoryStock?.totalBoxes ?? 0) - (v.inventoryStock?.reservedBoxes ?? 0);
                const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join(' × ');
                const isGenerating = generatingLabels.includes(v.id);

                return (
                  <div key={v.id} className={`bg-white rounded-[10px] border shadow-sm transition-all overflow-hidden ${v.isActive ? 'border-gray-100' : 'border-gray-50 opacity-60'}`}>
                    <div className="p-4">
                      {/* Header row: Name + Badge + Stock */}
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base font-bold text-gray-900 truncate">{v.colourName}</span>
                          <span className="font-mono text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-100 flex-shrink-0">{v.colourCode}</span>
                          <StatusBadge status={v.status} />
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900 tabular-nums">{available}</div>
                          <div className="text-[10px] text-gray-400 uppercase font-semibold">boxes</div>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="flex flex-col gap-1.5 mb-5">
                        {dims && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Ruler className="h-3.5 w-3.5 opacity-40" />
                            <span>{dims} mm</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Barcode className="h-3.5 w-3.5 opacity-40" />
                          <span className="font-mono">Barcode: {v.barcodeValue}</span>
                        </div>
                        {v.mrpPaise != null && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Tag className="h-3.5 w-3.5 opacity-40" />
                            <span className="font-medium">MRP: <span className="text-gray-900">₹{(v.mrpPaise / 100).toFixed(2)}</span></span>
                          </div>
                        )}
                      </div>

                      {/* Footer actions */}
                      <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<QrCode className="h-4 w-4" />}
                          loading={isGenerating}
                          onClick={() => handleGenerateLabel(v.id)}
                        >
                          Label
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Edit2 className="h-4 w-4" />}
                            onClick={() => setEditingVariant(v)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
