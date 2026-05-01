import type { ReactNode } from 'react';

export type BadgeColor = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const colors: Record<BadgeColor, string> = {
  neutral: 'bg-slate-100 text-slate-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-900',
};

export function Badge({ children, color = 'neutral' }: { children: ReactNode; color?: BadgeColor }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
