import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes, ReactNode } from 'react';

export function Table({ children, className = '', ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-slate-200 bg-slate-50" {...rest}>{children}</thead>;
}

export function TBody({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-slate-100" {...rest}>{children}</tbody>;
}

export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`even:bg-slate-50/50 ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function Th({ children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className="px-4 py-2 font-medium text-slate-600" {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className="px-4 py-2 text-slate-800" {...rest}>
      {children}
    </td>
  );
}
