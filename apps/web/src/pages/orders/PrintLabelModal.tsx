import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '../../components/ui/AlertDialog.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Package, QrCode, FileText } from 'lucide-react';
import api from '../../lib/axios.ts';

export interface PrintLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineItem: any;
  orderInfo: {
    poNumber: string;
    clientName: string;
    orderDate: string;
  };
}

export function PrintLabelModal({ isOpen, onClose, lineItem, orderInfo }: PrintLabelModalProps) {
  const [mode, setMode] = useState<'BOX' | 'MASTER' | 'PALLET'>('BOX');
  const [quantity, setQuantity] = useState<number>(lineItem?.orderedBoxes || 1);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!lineItem) return null;

  const handleGenerate = async () => {
    if (quantity < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    if (mode === 'BOX' && quantity > (lineItem.orderedBoxes * 2)) { // Just a sanity check to prevent crazy numbers
        toast.error('Quantity exceeds normal limits. Please double check.');
        return;
    }

    setIsGenerating(true);
    try {
      const r = await api.post(
        '/variants/generate-labels',
        {
          variantIds: [lineItem.variant.id],
          orderInfo: {
            orderId: orderInfo.poNumber,
            clientName: orderInfo.clientName,
            date: new Date(orderInfo.orderDate).toLocaleDateString('en-IN'),
            totalBoxes: lineItem.orderedBoxes,
            printQuantity: quantity,
            printMode: mode,
          },
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(r.data);
      // Open preview in new tab
      window.open(url, '_blank');
      // We don't revoke here immediately because the new tab needs time to load the blob
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onClose();
    } catch {
      toast.error('Failed to generate label');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-accent" />
            Generate QR Labels
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-6 py-4">
          {/* Product Info Summary */}
          <div className="bg-surface rounded-lg p-3 border border-border">
            <p className="text-sm font-semibold text-text-primary">{lineItem.variant.product.name}</p>
            <p className="text-xs text-text-secondary mt-1">
              Variant: <span className="font-medium text-text-primary">{lineItem.variant.colourName}</span> | 
              SKU: <span className="font-mono text-accent">{lineItem.variant.product.sku}</span>
            </p>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
              <div>
                <p className="text-[10px] uppercase text-text-secondary font-medium tracking-wider">Ordered</p>
                <p className="text-sm font-semibold">{lineItem.orderedBoxes} boxes</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-text-secondary font-medium tracking-wider">Loaded</p>
                <p className="text-sm font-semibold">{lineItem.loadedBoxes} boxes</p>
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary mb-1.5 block">Print Mode</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('BOX');
                    setQuantity(lineItem.orderedBoxes);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-colors ${
                    mode === 'BOX' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-text-secondary hover:bg-card'
                  }`}
                >
                  <Package className="h-5 w-5 mb-1.5" />
                  Per Box
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('MASTER');
                    setQuantity(1);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-colors ${
                    mode === 'MASTER' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-text-secondary hover:bg-card'
                  }`}
                >
                  <FileText className="h-5 w-5 mb-1.5" />
                  Master
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('PALLET');
                    setQuantity(1);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-colors ${
                    mode === 'PALLET' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-text-secondary hover:bg-card'
                  }`}
                >
                  <Package className="h-5 w-5 mb-1.5" />
                  Pallet
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-text-primary mb-1.5 block">Number of Labels to Print</label>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-card transition-colors text-text-primary"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="flex-1 h-10 text-center rounded-lg border border-border bg-surface text-text-primary focus:ring-2 focus:ring-accent/50 outline-none font-medium"
                />
                <button 
                  type="button" 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-card transition-colors text-text-primary"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                {mode === 'BOX' && `Will generate ${quantity} individual box labels with serialized tracking (1/${quantity}, 2/${quantity}...).`}
                {mode === 'MASTER' && `Will generate a single master label summarizing ${lineItem.orderedBoxes} boxes.`}
                {mode === 'PALLET' && `Will generate ${quantity} pallet labels summarizing the load.`}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleGenerate} loading={isGenerating} icon={<QrCode className="w-4 h-4" />}>
            Generate PDF
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
