import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Package, Save, AlertTriangle, Info, 
  Settings, FileText, CheckCircle2, XCircle, Clock,
  Layers, Box, ShieldCheck, Tag, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { cn } from '../../utils/cn.ts';
import api from '../../lib/axios.ts';

import { ProductStatus } from '@smartload/shared';

/* ─── Shared Styles ──────────────────────────────────────────────────────── */

const SECTION_TITLE_CLS = "text-sm font-bold text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2";
const INPUT_GROUP_CLS = "space-y-1.5";
const LABEL_CLS = "block text-xs font-black text-gray-500 uppercase tracking-tight ml-1";
const INPUT_CLS = cn(
  "w-full h-12 px-4 py-2 text-sm bg-white border border-gray-200 rounded-xl transition-all duration-200",
  "placeholder:text-gray-400 outline-none",
  "focus:ring-4 focus:ring-accent/10 focus:border-accent focus:shadow-[0_0_0_1px_rgba(37,99,235,1)]",
  "hover:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
);
const TEXTAREA_CLS = cn(INPUT_CLS, "h-32 py-3 resize-none");

/* ─── Types ──────────────────────────────────────────────────────────────── */

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
  description: string | null;
  materialType: string | null;
  specifications: any | null;
  usageGuide: string | null;
  packagingDetails: string | null;
  tags: string[];
}

/* ─── Components ─────────────────────────────────────────────────────────── */

const FormSection = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-8">
    <h3 className={SECTION_TITLE_CLS}>
      <Icon className="h-4 w-4 text-accent" />
      {title}
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
      {children}
    </div>
  </div>
);

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
    description: '',
    materialType: '',
    usageGuide: '',
    packagingDetails: '',
    tags: '',
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const r = await api.get('/products/categories');
      return r.data.data;
    },
  });

  const { data: product, isLoading: isLoadingProduct } = useQuery<Product>({
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
        description: p.description || '',
        materialType: p.materialType || '',
        usageGuide: p.usageGuide || '',
        packagingDetails: p.packagingDetails || '',
        tags: (p.tags || []).join(', '),
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
        description: form.description.trim() || null,
        materialType: form.materialType.trim() || null,
        usageGuide: form.usageGuide.trim() || null,
        packagingDetails: form.packagingDetails.trim() || null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
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
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  const isValid = form.name.trim() && form.categoryId && Number(form.piecesPerBox) > 0;
  const isArchived = form.status === ProductStatus.ARCHIVED;

  if (isLoadingProduct) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500 font-medium">Fetching product architecture...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* ── Sticky Top Action Bar ── */}
      <header className="sticky top-[-1rem] sm:top-[-1.5rem] z-30 bg-surface/95 backdrop-blur-md border-b border-gray-100 py-4 mb-8 -mx-4 sm:-mx-6 px-4 sm:px-6 flex items-center justify-between transition-all duration-300">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/app/products/${id}`)}
            className="p-2 hover:bg-white rounded-full border border-transparent hover:border-gray-100 transition-all shadow-none hover:shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <Link to="/app/products" className="hover:text-accent">Inventory</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{form.sku || 'Edit'}</span>
            </div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              Edit Product
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn(
            "hidden md:block text-xs font-bold transition-all px-3 py-1 rounded-full",
            mutation.isPending ? "text-amber-600 bg-amber-50" : "text-gray-400 opacity-0"
          )}>
            Saving changes...
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/app/products/${id}`)} className="hidden sm:flex">Cancel</Button>
          <Button 
            size="sm" 
            icon={<Save className="h-4 w-4" />} 
            loading={mutation.isPending}
            disabled={!isValid || (isArchived && form.status === ProductStatus.ARCHIVED)}
            onClick={() => mutation.mutate()}
            className="shadow-lg shadow-accent/20"
          >
            Save Changes
          </Button>
        </div>
      </header>

      {/* ── Warning for Archived ── */}
      <AnimatePresence>
        {isArchived && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex items-center gap-4 text-amber-800">
              <div className="p-3 bg-white rounded-2xl shadow-sm">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-base font-black uppercase tracking-tight">Product Archived</p>
                <p className="text-sm font-medium opacity-80">This product is locked for historical records. Change status to enable editing.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-8">
        
        {/* Section 1: Core Information */}
        <FormSection title="General Information" icon={Info}>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>SKU (Read Only)</label>
            <input value={form.sku} disabled className={cn(INPUT_CLS, "font-mono font-bold")} />
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Product Name *</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. PVC Sheet 4mm White" className={INPUT_CLS} />
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Category *</label>
            <select value={form.categoryId} onChange={set('categoryId')} className={INPUT_CLS}>
              <option value="">Select a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>HSN Code</label>
            <input value={form.hsnCode} onChange={set('hsnCode')} placeholder="e.g. 39204990" className={INPUT_CLS} />
          </div>
        </FormSection>

        {/* Section 2: Inventory Settings */}
        <FormSection title="Inventory & Stocking" icon={Box}>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Unit of Measure</label>
            <select value={form.unitOfMeasure} onChange={set('unitOfMeasure')} className={INPUT_CLS}>
              {['BOX', 'PCS', 'SQM', 'RFT', 'KG'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Weight per Box (kg)</label>
            <input type="number" step="0.01" value={form.weightPerBoxKg} onChange={set('weightPerBoxKg')} placeholder="e.g. 12.5" className={INPUT_CLS} />
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Pieces per Box *</label>
            <input type="number" value={form.piecesPerBox} onChange={set('piecesPerBox')} placeholder="e.g. 10" className={INPUT_CLS} />
          </div>
          <div className={INPUT_GROUP_CLS}>
            <label className={LABEL_CLS}>Low Stock Alert (boxes)</label>
            <input type="number" value={form.minStockAlert} onChange={set('minStockAlert')} placeholder="e.g. 20" className={INPUT_CLS} />
          </div>
        </FormSection>

        {/* Section 3: Technical & Marketing Content */}
        <FormSection title="Content & Specifications" icon={FileText}>
          <div className={cn(INPUT_GROUP_CLS, "md:col-span-2")}>
            <label className={LABEL_CLS}>Material Type</label>
            <input value={form.materialType} onChange={set('materialType')} placeholder="e.g. Rigid PVC / Polycarbonate" className={INPUT_CLS} />
          </div>
          <div className={cn(INPUT_GROUP_CLS, "md:col-span-2")}>
            <label className={LABEL_CLS}>Short Description</label>
            <textarea value={form.description} onChange={set('description')} placeholder="Marketing description or internal notes..." className={TEXTAREA_CLS} />
          </div>
          <div className={cn(INPUT_GROUP_CLS, "md:col-span-2")}>
            <label className={LABEL_CLS}>Usage Guide / Applications</label>
            <textarea value={form.usageGuide} onChange={set('usageGuide')} placeholder="Recommended use cases..." className={TEXTAREA_CLS} />
          </div>
          <div className={cn(INPUT_GROUP_CLS, "md:col-span-2")}>
            <label className={LABEL_CLS}>Packaging Details</label>
            <textarea value={form.packagingDetails} onChange={set('packagingDetails')} placeholder="Standard packing configuration..." className={TEXTAREA_CLS} />
          </div>
          <div className={cn(INPUT_GROUP_CLS, "md:col-span-2")}>
            <label className={LABEL_CLS}>Tags (Comma separated)</label>
            <input value={form.tags} onChange={set('tags')} placeholder="e.g. premium, fire-rated, export-grade" className={INPUT_CLS} />
          </div>
        </FormSection>

        {/* Section 4: Lifecycle Status (Segmented Control) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className={SECTION_TITLE_CLS}>
              <Settings className="h-4 w-4 text-accent" />
              Product Lifecycle Status
            </h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Visibility Control</p>
          </div>
          
          <div className="bg-gray-50 p-1.5 rounded-[22px] flex items-center relative overflow-hidden h-[64px]">
            {[
              { id: ProductStatus.ACTIVE, label: 'Active', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-white shadow-sm' },
              { id: ProductStatus.INACTIVE, label: 'Inactive', icon: XCircle, color: 'text-amber-600', bg: 'bg-white shadow-sm' },
              { id: ProductStatus.ARCHIVED, label: 'Archived', icon: Clock, color: 'text-blue-600', bg: 'bg-white shadow-sm' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, status: s.id as ProductStatus }))}
                className={cn(
                  "flex-1 flex items-center justify-center gap-3 h-full rounded-[18px] transition-all duration-300 z-10 font-bold text-sm",
                  form.status === s.id ? s.color : "text-gray-400 hover:text-gray-600"
                )}
              >
                <s.icon className="h-5 w-5" />
                {s.label}
                {form.status === s.id && (
                  <motion.div 
                    layoutId="status-bg" 
                    className="absolute inset-y-1.5 bg-white shadow-lg shadow-gray-200/50 rounded-[18px] z-[-1]"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    style={{ width: 'calc(33.33% - 6px)' }}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="px-2 text-center">
            <p className="text-xs text-gray-400 font-medium">
              {form.status === ProductStatus.ACTIVE && "Visible to all staff and available for dispatch scans."}
              {form.status === ProductStatus.INACTIVE && "Hidden from new orders but historical records persist."}
              {form.status === ProductStatus.ARCHIVED && "Product record is locked. Read-only for audit purposes."}
            </p>
          </div>
        </div>

        {/* Bottom Save Bar (Mobile Friendly) */}
        <div className="flex justify-end items-center gap-4 pt-4 pb-24">
          <Button variant="ghost" className="text-gray-400" onClick={() => navigate(`/app/products/${id}`)}>Discard Changes</Button>
          <Button 
            size="lg" 
            icon={<Save className="h-5 w-5" />}
            loading={mutation.isPending}
            disabled={!isValid || (isArchived && form.status === ProductStatus.ARCHIVED)}
            onClick={() => mutation.mutate()}
            className="px-12 h-14 rounded-2xl shadow-xl shadow-accent/20"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
