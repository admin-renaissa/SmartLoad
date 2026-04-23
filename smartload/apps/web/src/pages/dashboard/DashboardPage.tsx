import { useQuery } from '@tanstack/react-query';
import { Truck, ShoppingCart, AlertTriangle, Package, TrendingUp, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuthStore } from '../../store/authStore.ts';
import { UserRole } from '@smartload/shared';
import { StatsCard } from '../../components/ui/StatsCard.tsx';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import api from '../../lib/axios.ts';

const DISPATCH_COLORS = ['#2563EB', '#15803D', '#B45309', '#7C3AED', '#B91C1C'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isSupervisor = user?.role === UserRole.SUPERVISOR;

  const { data: execData, isLoading } = useQuery({
    queryKey: ['dashboard', isSupervisor ? 'supervisor' : 'executive'],
    queryFn: async () => {
      const endpoint = isSupervisor ? '/api/v1/dashboard/supervisor' : '/api/v1/dashboard/executive';
      const res = await api.get(endpoint);
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (isSupervisor) {
    return <SupervisorDashboard data={execData} />;
  }

  return <ExecutiveDashboard data={execData} />;
}

function ExecutiveDashboard({ data }: { data: Record<string, unknown> }) {
  const kpis = (data?.kpis || {}) as Record<string, number>;
  const ordersByStatus = (data?.ordersByStatus || {}) as Record<string, number>;
  const recentSessions = (data?.recentSessions || []) as Array<Record<string, unknown>>;

  const statusChartData = Object.entries(ordersByStatus).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle={`Overview — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Dispatches Today"
          value={kpis.dispatchesToday || 0}
          icon={<Truck className="h-5 w-5" />}
          trend={kpis.dispatchesTodayDelta !== undefined ? { value: kpis.dispatchesTodayDelta, label: 'vs yesterday' } : undefined}
          colorScheme="accent"
        />
        <StatsCard
          title="Boxes This Week"
          value={kpis.boxesThisWeek || 0}
          icon={<Package className="h-5 w-5" />}
          colorScheme="success"
        />
        <StatsCard
          title="Scan Error Rate"
          value={`${kpis.scanErrorRateToday || 0}%`}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorScheme={(kpis.scanErrorRateToday || 0) > 5 ? 'error' : 'warning'}
        />
        <StatsCard
          title="POD Pending"
          value={kpis.pendingPODs || 0}
          icon={<Clock className="h-5 w-5" />}
          colorScheme="warning"
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" />
              <CardTitle>Orders by Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {statusChartData.map((_entry, index) => (
                      <Cell key={index} fill={DISPATCH_COLORS[index % DISPATCH_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">No data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Dispatches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No dispatches yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentSessions.slice(0, 6).map((session: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{(session.sessionCode as string) || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {((session.po as Record<string, unknown>)?.client as Record<string, unknown>)?.name as string || '—'}
                      </p>
                    </div>
                    <StatusBadge status={(session.status as string) || 'CLOSED'} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SupervisorDashboard({ data }: { data: Record<string, unknown> }) {
  const activeSessions = (data?.activeSessions || []) as Array<Record<string, unknown>>;
  const pendingOrders = (data?.pendingOrders || []) as Array<Record<string, unknown>>;
  const recentErrors = (data?.recentErrors || []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live dispatch operations"
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <StatsCard title="Active Sessions" value={activeSessions.length} icon={<Truck className="h-5 w-5" />} colorScheme="accent" />
        <StatsCard title="Pending Orders" value={pendingOrders.length} icon={<ShoppingCart className="h-5 w-5" />} colorScheme="warning" />
        <StatsCard title="Errors Today" value={recentErrors.length} icon={<AlertTriangle className="h-5 w-5" />} colorScheme={recentErrors.length > 0 ? 'error' : 'success'} />
      </div>

      {activeSessions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Active Loading Sessions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {activeSessions.map((session: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-bold text-gray-900 font-mono">{(session.vehicle as Record<string, unknown>)?.registrationNumber as string}</p>
                    <p className="text-sm text-gray-500">{(session.sessionCode as string)} · {((session.po as Record<string, unknown>)?.client as Record<string, unknown>)?.name as string}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{session.totalBoxesScanned as number} / {session.totalBoxesExpected as number} boxes</p>
                    <StatusBadge status="OPEN" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
