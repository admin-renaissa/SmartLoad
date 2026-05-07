import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/i18n.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './components/theme-provider.tsx';
import App from './App.tsx';
import { queryClient } from './lib/queryClient.ts';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontFamily: 'Inter, sans-serif', fontSize: '14px' },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
