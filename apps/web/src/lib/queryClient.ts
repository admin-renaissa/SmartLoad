import { QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        const message =
          (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          (error as Error)?.message ||
          'Something went wrong';
        toast.error(message);
      },
    },
  },
});
