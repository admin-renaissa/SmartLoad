import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { VehicleType } from '@smartload/shared';
import { Button } from '../../components/ui/Button.tsx';
import { type CreateVehiclePayload, useCreateVehicle } from '../../hooks/useVehicles.ts';
import api from '../../lib/axios.ts';

const TYPES = [
  VehicleType.TRUCK,
  VehicleType.TEMPO,
  VehicleType.VAN,
  VehicleType.MINI_TRUCK,
  VehicleType.PICKUP,
  VehicleType.CONTAINER,
];

const indianRegRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
const mobileRegex = /^\+?[0-9]{10,15}$/;

export function VehicleFormModal({
  vehicle,
  onClose,
}: {
  vehicle?: Record<string, unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createMu = useCreateVehicle();

  const updateMu = useMutation({
    mutationFn: async (args: { id: string; body: Partial<CreateVehiclePayload> }) => {
      const r = await api.patch(`/vehicles/${args.id}`, args.body);
      return r.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle updated');
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Update failed';
      toast.error(msg);
    },
  });

  const [form, setForm] = useState<CreateVehiclePayload>({
    registrationNumber: (vehicle?.registrationNumber as string) ?? '',
    type: (vehicle?.type as VehicleType) ?? VehicleType.TRUCK,
    capacityKg:
      vehicle?.capacityKg !== undefined && vehicle?.capacityKg !== null ?
        Number(vehicle.capacityKg)
      : undefined,
    driverName: (vehicle?.driverName as string) ?? '',
    driverPhone: (vehicle?.driverPhone as string) ?? '',
  });

  useEffect(() => {
    if (!vehicle) return;
    setForm({
      registrationNumber: (vehicle.registrationNumber as string) ?? '',
      type: (vehicle.type as VehicleType) ?? VehicleType.TRUCK,
      capacityKg:
        vehicle.capacityKg !== undefined && vehicle.capacityKg !== null ?
          Number(vehicle.capacityKg)
        : undefined,
      driverName: (vehicle.driverName as string) ?? '',
      driverPhone: (vehicle.driverPhone as string) ?? '',
    });
  }, [vehicle]);

  const regNorm = form.registrationNumber.trim().toUpperCase();
  const phoneValid = mobileRegex.test(form.driverPhone.trim());

  const save = () => {
    const editing = !!vehicle?.id;
    if (!editing && !indianRegRegex.test(regNorm)) {
      toast.error('Format: MH12AB1234 (Indian registration)');
      return;
    }
    if (!mobileRegex.test(form.driverPhone.trim())) {
      toast.error('Enter a valid 10–15 digit mobile');
      return;
    }
    if (form.driverName.trim().length < 2) {
      toast.error('Driver name required');
      return;
    }
    const payload: CreateVehiclePayload = {
      ...form,
      registrationNumber: editing ? ((vehicle!.registrationNumber as string) ?? regNorm) : regNorm,
      capacityKg: form.capacityKg,
    };
    if (editing) {
      const { registrationNumber, ...patch } = payload;
      void registrationNumber;
      updateMu.mutate({ id: String(vehicle!.id), body: patch });
      return;
    }
    createMu.mutate(
      {
        registrationNumber: regNorm,
        type: payload.type,
        capacityKg: payload.capacityKg,
        driverName: payload.driverName,
        driverPhone: payload.driverPhone,
      },
      { onSuccess: () => onClose() },
    );
  };

  const pending = createMu.isPending || updateMu.isPending;

  const showPlateValidation = !vehicle?.id && regNorm.length >= 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-lg font-semibold">{vehicle?.id ? 'Edit Vehicle' : 'Register Vehicle'}</h2>
          <button type="button" className="p-2 hover:bg-gray-100 rounded-lg" onClick={onClose}>
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          {!vehicle?.id && (
            <div>
              <label className="block text-gray-700 mb-1 font-medium">
                Registration * <span className="font-normal text-gray-500 text-xs ml-2">MH12AB1234</span>
              </label>
              <input
                className={`w-full border rounded-lg px-3 py-2 font-mono uppercase ${
                  regNorm.length >= 6 && !indianRegRegex.test(regNorm) ? 'border-red-400' :
                  indianRegRegex.test(regNorm) ? 'border-emerald-500'
                  : ''
                }`}
                value={form.registrationNumber}
                onChange={(e) =>
                  setForm({ ...form, registrationNumber: e.target.value.toUpperCase() })
                }
              />
              {showPlateValidation && regNorm.length >= 6 && (
                <p className="text-xs mt-1">{indianRegRegex.test(regNorm) ? '✓ Valid plate' : '✕ Check format'}</p>
              )}
            </div>
          )}

          {vehicle?.id != null ?
            <p className="font-mono text-lg font-bold text-gray-900">
              {typeof vehicle.registrationNumber === 'string' ? vehicle.registrationNumber : ''}
            </p>
          : null}

          <div>
            <label className="block text-gray-700 mb-1 font-medium">Vehicle type *</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as VehicleType })
              }
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 mb-1">Capacity kg (optional)</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2"
              value={form.capacityKg ?? ''}
              placeholder="2500"
              onChange={(e) =>
                setForm({
                  ...form,
                  capacityKg:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </div>

          <div>
            <label className="block text-gray-700 mb-1 font-medium">Driver name *</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.driverName}
              onChange={(e) => setForm({ ...form, driverName: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-gray-700 mb-1 font-medium">Driver phone *</label>
            <input
              className={`w-full border rounded-lg px-3 py-2 font-mono ${
                form.driverPhone && !phoneValid ? 'border-red-400'
                : phoneValid ? 'border-emerald-500'
                : ''
              }`}
              value={form.driverPhone}
              onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
            />
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={pending} onClick={save}>
            Save Vehicle
          </Button>
        </div>
      </div>
    </div>
  );
}
