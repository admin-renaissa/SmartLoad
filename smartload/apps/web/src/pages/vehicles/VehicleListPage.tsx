import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

interface Vehicle {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  driverName: string | null;
  driverPhone: string | null;
  capacityBoxes: number | null;
  isActive: boolean;
  _count?: { trips: number };
}

const VEHICLE_TYPES = ['TRUCK', 'MINI_TRUCK', 'TEMPO', 'OTHER'];

function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    registrationNumber: vehicle?.registrationNumber ?? '',
    vehicleType: vehicle?.vehicleType ?? 'TRUCK',
    driverName: vehicle?.driverName ?? '',
    driverPhone: vehicle?.driverPhone ?? '',
    capacityBoxes: vehicle?.capacityBoxes?.toString() ?? '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        registrationNumber: form.registrationNumber.toUpperCase(),
        vehicleType: form.vehicleType,
        driverName: form.driverName || undefined,
        driverPhone: form.driverPhone || undefined,
        capacityBoxes: form.capacityBoxes ? Number(form.capacityBoxes) : undefined,
      };
      if (vehicle) {
        await api.patch(`/api/v1/vehicles/${vehicle.id}`, payload);
      } else {
        await api.post('/api/v1/vehicles', payload);
      }
    },
    onSuccess: () => {
      toast.success(vehicle ? 'Vehicle updated' : 'Vehicle added');
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to save vehicle');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{vehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
            <input
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              placeholder="e.g. MH12AB1234"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type *</label>
            <select
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
              <input
                value={form.driverName}
                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                placeholder="e.g. Suresh Kumar"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Phone</label>
              <input
                value={form.driverPhone}
                onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                placeholder="+919876543210"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (boxes)</label>
            <input
              type="number"
              value={form.capacityBoxes}
              onChange={(e) => setForm({ ...form, capacityBoxes: e.target.value })}
              placeholder="e.g. 500"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.registrationNumber}
            onClick={() => mutation.mutate()}
          >
            {vehicle ? 'Save Changes' : 'Add Vehicle'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const canManage = usePermission('vehicles:manage');
  const [showCreate, setShowCreate] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | undefined>();

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const r = await api.get('/api/v1/vehicles?limit=100');
      return r.data.data;
    },
  });

  return (
    <div className="space-y-6">
      {(showCreate || editVehicle) && (
        <VehicleFormModal
          vehicle={editVehicle}
          onClose={() => { setShowCreate(false); setEditVehicle(undefined); }}
        />
      )}

      <PageHeader
        title="Vehicles"
        subtitle="Fleet management and driver assignments"
        actions={
          canManage && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              Add Vehicle
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(vehicles ?? []).map((v) => (
            <Card key={v.id} className={!v.isActive ? 'opacity-60' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Truck className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-gray-900 truncate">{v.registrationNumber}</p>
                      <p className="text-xs text-gray-500">{v.vehicleType?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <StatusBadge status={v.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  {v.driverName && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-12">Driver</span>
                      <span>{v.driverName}</span>
                    </div>
                  )}
                  {v.driverPhone && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-12">Phone</span>
                      <span className="font-mono text-xs">{v.driverPhone}</span>
                    </div>
                  )}
                  {v.capacityBoxes && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-12">Capacity</span>
                      <span>{v.capacityBoxes} boxes</span>
                    </div>
                  )}
                  {v._count && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-12">Trips</span>
                      <span>{v._count.trips}</span>
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <Button variant="ghost" size="sm" onClick={() => setEditVehicle(v)}>Edit</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {(!vehicles || vehicles.length === 0) && (
            <div className="col-span-full">
              <Card>
                <CardContent>
                  <div className="text-center py-12">
                    <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No vehicles yet</p>
                    {canManage && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                        Add First Vehicle
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
