import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import api from '../../lib/axios.ts';
import { useCreateGRN } from '../../hooks/useInventory.ts';
import { usePermission } from '../../hooks/usePermission.ts';

type Line = {
  variantId: string;
  receivedBoxes: number;
  sku: string;
  productName: string;
  colourName: string;
  colourCode: string;
  dim: string;
  piecesPerBox: number;
  currentStock: number;
};

export default function GRNCreatePage() {
  const navigate = useNavigate();
  const canCreate = usePermission('grn:create');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProductId, setPickProductId] = useState<string | null>(null);
  const [variantIdDraft, setVariantIdDraft] = useState('');
  const [boxesDraft, setBoxesDraft] = useState(1);

  const { data: searchProducts } = useQuery({
    queryKey: ['grn-product-search', search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const r = await api.get(`/products?search=${encodeURIComponent(search)}&limit=10&status=ACTIVE`);
      return r.data.data as { id: string; sku: string; name: string }[];
    },
  });

  const { data: pickedProduct } = useQuery({
    queryKey: ['grn-product', pickProductId],
    enabled: !!pickProductId,
    queryFn: async () => {
      const r = await api.get(`/products/${pickProductId}`);
      return r.data.data as {
        sku: string;
        name: string;
        piecesPerBox: number;
        variants: Record<string, unknown>[];
      };
    },
  });

  const mu = useCreateGRN();

  const dims = (v: Record<string, unknown>) => {
    const fmt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? String(x) : '—');
    const L = v.lengthMm;
    const W = v.widthMm;
    const T = v.thicknessMm;
    return [L, W, T].every((x) => x == null) ? '—' : `${fmt(L)}×${fmt(W)}×${fmt(T)} mm`;
  };

  const addLine = (
    vid: string,
    boxes: number,
    meta?: {
      sku: string;
      productName: string;
      colourName: string;
      colourCode: string;
      piecesPerBox: number;
      currentStock: number;
      dim: string;
    },
  ) => {
    if (lines.some((l) => l.variantId === vid)) {
      toast.error('This variant is already on the GRN');
      return;
    }
    if (!meta || !pickedProduct) return;
    setLines([
      ...lines,
      {
        variantId: vid,
        receivedBoxes: boxes,
        sku: meta.sku,
        productName: meta.productName,
        colourName: meta.colourName,
        colourCode: meta.colourCode,
        dim: meta.dim,
        piecesPerBox: meta.piecesPerBox,
        currentStock: meta.currentStock,
      },
    ]);
    toast.success('Item added');
  };

  const totalPieces = lines.reduce((s, li) => s + li.receivedBoxes * li.piecesPerBox, 0);

  if (!canCreate)
    return <p className="p-8 text-center text-text-secondary">You do not have access to create GRNs.</p>;

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        title="Receive Goods (GRN)"
        subtitle="Goods Receipt Note inward entry"
        actions={
          <Link to="/app/inventory/grn">
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-secondary font-medium">Received Date *</label>
              <input
                type="date"
                className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary font-medium">Notes / reference</label>
              <textarea
                className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-text-primary">Items Received</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-primary">{lines.length}</span>
          </div>

          <div className="border border-border rounded-xl p-4 space-y-3 bg-surface/30">
            <p className="text-xs text-text-secondary font-medium">Pick product → choose variant → set boxes → Add item</p>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Search SKU or product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchProducts && searchProducts.length > 0 && (
              <div className="border border-border rounded-lg bg-card divide-y divide-border max-h-40 overflow-y-auto shadow-lg">
                {searchProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-surface text-sm transition-colors"
                    onClick={() => {
                      setPickProductId(p.id);
                      setVariantIdDraft('');
                    }}
                  >
                    <span className="font-mono text-accent text-xs">{p.sku}</span> · {p.name}
                  </button>
                ))}
              </div>
            )}

            {pickedProduct?.variants?.length ?
              <>
                <div>
                  <label className="text-xs text-text-secondary font-medium">Variant</label>
                  <select
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                    value={variantIdDraft}
                    onChange={(e) => setVariantIdDraft(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {pickedProduct.variants.map((vx) => {
                      const stock = vx.inventoryStock as { totalBoxes: number } | null | undefined;
                      const avail = stock?.totalBoxes ?? 0;
                      return (
                        <option key={vx.id as string} value={vx.id as string}>
                          {(vx.colourName as string)} ({vx.colourCode as string}) — stock {avail}{' '}
                          boxes · {dims(vx)}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-xs text-text-secondary font-medium">Boxes Received</label>
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-28 border border-border rounded-lg px-3 py-2 text-sm bg-card text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                      value={boxesDraft}
                      onChange={(e) => setBoxesDraft(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                  <div className="text-sm text-text-secondary font-medium">
                    Pieces:{' '}
                    <strong className="text-text-primary">{boxesDraft * (pickedProduct.piecesPerBox as number)}</strong> (estimate)
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const v = pickedProduct.variants.find((x) => x.id === variantIdDraft);
                      if (!v) return;
                      const boxes = boxesDraft;
                      const stockRow = v.inventoryStock as { totalBoxes: number } | null | undefined;
                      addLine(variantIdDraft, boxes, {
                        sku: pickedProduct.sku,
                        productName: pickedProduct.name,
                        colourName: v.colourName as string,
                        colourCode: v.colourCode as string,
                        piecesPerBox: pickedProduct.piecesPerBox as number,
                        dim: dims(v),
                        currentStock: stockRow?.totalBoxes ?? 0,
                      });
                      setBoxesDraft(1);
                    }}
                  >
                    Add Item
                  </Button>
                </div>
              </>
            : null}
          </div>

          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-surface text-text-secondary text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">SKU</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Colour</th>
                  <th className="p-3 text-left">Dim</th>
                  <th className="p-3 text-right">Boxes</th>
                  <th className="p-3 text-right">Pieces</th>
                  <th className="p-3 text-right">Current</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((li, i) => (
                  <tr key={li.variantId} className="border-t border-border hover:bg-surface/50 transition-colors">
                    <td className="p-3 text-text-secondary">{i + 1}</td>
                    <td className="p-3 font-mono text-xs text-accent font-bold">{li.sku}</td>
                    <td className="p-3 text-text-primary font-medium">{li.productName}</td>
                    <td className="p-3 text-text-primary">
                      {li.colourName}{' '}
                      <span className="text-text-secondary/50 text-xs">({li.colourCode})</span>
                    </td>
                    <td className="p-3 text-xs text-text-secondary">{li.dim}</td>
                    <td className="p-3 text-right font-black text-text-primary">{li.receivedBoxes}</td>
                    <td className="p-3 text-right text-text-secondary">{li.receivedBoxes * li.piecesPerBox}</td>
                    <td className="p-3 text-right text-text-secondary/60 italic">{li.currentStock}</td>
                    <td className="p-3 text-right">
                      <button type="button" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors" onClick={() => setLines(lines.filter((l) => l.variantId !== li.variantId))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm flex flex-wrap gap-4 justify-end border-t border-border pt-4">
            <span className="text-text-secondary font-medium">Variants: <strong className="text-text-primary">{lines.length}</strong></span>
            <span className="text-text-secondary font-medium">Boxes: <strong className="text-text-primary">{lines.reduce((s, l) => s + l.receivedBoxes, 0)}</strong></span>
            <span className="text-text-secondary font-medium">Pieces: <strong className="text-text-primary">{totalPieces}</strong></span>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-md py-4 px-6 flex gap-3 justify-end z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <Button
          variant="outline"
          onClick={() => toast('Preview GRN summary in the totals above')}
        >
          Preview GRN
        </Button>
        <Button
          disabled={!lines.length || mu.isPending}
          loading={mu.isPending}
          onClick={() => {
            mu.mutate(
              {
                receivedDate,
                notes: notes || undefined,
                lineItems: lines.map((li) => ({
                  variantId: li.variantId,
                  receivedBoxes: li.receivedBoxes,
                })),
              },
              {
                onSuccess: (d: Record<string, unknown>) =>
                  navigate(`/app/inventory/grn/${String(d.id)}`),
              },
            );
          }}
        >
          Create GRN
        </Button>
      </div>
    </div>
  );
}
