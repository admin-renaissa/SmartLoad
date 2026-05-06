import React from 'react';
import { Product, ProductVariant } from '@smartload/shared';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  product: Product & { variants: (ProductVariant & { inventoryStock: { totalBoxes: number } | null })[] };
}

export const ProductPrintSummary: React.FC<Props> = ({ product }) => {
  const stats = {
    totalVariants: product.variants.length,
    totalStock: product.variants.reduce((acc, v) => acc + (v.inventoryStock?.totalBoxes ?? 0), 0),
    activeVariants: product.variants.filter(v => v.isActive).length,
  };

  return (
    <div className="p-8 bg-white text-black print:p-0" id="product-summary-print">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-900 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter">Product Technical Summary</h1>
          <p className="text-gray-500 mt-1">Generated on {new Date().toLocaleString('en-IN')}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-accent">SMARTLOAD</div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-widest">Enterprise Inventory System</div>
        </div>
      </div>

      {/* Main Info */}
      <div className="grid grid-cols-2 gap-10 mb-10">
        <div className="space-y-4">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Basic Specifications</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Product Name</span><span className="font-bold">{product.name}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">SKU</span><span className="font-mono font-bold text-accent">{product.sku}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Category</span><span className="font-bold">{product.category?.name || 'N/A'}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">HSN Code</span><span className="font-bold">{product.hsnCode || 'N/A'}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Material Type</span><span className="font-bold">{product.materialType || 'Standard'}</span></div>
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Operational Data</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Unit of Measure</span><span className="font-bold">{product.unitOfMeasure}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Pieces / Box</span><span className="font-bold">{product.piecesPerBox}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Weight / Box</span><span className="font-bold">{product.weightPerBoxKg ? `${product.weightPerBoxKg} kg` : 'N/A'}</span></div>
            <div className="flex justify-between text-sm"><span className="font-medium text-gray-500">Lifecycle Status</span><span className="font-bold text-green-600">{product.status}</span></div>
          </div>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-3 gap-4 mb-10 bg-gray-50 p-6 rounded-xl border border-gray-100">
        <div className="text-center">
          <div className="text-2xl font-black">{stats.totalVariants}</div>
          <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Total Variants</div>
        </div>
        <div className="text-center border-x border-gray-200">
          <div className="text-2xl font-black text-green-600">{stats.totalStock}</div>
          <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Total Stock (Boxes)</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black">{stats.activeVariants}</div>
          <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Active Variants</div>
        </div>
      </div>

      {/* Variants Table */}
      <div className="mb-10">
        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Variant Inventory Matrix</h2>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-900 text-white text-[10px] uppercase font-black tracking-widest">
              <th className="p-3 border border-gray-800">Code</th>
              <th className="p-3 border border-gray-800">Color / Variant</th>
              <th className="p-3 border border-gray-800">Dimensions</th>
              <th className="p-3 border border-gray-800">MRP (INR)</th>
              <th className="p-3 border border-gray-800">Stock</th>
              <th className="p-3 border border-gray-800">QR Payload</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((v, i) => {
              const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join('×');
              return (
                <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-3 border border-gray-200 font-mono text-xs font-bold">{v.colourCode}</td>
                  <td className="p-3 border border-gray-200 font-bold text-sm">{v.colourName}</td>
                  <td className="p-3 border border-gray-200 text-sm">{dims || 'Std'}</td>
                  <td className="p-3 border border-gray-200 font-bold text-sm">₹{(v.mrpPaise ? v.mrpPaise / 100 : 0).toFixed(2)}</td>
                  <td className="p-3 border border-gray-200 font-black text-sm">{v.inventoryStock?.totalBoxes ?? 0}</td>
                  <td className="p-3 border border-gray-200 text-[8px] font-mono break-all max-w-[150px]">{v.barcodeValue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-10 border-t border-gray-100 flex justify-between items-end">
        <div className="text-[9px] text-gray-400 italic">
          * This is a system-generated technical summary for internal audit purposes.<br />
          * All stock values are subject to real-time reconciliation.
        </div>
        <div className="flex items-center gap-2">
           <div className="w-10 h-10 bg-gray-100 flex items-center justify-center rounded">
              <QRCodeSVG value={product.id} size={32} />
           </div>
           <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Verification ID: {product.id.slice(0,8)}</div>
        </div>
      </div>

      {/* Print Specific Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #product-summary-print, #product-summary-print * { visibility: visible; }
          #product-summary-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}} />
    </div>
  );
};
