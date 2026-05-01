import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Card({ children, header, footer, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {header && <div className="border-b border-slate-100 px-4 py-3">{header}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-slate-100 px-4 py-3">{footer}</div>}
    </div>
  );
}
