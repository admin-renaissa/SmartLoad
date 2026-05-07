import { useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, QrCode, Edit2, Package,
  Ruler, Barcode, Tag, CheckCircle2, XCircle,
  TrendingUp, AlertTriangle, History, Info,
  Box, Maximize2, Layers, Truck, Clock,
  MoreHorizontal, Download, Printer, Archive,
  ShieldCheck, FileText, ChevronRight, X, Trash2, RotateCcw, Copy, Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';

import { Button } from '../../components/ui/Button.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import { StatsCard } from '../../components/ui/StatsCard.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { cn } from '../../utils/cn.ts';

import { ProductStatus } from '@smartload/shared';
import type { Product, ProductVariant } from '@smartload/shared';
import { ProductPrintSummary } from './ProductPrintSummary.tsx';

/* ─── Types & Interfaces ─────────────────────────────────────────────────── */

interface ExtendedVariant extends ProductVariant {
  inventoryStock: { totalBoxes: number; reservedBoxes: number } | null;
}

interface ExtendedProduct extends Omit<Product, 'variants'> {
  variants: ExtendedVariant[];
}

/* ─── Constants ───────────────────────────────────────────────────────────── */

const HEALTH_COLORS = ['#22c55e', '#e5e7eb', '#f59e0b'];

/* ─── Helper: Parse Barcode JSON ─────────────────────────────────────────── */

function parseBarcode(barcode: string): any {
  try {
    if (barcode.startsWith('{')) {
      return JSON.parse(barcode);
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── Components ─────────────────────────────────────────────────────────── */

const SectionTitle = ({ title, icon: Icon }: { title: string; icon?: any }) => (
  <div className="flex items-center gap-2 mb-4">
    {Icon && <Icon className="h-4 w-4 text-text-secondary" />}
    <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">{title}</h2>
  </div>
);

const DetailRow = ({ label, value, icon: Icon, className }: { label: string; value: React.ReactNode; icon?: any; className?: string }) => (
  <div className={cn("flex items-center justify-between py-2 border-b border-border last:border-0", className)}>
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 text-text-secondary/50" />}
      <span className="text-xs font-medium text-text-secondary uppercase tracking-tight">{label}</span>
    </div>
    <div className="text-sm font-semibold text-text-primary">{value}</div>
  </div>
);

/* ─── Main Page ──────────────────────────────────────────────────────────────*/

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('products:manage');
  
  const [activeTab, setActiveTab] = useState<'variants' | 'inventory' | 'activity'>('variants');
  const [generatingLabels, setGeneratingLabels] = useState<string[]>([]);
  
  // Modal States
  const [qrVariant, setQrVariant] = useState<ExtendedVariant | null>(null);
  const [editVariant, setEditVariant] = useState<ExtendedVariant | null>(null);
  const [deleteVariant, setDeleteVariant] = useState<ExtendedVariant | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch Product Data
  const { data: product, isLoading } = useQuery<ExtendedProduct>({
    queryKey: ['product', id],
    queryFn: async () => { 
      const r = await api.get(`/products/${id}`); 
      return r.data.data; 
    },
    enabled: !!id && id !== 'new',
  });

  // Mutations
  const updateVariantMutation = useMutation({
    mutationFn: async (vars: any) => {
      await api.patch(`/products/${id}/variants/${editVariant?.id}`, vars);
    },
    onSuccess: () => {
      toast.success('Variant updated');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      setEditVariant(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update variant')
  });

  const archiveVariantMutation = useMutation({
    mutationFn: async (variantId: string) => {
      await api.post(`/products/${id}/variants/${variantId}/archive`);
    },
    onSuccess: () => {
      toast.success('Variant archived');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      setDeleteVariant(null);
    }
  });

  const restoreVariantMutation = useMutation({
    mutationFn: async (variantId: string) => {
      await api.post(`/products/${id}/variants/${variantId}/restore`);
    },
    onSuccess: () => {
      toast.success('Variant restored');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    }
  });

  // Stats Calculations
  const stats = useMemo(() => {
    if (!product) return null;
    const variants = product.variants || [];
    const active = variants.filter(v => v.isActive && v.status !== ProductStatus.ARCHIVED).length;
    const totalStock = variants.reduce((acc, v) => acc + (v.inventoryStock?.totalBoxes ?? 0), 0);
    const lowStockCount = variants.filter(v => (v.inventoryStock?.totalBoxes ?? 0) < (product.minStockAlert || 10)).length;
    
    return {
      totalVariants: variants.length,
      activeVariants: active,
      archivedVariants: variants.length - active,
      totalStock,
      lowStockCount
    };
  }, [product]);

  // Chart Data
  const healthData = useMemo(() => {
    if (!product) return [];
    const active = product.variants.filter(v => v.isActive && v.status !== ProductStatus.ARCHIVED).length;
    const inactive = product.variants.length - active;
    return [
      { name: 'Active', value: active },
      { name: 'Inactive/Archived', value: inactive }
    ];
  }, [product]);

  const stockDistribution = useMemo(() => {
    if (!product) return [];
    return product.variants
      .map(v => ({
        name: v.colourName,
        stock: v.inventoryStock?.totalBoxes ?? 0
      }))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 5);
  }, [product]);

  // Handlers
  async function handleGenerateLabel(variantId: string) {
    setGeneratingLabels(prev => [...prev, variantId]);
    try {
      const r = await api.post('/variants/generate-labels', { 
        variantIds: [variantId],
        orderInfo: undefined 
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to generate label'); }
    finally { setGeneratingLabels(prev => prev.filter(v => v !== variantId)); }
  }

  function handlePrintSummary() {
    setIsPrinting(true);
    toast.loading('Generating printable report...', { id: 'print-loading' });
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
      toast.dismiss('print-loading');
    }, 1200);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-text-secondary animate-pulse font-medium">Loading enterprise resources...</p>
    </div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center py-24 text-text-secondary/50">
      <Package className="h-16 w-16 mb-4 opacity-20" />
      <p className="text-lg font-semibold text-text-secondary">Product not found</p>
      <Button variant="outline" className="mt-6" onClick={() => navigate('/app/products')}>Return to Inventory</Button>
    </div>
  );

  return (
    <>
      {/* Hidden Print Content */}
      <div className="print-only">
        <ProductPrintSummary product={product} />
      </div>

      <div className="max-w-[1600px] mx-auto pb-12 px-4 no-print">
      
      {/* ── Breadcrumbs & Top Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/app/products')}
            className="p-2 hover:bg-surface rounded-full border border-transparent hover:border-border transition-all shadow-none hover:shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 text-text-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-widest mb-1">
              <Layers className="h-3 w-3" />
              <span>{product.category?.name || 'Uncategorized'}</span>
              <ChevronRight className="h-3 w-3 text-text-secondary/30" />
              <span>Product Details</span>
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">{product.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            icon={<Printer className="h-4 w-4" />}
            onClick={handlePrintSummary}
            loading={isPrinting}
          >
            Print Summary
          </Button>
          {canManage && (
            <Link to={`/app/products/${product.id}/edit`}>
              <Button size="sm" icon={<Edit2 className="h-4 w-4" />}>Edit Product</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
        
        {/* ── LEFT SIDEBAR (Sticky) ── */}
        <aside className="lg:sticky lg:top-24 space-y-6">
          
          {/* Main Identity Card */}
          <Card className="overflow-hidden border-border shadow-xl shadow-black/5">
            <div className="h-48 bg-surface flex items-center justify-center border-b border-border relative group">
              <Package className="h-20 w-20 text-gray-200 group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute top-4 right-4">
                <StatusBadge status={product.status} />
              </div>
            </div>
            <CardContent className="p-6">
              <div className="space-y-1 mb-6">
                <div className="text-[10px] font-black text-text-secondary/50 uppercase tracking-[0.2em]">Stock Keeping Unit</div>
                <div className="text-xl font-mono font-bold text-accent">{product.sku}</div>
              </div>

              <div className="space-y-0.5">
                <DetailRow label="HSN Code" value={product.hsnCode || '—'} icon={ShieldCheck} />
                <DetailRow label="Unit Type" value={product.unitOfMeasure} icon={Box} />
                <DetailRow label="Weight/Box" value={product.weightPerBoxKg ? `${product.weightPerBoxKg} kg` : '—'} icon={Maximize2} />
                <DetailRow label="Pcs/Box" value={product.piecesPerBox} icon={Layers} />
                <DetailRow label="Material" value={product.materialType || 'Standard'} icon={Info} />
              </div>

              <div className="mt-8 pt-6 border-t border-border grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-bold text-text-primary">{stats?.totalVariants}</div>
                  <div className="text-[10px] text-text-secondary/50 uppercase font-black tracking-widest">Variants</div>
                </div>
                <div className="border-l border-border">
                  <div className="text-xl font-bold text-green-600">{stats?.totalStock}</div>
                  <div className="text-[10px] text-text-secondary/50 uppercase font-black tracking-widest">Total Stock</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Health Card */}
          <Card className="border-gray-100 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Inventory Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={healthData}
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {healthData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={HEALTH_COLORS[index % HEALTH_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between mt-2 px-4">
                <div className="text-center">
                  <div className="text-sm font-bold text-text-primary">{stats?.activeVariants}</div>
                  <div className="text-[9px] text-text-secondary/50 uppercase font-bold">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-text-secondary/50">{stats?.archivedVariants}</div>
                  <div className="text-[9px] text-text-secondary/50 uppercase font-bold">Inactive</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="space-y-8">
          
          {/* Section 1: Overview */}
          <Card className="border-border shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-surface to-card px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-card rounded-lg shadow-sm">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Product Overview</h2>
              </div>
              <div className="flex gap-2">
                {(product.tags || []).map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-surface text-text-secondary rounded text-[10px] font-bold uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">Description</h3>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {product.description || "No description provided for this product catalogue entry."}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">Usage & Applications</h3>
                    <p className="text-sm text-text-secondary leading-relaxed italic">
                      {product.usageGuide || "Standard industrial usage patterns apply."}
                    </p>
                  </div>
                </div>
                <div className="space-y-6">
                   <div>
                    <h3 className="text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">Packaging Details</h3>
                    <p className="text-sm text-text-secondary leading-relaxed italic">
                      {product.packagingDetails || "Standard pallet packaging."}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Tabs (Variants, Inventory, Activity) */}
          <div className="space-y-6">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {[
                { id: 'variants', label: 'Product Variants', icon: Layers },
                { id: 'inventory', label: 'Stock Analytics', icon: TrendingUp },
                { id: 'activity', label: 'Activity Timeline', icon: History }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 relative shrink-0",
                    activeTab === tab.id 
                      ? "text-accent border-accent" 
                      : "text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50/50"
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {tab.id === 'variants' && (
                    <span className="ml-2 px-1.5 py-0.5 bg-surface text-text-secondary text-[10px] rounded-full">
                      {product.variants.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'variants' && (
                <motion.div 
                  key="variants"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {product.variants.length === 0 ? (
                    <div className="bg-card rounded-xl border border-dashed border-border flex flex-col items-center justify-center py-20">
                      <Layers className="h-12 w-12 text-text-secondary/20 mb-4" />
                      <p className="text-text-secondary font-medium">No variants defined</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {product.variants.map(v => {
                        const available = (v.inventoryStock?.totalBoxes ?? 0) - (v.inventoryStock?.reservedBoxes ?? 0);
                        const isGenerating = generatingLabels.includes(v.id);
                        const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join(' × ');
                        const isArchived = v.status === ProductStatus.ARCHIVED || !v.isActive;

                        return (
                          <div 
                            key={v.id} 
                            className={cn(
                              "bg-card rounded-2xl border transition-all duration-300 hover:shadow-lg hover:shadow-black/5 group relative overflow-hidden",
                              isArchived ? "border-border/50 opacity-60 grayscale-[0.5]" : "border-border"
                            )}
                          >
                            <div className="flex flex-col md:flex-row md:items-center gap-6 p-5">
                              {/* Color Chip */}
                              <div className="flex-shrink-0 w-16 h-16 rounded-2xl shadow-inner border border-border flex items-center justify-center bg-surface overflow-hidden">
                                <div 
                                  className="w-10 h-10 rounded-full shadow-lg" 
                                  style={{ backgroundColor: v.colourCode.startsWith('#') ? v.colourCode : 'var(--bg-secondary)' }} 
                                />
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className="text-base font-bold text-text-primary truncate">{v.colourName}</h4>
                                  <span className="text-[10px] font-black bg-surface text-text-secondary px-2 py-0.5 rounded uppercase tracking-wider">
                                    {v.colourCode}
                                  </span>
                                  <StatusBadge status={v.status} className="scale-90 origin-left" />
                                </div>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                                  <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                                    <Ruler className="h-3.5 w-3.5 text-text-secondary/30" />
                                    {dims || 'Standard'} mm
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-text-secondary/50 font-mono">
                                    <Barcode className="h-3.5 w-3.5 text-text-secondary/20" />
                                    {v.barcodeValue.length > 20 ? v.barcodeValue.slice(0, 20) + '...' : v.barcodeValue}
                                  </div>
                                  {v.mrpPaise && (
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                                      <Tag className="h-3.5 w-3.5 text-accent/40" />
                                      ₹{(v.mrpPaise / 100).toFixed(2)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Inventory Stat */}
                              <div className="flex-shrink-0 text-center px-6 border-x border-border hidden md:block">
                                <div className={cn("text-2xl font-black tabular-nums", available < 10 ? "text-red-500" : "text-text-primary")}>
                                  {available}
                                </div>
                                <div className="text-[10px] text-text-secondary/50 uppercase font-black tracking-widest">Available</div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-10 w-10 p-0 rounded-xl"
                                  title="QR & Barcode"
                                  onClick={() => setQrVariant(v)}
                                >
                                  <QrCode className="h-4 w-4" />
                                </Button>
                                {canManage && (
                                  <>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="h-10 w-10 p-0 rounded-xl"
                                      title="Edit Variant"
                                      onClick={() => setEditVariant(v)}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <div className="h-8 w-px bg-gray-100 mx-1" />
                                    {isArchived ? (
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-10 w-10 p-0 rounded-xl text-accent hover:bg-accent/10"
                                        title="Restore"
                                        onClick={() => restoreVariantMutation.mutate(v.id)}
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-10 w-10 p-0 rounded-xl text-text-secondary/50 hover:text-red-500 hover:bg-red-500/10"
                                        title="Archive"
                                        onClick={() => setDeleteVariant(v)}
                                      >
                                        <Archive className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            
                            <div className="h-1 bg-surface w-full overflow-hidden">
                              <div 
                                className={cn("h-full transition-all duration-1000", available < 10 ? "bg-red-400" : "bg-accent/40")}
                                style={{ width: `${Math.min(100, (available / 200) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ── MODALS ── */}

      {/* 1. QR & Barcode Modal */}
      <AnimatePresence>
        {qrVariant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setQrVariant(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden z-10 border border-border"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-text-primary">Variant Identity</h3>
                  <p className="text-xs text-text-secondary">{qrVariant.colourName} ({qrVariant.colourCode})</p>
                </div>
                <button onClick={() => setQrVariant(null)} className="p-2 hover:bg-surface rounded-full transition-colors">
                  <X className="h-5 w-5 text-text-secondary/50" />
                </button>
              </div>
              <div className="p-8 flex flex-col items-center space-y-8">
                <div className="p-4 bg-white border-4 border-surface rounded-3xl shadow-inner">
                  <QRCodeSVG value={qrVariant.barcodeValue} size={200} level="H" />
                </div>
                <div className="w-full space-y-4">
                   <div className="bg-surface p-4 rounded-2xl flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Full Barcode Payload</p>
                        <p className="text-xs font-mono font-bold text-text-primary truncate">{qrVariant.barcodeValue}</p>
                      </div>
                      <button onClick={() => copyToClipboard(qrVariant.barcodeValue)} className="p-2 hover:bg-card rounded-xl shadow-sm border border-transparent hover:border-border">
                        <Copy className="h-4 w-4 text-accent" />
                      </button>
                   </div>
                   <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" icon={<Download className="h-4 w-4" />} onClick={() => toast.success('QR Downloaded')}>QR PNG</Button>
                      <Button className="flex-1" icon={<Printer className="h-4 w-4" />} onClick={() => handleGenerateLabel(qrVariant.id)}>Print Label</Button>
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Edit Variant Modal */}
      <AnimatePresence>
        {editVariant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setEditVariant(null)}
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="absolute right-0 top-0 bottom-0 bg-card shadow-2xl w-full max-w-lg overflow-y-auto z-10 flex flex-col border-l border-border"
            >
               <div className="p-8 border-b border-border flex items-center justify-between bg-surface/50">
                  <div>
                    <h3 className="text-2xl font-black text-text-primary">Edit Variant</h3>
                    <p className="text-sm text-text-secondary">Update inventory and technical specifications</p>
                  </div>
                  <button onClick={() => setEditVariant(null)} className="p-2 hover:bg-surface rounded-full shadow-sm">
                    <X className="h-6 w-6 text-text-secondary/50" />
                  </button>
               </div>
               <div className="p-8 space-y-8 flex-1">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest ml-1">Display Name</label>
                      <input 
                        defaultValue={editVariant.colourName} 
                        onChange={(e) => setEditVariant({...editVariant, colourName: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl border border-border bg-card text-text-primary focus:ring-4 focus:ring-accent/10 focus:border-accent outline-none font-bold" 
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                       <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Length (mm)</label>
                        <input type="number" defaultValue={editVariant.lengthMm || ''} onChange={(e) => setEditVariant({...editVariant, lengthMm: Number(e.target.value)})} className="w-full h-12 px-4 rounded-xl border border-border bg-card text-text-primary outline-none" />
                       </div>
                       <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Width (mm)</label>
                        <input type="number" defaultValue={editVariant.widthMm || ''} onChange={(e) => setEditVariant({...editVariant, widthMm: Number(e.target.value)})} className="w-full h-12 px-4 rounded-xl border border-border bg-card text-text-primary outline-none" />
                       </div>
                       <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Thick (mm)</label>
                        <input type="number" defaultValue={editVariant.thicknessMm || ''} onChange={(e) => setEditVariant({...editVariant, thicknessMm: Number(e.target.value)})} className="w-full h-12 px-4 rounded-xl border border-border bg-card text-text-primary outline-none" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">MRP (Paise)</label>
                      <input type="number" defaultValue={editVariant.mrpPaise || ''} onChange={(e) => setEditVariant({...editVariant, mrpPaise: Number(e.target.value)})} className="w-full h-12 px-4 rounded-xl border border-border bg-card text-text-primary outline-none font-bold text-accent" />
                    </div>
                  </div>
               </div>
               <div className="p-8 border-t border-border flex gap-4 bg-surface/30">
                  <Button variant="outline" className="flex-1" onClick={() => setEditVariant(null)}>Cancel</Button>
                  <Button 
                    className="flex-1 shadow-lg shadow-accent/20" 
                    icon={<Save className="h-4 w-4" />}
                    loading={updateVariantMutation.isPending}
                    onClick={() => updateVariantMutation.mutate(editVariant)}
                  >
                    Save Changes
                  </Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Delete/Archive Confirmation Modal */}
      <AnimatePresence>
        {deleteVariant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setDeleteVariant(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden z-10 p-8 text-center border border-border"
            >
               <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="h-10 w-10" />
               </div>
               <h3 className="text-xl font-black text-text-primary mb-2">Archive Variant?</h3>
               <p className="text-sm text-text-secondary mb-8">
                 Are you sure you want to archive <span className="font-bold text-text-primary">{deleteVariant.colourName}</span>? 
                 This will hide it from active catalogs but preserve historical inventory data.
               </p>
               <div className="flex flex-col gap-3">
                  <Button 
                    variant="ghost" 
                    className="text-red-600 hover:bg-red-50 font-bold" 
                    icon={<Archive className="h-4 w-4" />}
                    loading={archiveVariantMutation.isPending}
                    onClick={() => archiveVariantMutation.mutate(deleteVariant.id)}
                  >
                    Confirm Archive
                  </Button>
                  <Button variant="outline" onClick={() => setDeleteVariant(null)}>Keep Variant</Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
    </>
  );
}
