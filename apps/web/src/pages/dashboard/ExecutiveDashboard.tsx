import { Link } from 'react-router-dom';
import {
  Truck,
  Package,
  AlertTriangle,
  Clock,
  ExternalLink,
  Activity,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';
import { StatsCard } from '../../components/ui/StatsCard.tsx';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { cn } from '../../utils/cn.ts';

const ORDER_COLORS: Record<string, string> = {
  CONFIRMED: '#2563EB',
  PARTIALLY_LOADED: '#F59E0B',
  DISPATCHED: '#0D9488',
  DELIVERED: '#16A34A',
  CANCELLED: '#DC2626',
};

const BAR_COLOR = '#2563EB';

export type ExecutiveDashboardData = {
  kpis: {
    dispatchesToday: number;
    dispatchesTodayDelta: number;
    boxesThisWeek: number;
    boxesWeekSparkline: { day: string; label: string; boxes: number }[];
    scanErrorRateToday: number;
    totalScansToday: number;
    errorScansToday: number;
    pendingPODs: number;
  };
  dispatchVolume30d: { date: string; label: string; boxes: number }[];
  ordersByStatus: { status: string; count: number }[];
  topClientsMonth: { clientId: string; clientName: string; boxes: number }[];
  topProductsMonth: { productId: string; productName: string; boxes: number }[];
  recentSessions: Array<{
    id: string;
    sessionCode: string;
    status: string;
    poNumber: string;
    clientName: string;
    vehicleReg: string;
  }>;
  lowStockAlerts: Array<{
    variantId: string;
    productId: string;
    label: string;
    availableBoxes: number;
    minThreshold: number;
  }>;
  tallySync: {
    lastSyncAt: string | null;
    failedJobsCount: number;
  };
};

type Props = { data: ExecutiveDashboardData };

export default function ExecutiveDashboard({ data }: Props) {
  const { kpis, dispatchVolume30d, ordersByStatus, topClientsMonth, topProductsMonth, recentSessions, lowStockAlerts, tallySync } = data;
  const orderPie = ordersByStatus.map((o) => ({
    name: o.status.replace(/_/g, ' '),
    value: o.count,
    status: o.status,
  }));
  const errHigh = kpis.scanErrorRateToday > 5;
  const spark = kpis.boxesWeekSparkline;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive dashboard"
        subtitle={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      />

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Dispatches today"
          value={kpis.dispatchesToday}
          icon={<Truck className="h-5 w-5" />}
          trend={{ value: kpis.dispatchesTodayDelta, label: 'vs yesterday' }}
          colorScheme="accent"
        />
        <div className="bg-white rounded-card shadow-card border-l-4 border-l-green-500 p-6 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Boxes dispatched (this week)</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{kpis.boxesThisWeek}</p>
            </div>
            <div className="p-2 rounded-lg bg-gray-50 text-gray-500">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="h-14 mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spark}>
                <Line type="monotone" dataKey="boxes" stroke="#16A34A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-card shadow-card border-l-4 border-l-gray-300 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Scan error rate (today)</p>
              <p className={`text-3xl font-bold mt-1 ${errHigh ? 'text-red-600' : 'text-gray-900'}`}>
                {kpis.scanErrorRateToday}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {kpis.errorScansToday} errors / {kpis.totalScansToday} scans
              </p>
            </div>
            <div className={`p-2 rounded-lg ${errHigh ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-card shadow-card border-l-4 border-l-amber-500 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">POD pending acknowledgement</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{kpis.pendingPODs}</p>
            </div>
            <div className="p-2 rounded-lg bg-gray-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <Link
              to="/app/dispatch"
              className={cn(
                'inline-flex items-center justify-center rounded-button font-medium h-8 px-3 text-sm',
                'bg-primary text-white hover:bg-primary/90',
              )}
            >
              Review
            </Link>
          </div>
        </div>
      </div>

      {/* Row 2 — 60% area + 40% donut */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <CardTitle>Dispatch volume (30 days)</CardTitle>
            </div>
            <p className="text-sm text-gray-500 font-normal">Daily boxes from closed sessions</p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dispatchVolume30d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBoxes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => (v ? v.slice(5).replace('-', '/') : '')}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8 }}
                    formatter={(v: number) => [v, 'Boxes']}
                    labelFormatter={(_l, p) => (p[0]?.payload as { date?: string })?.date || ''}
                  />
                  <Area type="monotone" dataKey="boxes" stroke="#2563EB" fillOpacity={1} fill="url(#colorBoxes)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            {orderPie.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orderPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {orderPie.map((e, i) => (
                        <Cell key={i} fill={ORDER_COLORS[e.status] || `hsl(${(i * 50) % 360} 60% 50%)`} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No orders in tracked statuses</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — horizontal bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 clients (dispatch volume, this month)</CardTitle>
          </CardHeader>
          <CardContent>
            {topClientsMonth.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={topClientsMonth}
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-gray-100" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="clientName"
                      width={100}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v: number) => [v, 'Boxes']} />
                    <Bar dataKey="boxes" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No closed dispatches this month yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 5 products (boxes scanned, this month)</CardTitle>
          </CardHeader>
          <CardContent>
            {topProductsMonth.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={topProductsMonth}
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-gray-100" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [v, 'Boxes']} />
                    <Bar dataKey="boxes" fill="#0D9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No successful scans this month yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — table + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent dispatches</CardTitle>
            <p className="text-sm text-gray-500 font-normal">Last 10 sessions</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">PO</th>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Vehicle</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No sessions yet
                      </td>
                    </tr>
                  ) : (
                    recentSessions.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <Link to={`/app/sessions/${s.id}`} className="font-mono font-medium text-accent hover:underline">
                            {s.sessionCode}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{s.poNumber}</td>
                        <td className="px-4 py-3">{s.clientName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.vehicleReg}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Low stock alerts</CardTitle>
            <p className="text-sm text-gray-500 font-normal">On-hand boxes at or below minimum</p>
          </CardHeader>
          <CardContent>
            {lowStockAlerts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">All variants above threshold</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {lowStockAlerts.map((row) => (
                  <li key={row.variantId} className="py-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.label}</p>
                      <p className="text-xs text-gray-500">
                        Available {row.availableBoxes} · min {row.minThreshold}
                      </p>
                    </div>
                    <Link
                      to={`/app/products/${row.productId}`}
                      className="shrink-0 text-sm font-medium text-accent hover:underline"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Tally sync */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
          <span>
            <span className="text-gray-500">Last Tally sync: </span>
            {tallySync.lastSyncAt
              ? new Date(tallySync.lastSyncAt).toLocaleString('en-IN')
              : '—'}
          </span>
          <span>
            <span className="text-gray-500">Failed jobs: </span>
            <span className={tallySync.failedJobsCount > 0 ? 'text-red-600 font-medium' : ''}>
              {tallySync.failedJobsCount}
            </span>
          </span>
        </div>
        <Link
          to="/app/tally"
          className={cn(
            'inline-flex items-center gap-1.5 justify-center rounded-button font-medium h-8 px-3 text-sm',
            'bg-primary text-white hover:bg-primary/90',
          )}
        >
          Go to Tally
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
