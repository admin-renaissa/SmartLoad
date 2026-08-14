import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
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
    disputedPODs: number;
  };
  dispatchVolume30d: { date: string; label: string; boxes: number }[];
  sessionsCount30d: { date: string; label: string; sessions: number }[];
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
  podDisputeTrend?: { date: string; label: string; acknowledged: number; disputed: number }[];
  scanErrorRateTrend7d?: { date: string; label: string; errorRate: number; errors: number; total: number }[];
  inventoryValuePaise?: number;
};

type Props = { data: ExecutiveDashboardData };

export default function ExecutiveDashboard({ data }: Props) {
  const { t } = useTranslation();
  const {
    kpis,
    dispatchVolume30d,
    sessionsCount30d = [],
    ordersByStatus,
    topClientsMonth,
    topProductsMonth,
    recentSessions,
    lowStockAlerts,
    tallySync,
    scanErrorRateTrend7d = [],
    podDisputeTrend = [],
    inventoryValuePaise = 0,
  } = data;
  const orderPie = ordersByStatus.map((o) => ({
    name: o.status.replace(/_/g, ' '),
    value: o.count,
    status: o.status,
  }));
  const errHigh = kpis.scanErrorRateToday > 5;
  const spark = kpis.boxesWeekSparkline;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28 }}>
      <div className="space-y-6">
      <PageHeader
        title={t('executive.pageTitle')}
        subtitle={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      />

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatsCard
          title={t('executive.dispatchesToday')}
          value={kpis.dispatchesToday}
          icon={<Truck className="h-5 w-5" />}
          trend={{ value: kpis.dispatchesTodayDelta, label: t('executive.vsYesterday') }}
          colorScheme="accent"
        />
        <div className="bg-card rounded-card shadow-card border-l-4 border-l-green-500 border border-border/50 p-6 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-secondary font-medium">{t('executive.boxesWeek')}</p>
              <p className="text-3xl font-bold text-text-primary mt-1">{kpis.boxesThisWeek}</p>
            </div>
            <div className="p-2 rounded-lg bg-surface text-text-secondary">
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
        <div className="bg-card rounded-card shadow-card border-l-4 border-l-gray-300 dark:border-l-gray-700 border border-border/50 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-secondary font-medium">{t('executive.scanErrorRate')}</p>
              <p className={`text-3xl font-bold mt-1 ${errHigh ? 'text-red-600' : 'text-text-primary'}`}>
                {kpis.scanErrorRateToday}%
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {t('executive.scanErrorsMeta', { errors: kpis.errorScansToday, total: kpis.totalScansToday })}
              </p>
            </div>
            <div className={`p-2 rounded-lg ${errHigh ? 'bg-red-500/10 text-red-600' : 'bg-surface text-text-secondary'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-card shadow-card border-l-4 border-l-amber-500 border border-border/50 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-secondary font-medium">{t('executive.podPending')}</p>
              <p className="text-3xl font-bold text-text-primary mt-1">{kpis.pendingPODs}</p>
            </div>
            <div className="p-2 rounded-lg bg-surface text-amber-600">
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
              {t('executive.review')}
            </Link>
          </div>
        </div>
        <div className="bg-card rounded-card shadow-card border-l-4 border-l-red-500 border border-border/50 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-secondary font-medium">{t('executive.podDisputed')}</p>
              <p className="text-3xl font-bold text-text-primary mt-1">{kpis.disputedPODs}</p>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <Link
              to="/app/reports"
              className={cn(
                'inline-flex items-center justify-center rounded-button font-medium h-8 px-3 text-sm',
                'bg-primary text-white hover:bg-primary/90',
              )}
            >
              {t('executive.podReport')}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('executive.inventoryValue')}</CardTitle>
            <p className="text-sm text-text-secondary font-normal">{t('executive.inventoryNote')}</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-text-primary">
              ₹{(inventoryValuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('executive.podTrendTitle')}</CardTitle>
            <p className="text-sm text-gray-500 font-normal">{t('executive.podTrendSubtitle')}</p>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={podDisputeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} interval={6} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--chart-tooltip-bg)', 
                      color: 'var(--chart-tooltip-text)',
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)' 
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="acknowledged" name={t('executive.legendAck')} stroke="#16A34A" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="disputed" name={t('executive.legendDisputed')} stroke="#DC2626" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2.5 — Sessions throughput + Scan error rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.25 }}>
          <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-accent" />
              <CardTitle>{t('executive.sessionsCount30dTitle')}</CardTitle>
            </div>
            <p className="text-sm text-gray-500 font-normal">{t('executive.sessionsCount30dSubtitle')}</p>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionsCount30d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    interval={3}
                    tickFormatter={(v: string) => (v ? v.slice(5).replace('-', '/') : '')}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--chart-tooltip-bg)', 
                      color: 'var(--chart-tooltip-text)',
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)' 
                    }}
                    formatter={(v: number) => [v, 'Sessions']} labelFormatter={(v) => String(v)} 
                  />
                  <Line type="monotone" dataKey="sessions" stroke="#0D9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.25, delay: 0.04 }}>
          <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent" />
              <CardTitle>{t('executive.scanErrorRateTrend7dTitle')}</CardTitle>
            </div>
            <p className="text-sm text-gray-500 font-normal">{t('executive.scanErrorRateTrend7dSubtitle')}</p>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={scanErrorRateTrend7d}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorErrRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    interval={2}
                    tickFormatter={(v: string) => (v ? v.slice(5).replace('-', '/') : '')}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--chart-tooltip-bg)', 
                      color: 'var(--chart-tooltip-text)',
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)' 
                    }}
                    formatter={(v: number) => [`${v}%`, 'Error rate']} labelFormatter={(v) => String(v)} 
                  />
                  <Area type="monotone" dataKey="errorRate" stroke="#DC2626" fill="url(#colorErrRate)" fillOpacity={1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 2 — 60% area + 40% donut */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <CardTitle>{t('executive.dispatchVolume')}</CardTitle>
            </div>
            <p className="text-sm text-gray-500 font-normal">{t('executive.dispatchVolumeHint')}</p>
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    tickFormatter={(v: string) => (v ? v.slice(5).replace('-', '/') : '')}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: 'var(--chart-tooltip-bg)', 
                      color: 'var(--chart-tooltip-text)',
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)' 
                    }}
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
            <CardTitle>{t('executive.ordersByStatus')}</CardTitle>
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
                      stroke="transparent"
                    >
                      {orderPie.map((e, i) => (
                        <Cell key={i} fill={ORDER_COLORS[e.status] || `hsl(${(i * 50) % 360} 60% 50%)`} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--chart-tooltip-bg)', 
                        color: 'var(--chart-tooltip-text)',
                        borderRadius: '8px', 
                        border: '1px solid var(--border-color)' 
                      }}
                    />
                    <Legend layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">{t('executive.noOrdersTracked')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — horizontal bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('executive.topClients')}</CardTitle>
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
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-secondary)' }} />
                    <YAxis
                      type="category"
                      dataKey="clientName"
                      width={100}
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--chart-tooltip-bg)', 
                        color: 'var(--chart-tooltip-text)',
                        borderRadius: '8px', 
                        border: '1px solid var(--border-color)' 
                      }}
                      formatter={(v: number) => [v, 'Boxes']} 
                    />
                    <Bar dataKey="boxes" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">{t('executive.noDispatchesMonth')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('executive.topProducts')}</CardTitle>
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
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-secondary)' }} />
                    <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--chart-tooltip-bg)', 
                        color: 'var(--chart-tooltip-text)',
                        borderRadius: '8px', 
                        border: '1px solid var(--border-color)' 
                      }}
                      formatter={(v: number) => [v, 'Boxes']} 
                    />
                    <Bar dataKey="boxes" fill="#0D9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">{t('executive.noScansMonth')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — table + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('executive.recentDispatches')}</CardTitle>
            <p className="text-sm text-gray-500 font-normal">{t('executive.recentDispatchesHint')}</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
               <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
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
                        {t('executive.noSessions')}
                      </td>
                    </tr>
                  ) : (
                    recentSessions.map((s) => (
                      <tr key={s.id} className="border-b border-border hover:bg-surface/50">
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
            <CardTitle>{t('executive.lowStock')}</CardTitle>
            <p className="text-sm text-gray-500 font-normal">{t('executive.lowStockHint')}</p>
          </CardHeader>
          <CardContent>
            {lowStockAlerts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">{t('executive.allAboveThreshold')}</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {lowStockAlerts.map((row) => (
                  <li key={row.variantId} className="py-3 flex items-start justify-between gap-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{row.label}</p>
                      <p className="text-xs text-text-secondary">
                        {t('executive.availableMin', { available: row.availableBoxes, min: row.minThreshold })}
                      </p>
                    </div>
                    <Link
                      to={`/app/products/${row.productId}`}
                      className="shrink-0 text-sm font-medium text-accent hover:underline"
                    >
                      {t('executive.view')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Tally sync */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-primary">
          <span>
            <span className="text-gray-500">{t('executive.lastTallySync')} </span>
            {tallySync.lastSyncAt
              ? new Date(tallySync.lastSyncAt).toLocaleString('en-IN')
              : '—'}
          </span>
          <span>
            <span className="text-gray-500">{t('executive.failedJobs')} </span>
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
          {t('executive.goTally')}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      </div>
    </motion.div>
  );
}
