import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Truck, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card.tsx';
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
            <CardContent className="py-5">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest opacity-60 mb-1">{k}</p>
              <p className="text-3xl font-black text-text-primary tracking-tight">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="text-text-primary">Fleet status</CardTitle>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60 mt-0.5">Availability across registered vehicles</p>
        </CardHeader>
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
              <Card key={String(v.id)} className={`${!active ? 'opacity-40' : ''} overflow-hidden border-border hover:border-accent/40 transition-colors group`}>
                <CardContent className="pt-6 pb-5 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <Plate reg={String(v.registrationNumber)} />
                    <span
                      className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm ${
                        open ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                        active ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                        : 'bg-surface text-text-secondary border border-border'
                      }`}
                    >
                      {open ? 'IN USE' : active ? 'AVAILABLE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="text-[10px] uppercase text-text-secondary font-black tracking-[0.15em] inline-block bg-surface border border-border px-3 py-1 rounded-lg">
                    {String(v.type).replace('_', ' ')}
                  </div>
                   {open && (
                    <div className="text-sm space-y-1.5 border-l-4 border-amber-500 pl-4 py-1 bg-amber-500/5 rounded-r-lg">
                      <p className="font-mono font-black text-accent">{String(sess.sessionCode ?? '')}</p>
                      <p className="text-xs text-text-primary font-medium">
                        Client: {String(client?.name ?? '')}{' '}
                        <span className="font-mono text-text-secondary opacity-60 ml-1">· PO {(po?.poNumber as string) ?? ''}</span>
                      </p>
                    </div>
                  )}
                  <div className="text-sm space-y-1.5">
                    <p className="font-bold text-text-primary text-lg tracking-tight">{String(v.driverName)}</p>
                    <a href={`tel:${String(v.driverPhone)}`} className="font-mono text-accent text-xs font-bold hover:underline">
                      {String(v.driverPhone)}
                    </a>
                    {cap != null && Number(cap) > 0 ?
                      <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-40">Capacity: {Number(cap)} kg</p>
                    : null}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t border-border justify-end">
                    <Link to={`/app/vehicles/${String(v.id)}/history`}>
                      <Button variant="ghost" size="sm" icon={<History className="h-3.5 w-3.5" />}>
                        History
                      </Button>
                    </Link>
                    {canManage && active && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setModal(v)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:bg-red-500/10"
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
          <CardContent className="py-20 text-center">
            <Truck className="h-16 w-16 text-border mx-auto mb-6 opacity-20" />
            <p className="font-bold text-text-primary text-xl">No vehicles registered</p>
            <p className="text-text-secondary text-sm mb-8 italic opacity-60">Start by adding your first fleet vehicle</p>
            {canManage ?
              <Button onClick={() => setModal('new')}>
                Register Vehicle
              </Button>
            : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
