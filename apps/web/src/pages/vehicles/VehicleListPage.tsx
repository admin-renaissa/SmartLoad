import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Truck, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { usePermission } from '../../hooks/usePermission.ts';
import { useDeactivateVehicle, useVehicles } from '../../hooks/useVehicles.ts';
import { VehicleFormModal } from './VehicleFormModal.tsx';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

function Plate({ reg }: { reg: string }) {
  const spaced =
    reg.length > 8 ? `${reg.slice(0, 2)} ${reg.slice(2, 4)} ${reg.slice(4, 6)} ${reg.slice(6)}` : reg;
  return (
    <div className="inline-flex flex-col items-center">
      <div className="text-[10px] font-bold bg-yellow-900 text-yellow-100 w-full text-center uppercase tracking-[0.2em] px-6 py-0.5">
        IND
      </div>
      <div className="border-4 border-black bg-[#fcecb5] px-5 py-2 font-black tracking-wider text-black text-xl md:text-2xl whitespace-nowrap">
        {spaced}
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const canManage = usePermission('vehicles:manage');
  const [modal, setModal] = useState<Record<string, unknown> | 'new' | null>(null);
  const deactivate = useDeactivateVehicle();

  const { data, isLoading } = useVehicles({ limit: 100 });

  const totals = useMemo(() => {
    const list = ((data?.data as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];
    let avail = 0;
    let busy = 0;
    let inactive = 0;
    for (const v of list) {
      const open = !!(v.currentSession as Record<string, unknown> | null);
      const active = v.isActive !== false;
      if (!active) inactive++;
      else if (open) busy++;
      else avail++;
    }
    return {
      avail,
      busy,
      inactive,
    };
  }, [data?.data]);

  const list = ((data?.data as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      {modal &&
        (modal === 'new' ?
          <VehicleFormModal onClose={() => setModal(null)} />
        : <VehicleFormModal vehicle={modal} onClose={() => setModal(null)} />)}

      <PageHeader
        title="Fleet Management"
        subtitle="Fleet status · Indian plate layout"
        actions={
          canManage ?
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal('new')}>
              Register Vehicle
            </Button>
          : null
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Total Vehicles', String(list.length)],
          ['Available Now', String(totals.avail)],
          ['Currently Dispatching', String(totals.busy)],
          ['Inactive', String(totals.inactive)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">{k}</p>
              <p className="text-2xl font-bold">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">Fleet status</p>
          <p className="text-xs text-gray-500 mt-0.5">Availability across registered vehicles</p>
        </div>
        <div className="p-4">
          <DonutChart
            data={[
              { label: 'AVAILABLE', value: totals.avail, color: '#16A34A' },
              { label: 'DISPATCHING', value: totals.busy, color: '#F59E0B' },
              { label: 'INACTIVE', value: totals.inactive, color: '#6B7280' },
            ]}
            height={220}
            showLegend
          />
        </div>
      </Card>

      {isLoading ?
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-10 flex justify-center">
                <LoadingSpinner />
              </CardContent>
            </Card>
          ))}
        </div>
      : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((v) => {
            const sess = v.currentSession as Record<string, unknown> | null;
            const open = !!sess;
            const po = sess?.purchaseOrder as Record<string, unknown> | undefined;
            const client = po?.client as Record<string, unknown> | undefined;
            const cap = v.capacityKg as number | null | undefined;
            const active = v.isActive !== false;
            return (
              <Card key={String(v.id)} className={`${!active ? 'opacity-60' : ''} overflow-hidden`}>
                <CardContent className="pt-6 pb-5 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <Plate reg={String(v.registrationNumber)} />
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-semibold ${
                        open ? 'bg-amber-100 text-amber-800' :
                        active ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {open ? 'IN USE' : active ? 'AVAILABLE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="text-xs uppercase text-gray-600 font-semibold tracking-wide inline-block bg-gray-100 px-3 py-1 rounded-full">
                    {String(v.type).replace('_', ' ')}
                  </div>
                  {open && (
                    <div className="text-sm text-gray-800 space-y-1 border-l-4 border-amber-400 pl-3">
                      <p className="font-mono text-accent">{String(sess.sessionCode ?? '')}</p>
                      <p className="text-xs">
                        Client: {String(client?.name ?? '')}{' '}
                        <span className="font-mono">· PO {(po?.poNumber as string) ?? ''}</span>
                      </p>
                    </div>
                  )}
                  <div className="text-sm space-y-1">
                    <p className="font-semibold">{String(v.driverName)}</p>
                    <a href={`tel:${String(v.driverPhone)}`} className="font-mono text-accent text-xs">
                      {String(v.driverPhone)}
                    </a>
                    {cap != null && Number(cap) > 0 ?
                      <p className="text-xs text-gray-500">Capacity: {Number(cap)} kg</p>
                    : null}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t justify-end">
                    <Link to={`/app/vehicles/${String(v.id)}/history`}>
                      <Button variant="outline" size="sm" icon={<History className="h-3.5 w-3.5" />}>
                        History
                      </Button>
                    </Link>
                    {canManage && active && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setModal(v)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-700"
                          onClick={() => {
                            const ok =
                              typeof window !== 'undefined' ?
                                window.confirm('Deactivate this vehicle?')
                              : false;
                            if (!ok || !v.id) return;
                            deactivate.mutate(String(v.id));
                          }}
                          disabled={open}
                          title={
                            open ? 'Close dispatch session before deactivating' : 'Deactivate'
                          }
                        >
                          Off road
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }

      {!isLoading && !list.length && (
        <Card>
          <CardContent className="py-14 text-center text-gray-500">
            <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium mb-4">No vehicles registered</p>
            {canManage ?
              <Button variant="outline" onClick={() => setModal('new')}>
                Register Vehicle
              </Button>
            : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
