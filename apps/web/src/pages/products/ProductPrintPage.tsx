import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';
import { ProductStatus } from '@smartload/shared';
import { cn } from '../../utils/cn.ts';

export default function ProductPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id, 'print'],
    queryFn: async () => {
      const r = await api.get(`/products/${id}`);
      return r.data.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (product) {
      // Small delay to ensure images/QR codes are rendered
      const timer = setTimeout(() => {
        window.print();
        setReady(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [product]);

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-gray-500 font-medium">Preparing printable report...</p>
    </div>
  );

  if (isError || !product) return (
    <div className="min-h-screen flex items-center justify-center text-red-500 font-bold">
      Failed to load product for printing.
    </div>
  );

  const stats = {
    totalVariants: product.variants.length,
    totalStock: product.variants.reduce((acc: any, v: any) => acc + (v.inventoryStock?.totalBoxes ?? 0), 0),
    activeVariants: product.variants.filter((v: any) => v.isActive && v.status === ProductStatus.ACTIVE).length,
  };

  return (
    <div className="bg-white min-h-screen p-0 sm:p-8 md:p-12 text-black font-sans print:p-0">
      <div className="max-w-4xl mx-auto border border-gray-100 p-10 shadow-sm print:border-0 print:shadow-none print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-gray-900 pb-8 mb-10">
          <div>
            <div className="text-4xl font-black tracking-tighter mb-1">SMARTLOAD</div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Technical Documentation</div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold uppercase tracking-tight">Product Summary Report</h1>
            <p className="text-xs text-gray-500 mt-1">Generated: {new Date().toLocaleString('en-IN')}</p>
            <div className="mt-2 text-[10px] font-mono text-gray-400">REF: {product.sku}-{Date.now().toString().slice(-6)}</div>
          </div>
        </div>

        {/* Product Identity */}
        <div className="grid grid-cols-[180px_1fr] gap-10 mb-12">
          <div className="bg-gray-50 aspect-square rounded-2xl flex items-center justify-center border border-gray-100">
            <QRCodeSVG value={product.sku} size={120} level="H" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-[10px] font-black text-accent uppercase tracking-widest mb-2">{product.category?.name || 'Standard Catalog'}</div>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">{product.name}</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <DetailItem label="SKU" value={product.sku} highlight />
              <DetailItem label="HSN Code" value={product.hsnCode || 'N/A'} />
              <DetailItem label="Unit Type" value={product.unitOfMeasure} />
              <DetailItem label="Status" value={product.status} />
            </div>
          </div>
        </div>

        {/* Technical Specs */}
        <div className="grid grid-cols-2 gap-10 mb-12">
          <div className="space-y-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Logistics Configuration</h3>
            <div className="space-y-2">
              <DetailRow label="Pieces per Box" value={product.piecesPerBox} />
              <DetailRow label="Weight per Box" value={product.weightPerBoxKg ? `${product.weightPerBoxKg} kg` : 'N/A'} />
              <DetailRow label="Material Type" value={product.materialType || 'Standard'} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Inventory Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xl font-bold">{stats.totalVariants}</div>
                <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Variants</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xl font-bold text-green-600">{stats.totalStock}</div>
                <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Stock (Boxes)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Variants Matrix */}
        <div className="mb-12">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Variant Inventory Matrix</h3>
          <table className="w-full text-left border-collapse border border-gray-200">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-500">
                <th className="p-3 border border-gray-200">Variant Code</th>
                <th className="p-3 border border-gray-200">Description</th>
                <th className="p-3 border border-gray-200">Dimensions (mm)</th>
                <th className="p-3 border border-gray-200 text-right">Stock</th>
                <th className="p-3 border border-gray-200">Barcode Payload</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v: any, i: number) => {
                 const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join('×');
                 return (
                  <tr key={v.id} className="text-sm">
                    <td className="p-3 border border-gray-200 font-mono font-bold text-xs">{v.colourCode}</td>
                    <td className="p-3 border border-gray-200 font-medium">{v.colourName}</td>
                    <td className="p-3 border border-gray-200">{dims || 'Standard'}</td>
                    <td className="p-3 border border-gray-200 text-right font-bold tabular-nums">{v.inventoryStock?.totalBoxes ?? 0}</td>
                    <td className="p-3 border border-gray-200 text-[8px] font-mono break-all max-w-[200px]">{v.barcodeValue}</td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-gray-100 flex justify-between items-end">
          <div className="space-y-1">
            <p className="text-[9px] text-gray-400 italic">This document is a system-generated technical summary and is valid without signature.</p>
            <p className="text-[9px] text-gray-400 italic">SmartLoad Dispatch System — Enterprise Inventory Module v1.0</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-gray-900 mb-1">APPROVED DOCUMENT</div>
            <div className="h-10 w-32 border border-dashed border-gray-300 rounded flex items-center justify-center">
              <span className="text-[8px] text-gray-300 uppercase font-black">Digital Stamp Area</span>
            </div>
          </div>
        </div>

      </div>

      {/* Global Print Overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}

function DetailItem({ label, value, highlight }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
      <span className={cn("text-sm font-bold", highlight ? "text-accent" : "text-gray-900")}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string, value: any }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-xs font-bold text-gray-900">{value}</span>
    </div>
  );
}
