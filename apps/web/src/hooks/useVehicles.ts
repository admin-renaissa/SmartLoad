import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/axios.ts';
import type { VehicleType } from '@smartload/shared';

export type ListVehiclesQueryParams = {
  page?: number;
  limit?: number;
  isActive?: boolean;
  type?: VehicleType;
  search?: string;
};

export type VehicleHistoryQueryParams = {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
};

function toQueryString(obj: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export function useVehicles(query: ListVehiclesQueryParams) {
  const qs = toQueryString(query);
  return useQuery({
    queryKey: ['vehicles', query],
    queryFn: async () => {
      const r = await api.get(`/vehicles?${qs}`);
      return r.data as { data: unknown[]; meta: Record<string, unknown> };
    },
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ['vehicles', 'detail', id],
    queryFn: async () => {
      const r = await api.get(`/vehicles/${id}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!id,
  });
}

export function useAvailableVehicles() {
  return useQuery({
    queryKey: ['vehicles', 'available'],
    queryFn: async () => {
      const r = await api.get('/vehicles/available');
      return r.data.data as Record<string, unknown>[];
    },
    refetchInterval: 15_000,
  });
}

export function useVehicleHistory(id: string | undefined, query: VehicleHistoryQueryParams) {
  const qs = toQueryString(query);
  return useQuery({
    queryKey: ['vehicles', 'history', id, query],
    queryFn: async () => {
      const r = await api.get(`/vehicles/${id}/history?${qs}`);
      return {
        payload: r.data.data as {
          vehicle: Record<string, unknown>;
          sessions: Record<string, unknown>[];
          stats: Record<string, unknown>;
        },
        meta: r.data.meta as Record<string, unknown>,
      };
    },
    enabled: !!id,
  });
}

export type CreateVehiclePayload = {
  registrationNumber: string;
  type: VehicleType;
  capacityKg?: number;
  driverName: string;
  driverPhone: string;
};

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateVehiclePayload) => {
      const r = await api.post('/vehicles', body);
      return r.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle registered');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed';
      toast.error(msg);
    },
  });
}

export function useUpdateVehicle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<CreateVehiclePayload>) => {
      const r = await api.patch(`/vehicles/${id}`, body);
      return r.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle updated');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Update failed';
      toast.error(msg);
    },
  });
}

export function useDeactivateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vehicleId: string) => {
      await api.delete(`/vehicles/${vehicleId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle deactivated');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not deactivate';
      toast.error(msg);
    },
  });
}
