import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/axios.ts';

export function useDownloadManifest() {
  return useMutation({
    mutationFn: async ({ sessionId, sessionCode }: { sessionId: string; sessionCode?: string }) => {
      const response = await api.get(`/sessions/${sessionId}/manifest`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = sessionCode ? `manifest-${sessionCode}.pdf` : `manifest-${sessionId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error('Manifest download failed'),
  });
}

export function useDownloadChallan() {
  return useMutation({
    mutationFn: async ({ sessionId, sessionCode }: { sessionId: string; sessionCode?: string }) => {
      const response = await api.get(`/sessions/${sessionId}/challan`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = sessionCode ? `challan-${sessionCode}.pdf` : `challan-${sessionId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Challan download failed';
      toast.error(msg);
    },
  });
}
