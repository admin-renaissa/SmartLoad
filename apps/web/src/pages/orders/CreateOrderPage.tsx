import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Search, ArrowLeft, ShoppingCart, CheckCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.tsx';
import api from '../../lib/axios.ts';

interface Client { id: string; name: string; clientCode: string; phone: string; }
interface Variant {
  id: string;
  colourCode: string;
  colourName: string;
  barcodeValue: string;
  lengthMm: number | null;
  widthMm: number | null;
  thicknessMm: number | null;
  product: { id: string; sku: string; name: string; piecesPerBox: number };
  inventoryStock: { totalBoxes: number; reservedBoxes: number } | null;
}
interface LineItem {
  variant: Variant;
  orderedBoxes: number;
  ratePerBox: number;
  gstPercent: number;
}

function LoadingSpinner({ size }: { size?: 'sm' | 'lg' }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-gray-200 border-t-accent ${size === 'lg' ? 'h-8 w-8' : 'h-4 w-4'}`} />
  );
}

export default function CreateOrderPage() {
  const navigate = useNavigate();

  // ── Client selection ──────────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientTouched, setClientTouched] = useState(false);

  // ── Order details ─────────────────────────────────────────────────────────
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDispatchDate, setExpectedDispatchDate] = useState('');
  const [notes, setNotes] = useState('');

  // ── Line items ────────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [showVariantSearch, setShowVariantSearch] = useState(false);
  const variantSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [variantResults, setVariantResults] = useState<Variant[]>([]);
  const [searchingVariants, setSearchingVariants] = useState(false);

  // ── Submit state ──────────────────────────────────────────────────────────
  const [hasAttempted, setHasAttempted] = useState(false);

  // ── Client search query ───────────────────────────────────────────────────
  // 1. Default list — loads as soon as the dropdown opens, even with no text
  const { data: defaultClients = [], error: defaultClientsError } = useQuery<Client[]>({
    queryKey: ['clients-default'],
    queryFn: async () => {
      const r = await api.get('/clients?limit=10&page=1');
      // GET /clients returns { data: Client[], meta: ... }
      return (r.data.data ?? []) as Client[];
    },
    enabled: clientDropdownOpen && !selectedClient,
    staleTime: 60_000,
  });

  // 2. Search-while-typing (1+ chars)
  const { data: searchResults = [], error: searchError } = useQuery<Client[]>({
    queryKey: ['client-search', clientSearch],
    queryFn: async () => {
      if (!clientSearch || clientSearch.length < 1) return [];
      const r = await api.get(`/clients/search?q=${encodeURIComponent(clientSearch)}&limit=8`);
      return (r.data.data ?? []) as Client[];
    },
    enabled: clientSearch.length >= 1 && !selectedClient,
  });

  // Use search results when typing, otherwise show default list
  const clientResults: Client[] = clientSearch.length >= 1 ? searchResults : defaultClients;
  const clientFetchError = searchError ?? defaultClientsError;
  const isSession401 =
    (clientFetchError as { response?: { status?: number } } | null)?.response?.status === 401;

  function selectClient(c: Client) {
    setSelectedClient(c);
    setClientSearch('');
    setClientDropdownOpen(false);
    setClientTouched(false);
  }

  function clearClient() {
    setSelectedClient(null);
    setClientSearch('');
    setClientTouched(false);
  }

  // When user blurs without selecting → clear the typed text
  function handleClientBlur() {
    setClientTouched(true);
    // Small delay so dropdown clicks register first
    setTimeout(() => {
      if (!selectedClient) {
        setClientSearch('');
        setClientDropdownOpen(false);
      }
    }, 180);
  }

  // ── Variant search ────────────────────────────────────────────────────────
  function handleVariantSearch(q: string) {
    setVariantSearch(q);
    if (variantSearchRef.current) clearTimeout(variantSearchRef.current);
    if (q.length < 2) { setVariantResults([]); return; }
    variantSearchRef.current = setTimeout(async () => {
      setSearchingVariants(true);
      try {
        const r = await api.get(`/products?search=${encodeURIComponent(q)}&limit=5&status=ACTIVE`);
        const products = r.data.data as Array<{ id: string; sku: string; name: string; piecesPerBox: number; variants: Variant[] }>;
        const variants: Variant[] = [];
        for (const p of products) {
          const r2 = await api.get(`/products/${p.id}/variants`);
          const pvs: Variant[] = r2.data.data;
          pvs.forEach((v) => { (v as Variant & { product: typeof p }).product = p; });
          variants.push(...pvs.filter((v) => (v as { isActive?: boolean }).isActive));
        }
        setVariantResults(variants.slice(0, 12));
      } catch { /* noop */ } finally {
        setSearchingVariants(false);
      }
    }, 300);
  }

  function addVariant(v: Variant) {
    if (lineItems.find((li) => li.variant.id === v.id)) {
      toast.error('This variant is already in the order');
      return;
    }
    setLineItems((prev) => [...prev, { variant: v, orderedBoxes: 1, ratePerBox: 0, gstPercent: 18 }]);
    setShowVariantSearch(false);
    setVariantSearch('');
    setVariantResults([]);
  }

  function updateLineItem(idx: number, updates: Partial<Omit<LineItem, 'variant'>>) {
    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, ...updates } : li));
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Computed totals ───────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, li) => s + li.orderedBoxes * li.ratePerBox, 0);
  const gstAmount = lineItems.reduce((s, li) => s + li.orderedBoxes * li.ratePerBox * li.gstPercent / 100, 0);
  const totalAmount = subtotal + gstAmount;

  // ── Validation ────────────────────────────────────────────────────────────
  const clientError = !selectedClient ? 'Please select a client from the list' : null;
  const itemsError = lineItems.length === 0 ? 'Add at least one product' : null;
  const rateErrors = lineItems
    .map((li, i) => li.ratePerBox <= 0 ? i : -1)
    .filter((i) => i >= 0);

  const isValid = !clientError && !itemsError && rateErrors.length === 0;

  // ── Submit ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (confirm: boolean) => {
      const payload = {
        clientId: selectedClient!.id,
        orderDate,
        expectedDispatchDate: expectedDispatchDate || undefined,
        notes: notes || undefined,
        lineItems: lineItems.map((li) => ({
          variantId: li.variant.id,
          orderedBoxes: li.orderedBoxes,
          ratePerBoxPaise: Math.round(li.ratePerBox * 100),
          gstPercent: li.gstPercent,
        })),
        confirmImmediately: confirm,
      };
      console.log('Submitting Order:', payload);
      const r = await api.post('/orders', payload);
      return r.data.data;
    },
    onSuccess: (data) => {
      const po = data as { id: string; poNumber: string };
      toast.success(`PO ${po.poNumber} created successfully`);
      navigate(`/app/orders/${po.id}`);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to create order');
    },
  });

  function handleSubmit(confirm: boolean) {
    setHasAttempted(true);
    if (!isValid) {
      if (clientError) toast.error('Client selection is required');
      else if (itemsError) toast.error(itemsError);
      else if (rateErrors.length > 0) toast.error('All line items must have a rate > 0');
      return;
    }
    createMutation.mutate(confirm);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const showClientError = hasAttempted && !!clientError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Purchase Order"
        subtitle="Create a new client purchase order"
        actions={
          <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/app/orders')}>
            Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column: Client + Dates + Summary ── */}
        <div className="space-y-4">

          {/* Client Card */}
          <Card className={showClientError ? 'ring-2 ring-red-400' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Client
                {selectedClient && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                {showClientError && <span className="text-red-500 text-sm font-normal">Required</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedClient ? (
                /* Selected state — show chip with clear button */
                <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{selectedClient.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{selectedClient.clientCode}</p>
                    {selectedClient.phone && (
                      <p className="text-xs text-gray-500">{selectedClient.phone}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearClient}
                    className="flex-shrink-0 p-1 rounded-full hover:bg-emerald-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Change client"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                /* Search state */
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="client-search"
                    type="text"
                    placeholder="Search by name or code…"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setClientDropdownOpen(true);
                    }}
                    onFocus={() => setClientDropdownOpen(true)}
                    onBlur={handleClientBlur}
                    className={`w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                      showClientError
                        ? 'border-red-400 focus:ring-red-300 bg-red-50'
                        : 'border-gray-200 focus:ring-accent/30'
                    }`}
                  />

                  {/* Dropdown */}
                  {clientDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                      {isSession401 ? (
                        <div className="px-3 py-3 text-sm text-center">
                          <p className="text-red-500 font-medium">Session expired.</p>
                          <button
                            type="button"
                            className="text-accent text-xs underline mt-1"
                            onClick={() => { localStorage.removeItem('smartload-auth'); window.location.assign('/login'); }}
                          >
                            Click here to log in again
                          </button>
                        </div>
                      ) : clientResults.length === 0 && clientSearch.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-400 text-center">
                          Loading clients…
                        </div>
                      ) : clientResults.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          No clients found for "{clientSearch}"
                          <br />
                          <a
                            href="/app/clients"
                            className="text-accent text-xs underline mt-1 block"
                            onClick={(e) => { e.preventDefault(); navigate('/app/clients'); }}
                          >
                            + Create new client
                          </a>
                        </div>
                      ) : (
                        clientResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-50"
                            onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                            onClick={() => selectClient(c)}
                          >
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{c.clientCode} · {c.phone}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Inline error */}
              {showClientError && (
                <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                  <span>⚠</span> {clientError}
                </p>
              )}

              {/* Hint while typing */}
              {!selectedClient && !showClientError && clientSearch.length > 0 && clientSearch.length < 2 && (
                <p className="mt-1.5 text-xs text-gray-400">Type at least 2 characters to search</p>
              )}
              {!selectedClient && !showClientError && clientSearch.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-400">Search and select a client to continue</p>
              )}
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Date *</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Dispatch</label>
                <input type="date" value={expectedDispatchDate} onChange={(e) => setExpectedDispatchDate(e.target.value)}
                  min={orderDate}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3} placeholder="Special instructions…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
              </div>
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd className="font-medium">₹{subtotal.toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">GST</dt><dd className="font-medium">₹{gstAmount.toFixed(2)}</dd></div>
                <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                  <dt className="font-semibold text-gray-900">Total</dt>
                  <dd className="font-bold text-accent">₹{totalAmount.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <dt>Total Boxes</dt>
                  <dd>{lineItems.reduce((s, li) => s + li.orderedBoxes, 0)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Line Items ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Line Items ({lineItems.length})
              {hasAttempted && !!itemsError && (
                <span className="text-red-500 text-sm font-normal ml-2">— {itemsError}</span>
              )}
            </h2>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowVariantSearch(true)}>
              Add Product
            </Button>
          </div>

          {/* Variant search panel */}
          {showVariantSearch && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by SKU, product name, or colour…"
                      value={variantSearch}
                      onChange={(e) => handleVariantSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setShowVariantSearch(false); setVariantSearch(''); setVariantResults([]); }}>
                    Cancel
                  </Button>
                </div>
                {searchingVariants && <div className="flex justify-center py-4"><LoadingSpinner size="sm" /></div>}
                {variantResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {variantResults.map((v) => {
                      const avail = (v.inventoryStock?.totalBoxes ?? 0) - (v.inventoryStock?.reservedBoxes ?? 0);
                      const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join('×');
                      const alreadyAdded = lineItems.some((li) => li.variant.id === v.id);
                      return (
                        <button
                          key={v.id}
                          disabled={alreadyAdded}
                          className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => addVariant(v)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-accent">{v.product?.sku}</span>
                              <span className="text-sm font-medium text-gray-900 ml-2">{v.colourName}</span>
                              <span className="text-xs text-gray-500 ml-1">({v.colourCode})</span>
                              {dims && <span className="text-xs text-gray-400 ml-2">{dims}mm</span>}
                            </div>
                            <div className="text-right">
                              <span className={`text-xs font-medium ${avail > 0 ? 'text-green-600' : 'text-red-500'}`}>{avail} in stock</span>
                              {alreadyAdded && <span className="text-xs text-gray-400 block">already added</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {lineItems.length === 0 ? (
            <Card className={hasAttempted && !!itemsError ? 'ring-2 ring-red-300' : ''}>
              <CardContent>
                <div className="text-center py-12">
                  <ShoppingCart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No line items yet</p>
                  <p className="text-gray-400 text-xs mt-1">Click &ldquo;Add Product&rdquo; to start building the order</p>
                  <Button variant="outline" size="sm" className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={() => setShowVariantSearch(true)}>
                    Add Product
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {lineItems.map((li, idx) => {
                const lineTotal = li.orderedBoxes * li.ratePerBox * (1 + li.gstPercent / 100);
                const avail = (li.variant.inventoryStock?.totalBoxes ?? 0) - (li.variant.inventoryStock?.reservedBoxes ?? 0);
                const dims = [li.variant.lengthMm, li.variant.widthMm, li.variant.thicknessMm].filter(Boolean).join('×');
                const rateInvalid = hasAttempted && li.ratePerBox <= 0;
                return (
                  <Card key={li.variant.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="font-mono text-xs text-accent">{li.variant.product?.sku}</span>
                            <span className="font-medium text-gray-900">{li.variant.colourName}</span>
                            <span className="text-xs text-gray-500">({li.variant.colourCode})</span>
                            {dims && <span className="text-xs text-gray-400">{dims}mm</span>}
                            <span className="text-xs text-gray-400 ml-auto">{avail} available</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Boxes Ordered *</label>
                              <input
                                type="number"
                                min={1}
                                value={li.orderedBoxes}
                                onChange={(e) => updateLineItem(idx, { orderedBoxes: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Rate/Box (₹) *
                                {rateInvalid && <span className="text-red-500 ml-1">Required</span>}
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={li.ratePerBox || ''}
                                placeholder="e.g. 1200"
                                onChange={(e) => updateLineItem(idx, { ratePerBox: parseFloat(e.target.value) || 0 })}
                                className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                                  rateInvalid
                                    ? 'border-red-400 focus:ring-red-300 bg-red-50'
                                    : 'border-gray-200 focus:ring-accent/30'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">GST %</label>
                              <select
                                value={li.gstPercent}
                                onChange={(e) => updateLineItem(idx, { gstPercent: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                              >
                                {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-900">₹{lineTotal.toFixed(2)}</p>
                          <p className="text-xs text-gray-500">{li.orderedBoxes} × ₹{li.ratePerBox}</p>
                          <button
                            className="mt-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                            onClick={() => removeLineItem(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── Action buttons — always visible ── */}
          <div className="flex justify-end gap-3 pt-2">
            {hasAttempted && !isValid && (
              <p className="text-sm text-red-500 self-center mr-auto">
                {clientError ?? itemsError ?? 'Enter a rate for all items'}
              </p>
            )}
            <Button
              variant="outline"
              loading={createMutation.isPending}
              onClick={() => handleSubmit(false)}
            >
              Save as Draft
            </Button>
            <Button
              loading={createMutation.isPending}
              onClick={() => handleSubmit(true)}
            >
              Confirm Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
