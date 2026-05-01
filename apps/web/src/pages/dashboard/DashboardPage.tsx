import { useQuery } from '@tanstack/react-query';
import { Truck, ShoppingCart, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.ts';
import { UserRole } from '@smartload/shared';
import { StatsCard } from '../../components/ui/StatsCard.tsx';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { usePermission } from '../../hooks/usePermission.ts';
import api from '../../lib/axios.ts';
import ExecutiveDashboard, { type ExecutiveDashboardData } from './ExecutiveDashboard.tsx';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const canExecutive = usePermission('dashboard:executive');
  const canClientPortal = usePermission('dashboard:client');
  const isSupervisorOnly = user?.role === UserRole.SUPERVISOR;

  const { data: execData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', isSupervisorOnly ? 'supervisor' : 'executive'],
    queryFn: async () => {
      const endpoint = isSupervisorOnly ? '/dashboard/supervisor' : '/dashboard/executive';
      const res = await api.get(endpoint);
      return res.data.data as ExecutiveDashboardData | Record<string, unknown>;
    },
    enabled: isSupervisorOnly || canExecutive,
    refetchInterval: 60_000,
  });

  const { data: clientDash, isLoading: clientLoading } = useQuery({
    queryKey: ['dashboard', 'client'],
    queryFn: async () => {
      const res = await api.get('/dashboard/client');
      return res.data.data as {
        orderCount: number;
        podPending: number;
        podDisputed: number;
        recentOrders: Array<{
          id: string;
          poNumber: string;
          status: string;
          orderDate: string;
          client: { name: string };
        }>;
      };
    },
    enabled: canClientPortal,
    refetchInterval: 60_000,
  });

  if (clientLoading && canClientPortal && !isSupervisorOnly && !canExecutive) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (canClientPortal && clientDash && !isSupervisorOnly && !canExecutive) {
    return <ClientPortalDashboard data={clientDash} />;
  }

  if (isLoading && (isSupervisorOnly || canExecutive)) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError && (isSupervisorOnly || canExecutive)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Dashboard" subtitle="Unable to load dashboard data" />
        <p className="text-sm text-gray-600">Check that you have access and the API is reachable.</p>
      </div>
    );
  }

  if (isSupervisorOnly) {
    return <SupervisorDashboard data={execData as Record<string, unknown>} />;
  }

  if (canExecutive && execData) {
    return <ExecutiveDashboard data={execData as ExecutiveDashboardData} />;
  }

  return <FallbackDashboard />;
}

function ClientPortalDashboard({
  data,
}: {
  data: {
    orderCount: number;
    podPending: number;
    podDisputed: number;
    recentOrders: Array<{
      id: string;
      poNumber: string;
      status: string;
      orderDate: string;
      client: { name: string };
    }>;
  };
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="Client portal" subtitle="Read-only view of orders and POD activity" />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatsCard title="Open orders" value={data.orderCount} icon={<ShoppingCart className="h-5 w-5" />} colorScheme="accent" />
        <StatsCard title="POD pending" value={data.podPending} icon={<AlertTriangle className="h-5 w-5" />} colorScheme="warning" />
        <StatsCard
          title="POD disputed"
          value={data.podDisputed}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorScheme={data.podDisputed > 0 ? 'error' : 'success'}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-gray-50">
            {data.recentOrders.map((o) => (
              <li key={o.id} className="px-6 py-3 flex justify-between gap-4 text-sm">
                <Link to={`/app/orders/${o.id}`} className="font-mono font-medium text-accent hover:underline">
                  {o.poNumber}
                </Link>
                <span className="text-gray-600">{o.client.name}</span>
                <span className="text-gray-500 text-xs">{o.status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500">
        Use Orders and Reports in the sidebar for full lists. Inventory and dispatch controls are not available for this role.
      </p>
    </div>
  );
}

function FallbackDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Welcome" subtitle="SmartLoad" />
      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>Use the sidebar to open orders, inventory, dispatch, or scanning.</p>
          <p>
            <Link to="/app/dispatch" className="text-accent font-medium hover:underline">
              Dispatch
            </Link>
            {' · '}
            <Link to="/scan" className="text-accent font-medium hover:underline">
              Scan app
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SupervisorDashboard({ data }: { data: Record<string, unknown> }) {
  const activeSessions = (data?.activeSessions || []) as Array<Record<string, unknown>>;
  const pendingOrders = (data?.pendingOrders || []) as Array<Record<string, unknown>>;
  const recentErrors = (data?.recentErrors || []) as Array<Record<string, unknown>>;
  const disputedPods = (data?.disputedPods || []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <PageHeader title="Operations dashboard" subtitle="Live dispatch" />

      <div className="grid lg:grid-cols-4 gap-4">
        <StatsCard title="Active sessions" value={activeSessions.length} icon={<Truck className="h-5 w-5" />} colorScheme="accent" />
        <StatsCard title="Pending orders" value={pendingOrders.length} icon={<ShoppingCart className="h-5 w-5" />} colorScheme="warning" />
        <StatsCard
          title="Scan errors today"
          value={recentErrors.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorScheme={recentErrors.length > 0 ? 'error' : 'success'}
        />
        <StatsCard
          title="Disputed PODs"
          value={disputedPods.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorScheme={disputedPods.length > 0 ? 'error' : 'success'}
        />
      </div>

      {disputedPods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-700">Disputed deliveries (client qty mismatch)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-50 text-sm">
              {disputedPods.map((p) => {
                const sess = p.session as Record<string, unknown> | undefined;
                const po = sess?.purchaseOrder as Record<string, unknown> | undefined;
                const client = po?.client as Record<string, unknown> | undefined;
                const vehicle = sess?.vehicle as Record<string, unknown> | undefined;
                return (
                  <li key={p.id as string} className="px-6 py-3 flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-gray-900">{po?.poNumber as string}</span>
                    <span className="text-gray-600">{client?.name as string}</span>
                    <span className="font-mono text-xs text-gray-500">{vehicle?.registrationNumber as string}</span>
                  </li>
                );
              })}
            </ul>
            <div className="px-6 py-3 border-t border-gray-50">
              <Link to="/app/reports" className="text-sm font-medium text-accent hover:underline">
                Open reports → POD status
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {activeSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active loading sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {activeSessions.map((session: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-bold text-gray-900 font-mono">
                      {(session.vehicle as Record<string, unknown>)?.registrationNumber as string}
                    </p>
                    <p className="text-sm text-gray-500">
                      {session.sessionCode as string} ·{' '}
                      {((session.po as Record<string, unknown>)?.client as Record<string, unknown>)?.name as string}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {session.totalBoxesScanned as number} / {session.totalBoxesExpected as number} boxes
                    </p>
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
