import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/axios.ts';
import type { MovementType } from '@smartload/shared';

export type ListStockQueryParams = {
  page?: number;
  limit?: number;
  categoryId?: string;
  variantId?: string;
  lowStockOnly?: boolean;
  outOfStock?: boolean;
  search?: string;
  sortBy?: 'productName' | 'availableBoxes' | 'totalBoxes' | 'sku';
  sortDir?: 'asc' | 'desc';
};

export type LedgerQueryParams = {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: MovementType;
};

export type ListGRNQueryParams = {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

function toQueryString(obj: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export function useStockSummary(query: ListStockQueryParams) {
  const qs = toQueryString(query);
  return useQuery({
    queryKey: ['inventory', 'stock', query],
    queryFn: async () => {
      const r = await api.get(`/inventory?${qs}`);
      return r.data as { success: boolean; data: unknown[]; meta: unknown };
    },
    staleTime: 30_000,
  });
}

export function useVariantStock(variantId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'variant', variantId],
    queryFn: async () => {
      const r = await api.get(`/inventory/${variantId}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!variantId,
  });
}

export function useVariantLedger(variantId: string | undefined, ledgerQuery: LedgerQueryParams) {
  const qs = toQueryString(ledgerQuery);
  return useQuery({
    queryKey: ['inventory', 'ledger', variantId, ledgerQuery],
    queryFn: async () => {
      const r = await api.get(`/inventory/${variantId}/ledger?${qs}`);
      return {
        ledger: r.data.data as {
          variant: Record<string, unknown>;
          currentStock: Record<string, unknown>;
          entries: Record<string, unknown>[];
        },
        meta: r.data.meta as Record<string, unknown>,
      };
    },
    enabled: !!variantId,
  });
}

export function useAdjustStock(variantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { boxes: number; reason: string; notes?: string }) => {
      const r = await api.post(`/inventory/${variantId}/adjust`, body);
      return r.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory', 'stock'] });
      if (variantId) void qc.invalidateQueries({ queryKey: ['inventory', 'variant', variantId] });
      if (variantId) void qc.invalidateQueries({ queryKey: ['inventory', 'ledger', variantId] });
      toast.success('Stock adjusted successfully');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Adjust failed';
      toast.error(msg);
    },
  });
}

export function useTransferStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      fromVariantId: string;
      toVariantId: string;
      boxes: number;
      reason: string;
    }) => {
      const r = await api.post('/inventory/transfer', body);
      return r.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory', 'stock'] });
      toast.success('Stock transferred');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Transfer failed';
      toast.error(msg);
    },
  });
}

export function useLowStockVariants() {
  return useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: async () => {
      const r = await api.get('/inventory/low-stock');
      return r.data.data as unknown[];
    },
    refetchInterval: 60_000,
  });
}

export function useInventoryValuation() {
  return useQuery({
    queryKey: ['inventory', 'valuation'],
    queryFn: async () => {
      const r = await api.get('/inventory/valuation');
      return r.data.data as Record<string, unknown>;
    },
    staleTime: 300_000,
  });
}

export function useExportInventory() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get('/inventory/export', { responseType: 'blob' });
      const d = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-report-${d}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error('Export failed'),
  });
}

export function useGRNs(query: ListGRNQueryParams) {
  const qs = toQueryString(query);
  return useQuery({
    queryKey: ['grn', query],
    queryFn: async () => {
      const r = await api.get(`/grn?${qs}`);
      return r.data as { success: boolean; data: unknown[]; meta: unknown };
    },
  });
}

export function useGRN(id: string | undefined) {
  return useQuery({
    queryKey: ['grn', 'detail', id],
    queryFn: async () => {
      const r = await api.get(`/grn/${id}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!id,
  });
}

export function useCreateGRN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await api.post('/grn', body);
      return r.data.data as Record<string, unknown>;
    },
    onSuccess: (data: Record<string, unknown>) => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['grn'] });
      const num = data.grnNumber as string | undefined;
      toast.success(num ? `GRN ${num} created` : 'GRN created');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'GRN failed';
      toast.error(msg);
    },
  });
}

export function useImportOpeningStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/inventory/import-opening-stock', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data as { processed: number; updated: number; errors: { row: number; message: string }[] };
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(`Import done: ${r.updated} updated, ${r.errors.length} error(s)`);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Import failed';
      toast.error(msg);
    },
  });
}
