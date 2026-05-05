import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, X, Package, ShoppingCart, Users, Truck, MonitorSmartphone, Warehouse } from 'lucide-react';
import api from '../../lib/axios.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

type Scope = 'all' | 'orders' | 'products' | 'clients' | 'vehicles' | 'devices' | 'inventory';

interface SearchHit {
  id: string;
  type: Scope;
  title: string;
  subtitle?: string;
  href: string;
}

interface ScopeConfig {
  value: Scope;
  label: string;
  icon: React.ElementType;
  endpoint: string;
  limit: number;
  normalise: (item: Record<string, unknown>) => SearchHit;
}

// ── Scope configuration ────────────────────────────────────────────────────────

const SCOPES: ScopeConfig[] = [
  {
    value: 'orders',
    label: 'Orders',
    icon: ShoppingCart,
    endpoint: '/orders',
    limit: 5,
    normalise: (o) => ({
      id: o.id as string,
      type: 'orders',
      title: o.poNumber as string,
      subtitle: (o.client as { name?: string } | undefined)?.name,
      href: `/app/orders/${o.id as string}`,
    }),
  },
  {
    value: 'products',
    label: 'Products',
    icon: Package,
    endpoint: '/products',
    limit: 5,
    normalise: (p) => ({
      id: p.id as string,
      type: 'products',
      title: p.name as string,
      subtitle: p.sku as string,
      href: `/app/products/${p.id as string}`,
    }),
  },
  {
    value: 'clients',
    label: 'Clients',
    icon: Users,
    endpoint: '/clients',
    limit: 5,
    normalise: (c) => ({
      id: c.id as string,
      type: 'clients',
      title: c.name as string,
      subtitle: (c.clientCode as string) || (c.phone as string | undefined),
      href: `/app/clients`,
    }),
  },
  {
    value: 'vehicles',
    label: 'Vehicles',
    icon: Truck,
    endpoint: '/vehicles',
    limit: 5,
    normalise: (v) => ({
      id: v.id as string,
      type: 'vehicles',
      title: v.registrationNumber as string,
      subtitle: v.driverName as string | undefined,
      href: `/app/vehicles`,
    }),
  },
  {
    value: 'devices',
    label: 'Devices',
    icon: MonitorSmartphone,
    endpoint: '/devices',
    limit: 5,
    normalise: (d) => ({
      id: d.id as string,
      type: 'devices',
      title: d.name as string,
      subtitle: d.serialNumber as string | undefined,
      href: `/app/devices/${d.id as string}`,
    }),
  },
  {
    value: 'inventory',
    label: 'Inventory',
    icon: Warehouse,
    endpoint: '/inventory',
    limit: 5,
    normalise: (i) => ({
      id: i.id as string,
      type: 'inventory',
      title: (i.productName as string | undefined) ?? (i.name as string) ?? String(i.id),
      subtitle: i.sku as string | undefined,
      href: `/app/inventory`,
    }),
  },
];

const SCOPE_MAP = new Map(SCOPES.map((s) => [s.value, s]));

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'All',
  orders: 'Orders',
  products: 'Products',
  clients: 'Clients',
  vehicles: 'Vehicles',
  devices: 'Devices',
  inventory: 'Inventory',
};

const SCOPE_ICONS: Record<Scope, React.ElementType> = {
  all: Search,
  orders: ShoppingCart,
  products: Package,
  clients: Users,
  vehicles: Truck,
  devices: MonitorSmartphone,
  inventory: Warehouse,
};

// ── Hook: debounce ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────

async function fetchScope(cfg: ScopeConfig, query: string): Promise<SearchHit[]> {
  try {
    const r = await api.get<{ data: Record<string, unknown>[] }>(
      `${cfg.endpoint}?search=${encodeURIComponent(query)}&limit=${cfg.limit}`,
    );
    const rows = Array.isArray(r.data?.data) ? r.data.data : [];
    return rows.map(cfg.normalise);
  } catch {
    return [];
  }
}

async function fetchAll(query: string): Promise<SearchHit[]> {
  const results = await Promise.all(SCOPES.map((cfg) => fetchScope(cfg, query)));
  return results.flat();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recompute panel position whenever it opens so it aligns under the pill
  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 384),
        zIndex: 9999,
      });
    }
  }, [open]);

  // ── Fetch on debounced query / scope change ──────────────────────────────────

  const runSearch = useCallback(async (q: string, s: Scope) => {
    if (q.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = SCOPE_MAP.get(s);
      const results = cfg ? await fetchScope(cfg, q) : await fetchAll(q);
      setHits(results);
      setOpen(true);
      setActiveIdx(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(debouncedQuery, scope);
  }, [debouncedQuery, scope, runSearch]);

  // ── Outside click to close ───────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Navigate to hit ──────────────────────────────────────────────────────────

  function go(hit: SearchHit) {
    navigate(hit.href);
    setQuery('');
    setOpen(false);
    setHits([]);
    setActiveIdx(-1);
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) go(hit);
    }
  }

  // ── Group hits by type for "all" scope display ───────────────────────────────

  const grouped = new Map<Scope, SearchHit[]>();
  for (const hit of hits) {
    const arr = grouped.get(hit.type) ?? [];
    arr.push(hit);
    grouped.set(hit.type, arr);
  }

  // Flat index lookup for keyboard navigation
  const flatHits = scope === 'all'
    ? [...grouped.entries()].flatMap(([, items]) => items)
    : hits;

  let flatIdx = 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Search input + scope select combined pill */}
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-accent/30 transition-all w-56 sm:w-72">
        <div className="pl-3 flex items-center text-gray-400 flex-shrink-0">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-accent" />
            : <Search className="h-4 w-4" />
          }
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (hits.length > 0) setOpen(true); }}
          placeholder="Search…"
          className="flex-1 px-2 py-2 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400 min-w-0"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setHits([]); setOpen(false); }}
            className="flex items-center px-1.5 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Divider */}
        <span className="w-px h-5 bg-gray-200 flex-shrink-0" />
        {/* Scope select */}
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className="pr-2 pl-2 py-2 text-xs text-gray-600 bg-transparent outline-none cursor-pointer appearance-none border-none font-medium"
          style={{ WebkitAppearance: 'none' }}
        >
          <option value="all">All</option>
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <span className="pr-2 text-gray-400 pointer-events-none text-xs">▾</span>
      </div>

      {/* Result panel — fixed so it escapes overflow:hidden ancestors */}
      {open && (
        <div style={panelStyle} className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-[420px] flex flex-col">
          {hits.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results for <span className="font-medium text-gray-600">&quot;{query}&quot;</span>
            </div>
          ) : scope === 'all' ? (
            <ul className="overflow-y-auto divide-y divide-gray-50">
              {[...grouped.entries()].map(([type, items]) => {
                const Icon = SCOPE_ICONS[type];
                return (
                  <li key={type}>
                    {/* Section header */}
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <Icon className="h-3 w-3" />
                      {SCOPE_LABELS[type]}
                    </div>
                    <ul>
                      {items.map((hit) => {
                        const idx = flatIdx++;
                        return (
                          <ResultRow
                            key={hit.id}
                            hit={hit}
                            active={activeIdx === idx}
                            onHover={() => setActiveIdx(idx)}
                            onClick={() => go(hit)}
                          />
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="overflow-y-auto">
              {flatHits.map((hit, idx) => (
                <ResultRow
                  key={hit.id}
                  hit={hit}
                  active={activeIdx === idx}
                  onHover={() => setActiveIdx(idx)}
                  onClick={() => go(hit)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Result row ─────────────────────────────────────────────────────────────────

function ResultRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: SearchHit;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = SCOPE_ICONS[hit.type];
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          active ? 'bg-accent/10' : 'hover:bg-gray-50'
        }`}
      >
        <div className={`flex-shrink-0 p-1.5 rounded-md ${active ? 'bg-accent/20 text-accent' : 'bg-gray-100 text-gray-500'}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{hit.title}</p>
          {hit.subtitle && (
            <p className="text-xs text-gray-500 truncate">{hit.subtitle}</p>
          )}
        </div>
      </button>
    </li>
  );
}
