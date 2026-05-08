import { cn } from '../../utils/cn.ts';

type Status = string;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PARTIALLY_LOADED: { label: 'Partially loaded', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  FULLY_LOADED: { label: 'Fully loaded', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  DISPATCHED: { label: 'Dispatched', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  DELIVERED: { label: 'Delivered', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  INACTIVE: { label: 'Inactive', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ARCHIVED: { label: 'Archived', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  DELETED: { label: 'Deleted', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  PAUSED: { label: 'Paused', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  OPEN: { label: 'Open', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  SUCCESS: { label: 'Success', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  WRONG_PRODUCT: { label: 'Wrong Product', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  WRONG_COLOUR: { label: 'Wrong Colour', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  EXCESS_QUANTITY: { label: 'Excess Qty', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  UNKNOWN_BARCODE: { label: 'Unknown', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  DUPLICATE_SCAN: { label: 'Duplicate', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  PENDING: { label: 'Pending', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  LINK_SENT: { label: 'Link Sent', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  OTP_VERIFIED: { label: 'OTP Verified', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  ACKNOWLEDGED: { label: 'Acknowledged', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  EXPIRED: { label: 'Expired', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  ADMIN: { label: 'Admin', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  SUPERVISOR: { label: 'Supervisor', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  OPERATOR: { label: 'Operator', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  ACCOUNTS: { label: 'Accounts', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  DRIVER: { label: 'Driver', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  CLIENT: { label: 'Client', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  PULL: { label: 'Pull', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
  PUSH: { label: 'Push', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
  PROCESSING: { label: 'Processing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  FAILED: { label: 'Failed', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  PERMANENTLY_FAILED: { label: 'Perm. failed', className: 'bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-400' },
  RETRYING: { label: 'Retrying', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-600' };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-black/5 dark:ring-white/10',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
