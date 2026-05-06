import { cn } from '../../utils/cn.ts';

type Status = string;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700' },
  PARTIALLY_LOADED: { label: 'Partially loaded', className: 'bg-amber-100 text-amber-700' },
  FULLY_LOADED: { label: 'Fully loaded', className: 'bg-orange-100 text-orange-700' },
  DISPATCHED: { label: 'Dispatched', className: 'bg-purple-100 text-purple-700' },
  DELIVERED: { label: 'Delivered', className: 'bg-green-100 text-green-700' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-amber-100 text-amber-700' },
  ARCHIVED: { label: 'Archived', className: 'bg-blue-100 text-blue-700' },
  DELETED: { label: 'Deleted', className: 'bg-red-100 text-red-700' },
  PAUSED: { label: 'Paused', className: 'bg-amber-100 text-amber-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  OPEN: { label: 'Open', className: 'bg-blue-100 text-blue-700' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-700' },
  SUCCESS: { label: 'Success', className: 'bg-green-100 text-green-700' },
  WRONG_PRODUCT: { label: 'Wrong Product', className: 'bg-red-100 text-red-700' },
  WRONG_COLOUR: { label: 'Wrong Colour', className: 'bg-red-100 text-red-700' },
  EXCESS_QUANTITY: { label: 'Excess Qty', className: 'bg-amber-100 text-amber-700' },
  UNKNOWN_BARCODE: { label: 'Unknown', className: 'bg-orange-100 text-orange-700' },
  DUPLICATE_SCAN: { label: 'Duplicate', className: 'bg-amber-100 text-amber-800' },
  PENDING: { label: 'Pending', className: 'bg-gray-100 text-gray-700' },
  LINK_SENT: { label: 'Link Sent', className: 'bg-blue-100 text-blue-700' },
  OTP_VERIFIED: { label: 'OTP Verified', className: 'bg-indigo-100 text-indigo-700' },
  ACKNOWLEDGED: { label: 'Acknowledged', className: 'bg-green-100 text-green-700' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-100 text-red-700' },
  EXPIRED: { label: 'Expired', className: 'bg-gray-100 text-gray-500' },
  ADMIN: { label: 'Admin', className: 'bg-purple-100 text-purple-700' },
  SUPERVISOR: { label: 'Supervisor', className: 'bg-blue-100 text-blue-700' },
  OPERATOR: { label: 'Operator', className: 'bg-green-100 text-green-700' },
  ACCOUNTS: { label: 'Accounts', className: 'bg-yellow-100 text-yellow-700' },
  DRIVER: { label: 'Driver', className: 'bg-gray-100 text-gray-700' },
  CLIENT: { label: 'Client', className: 'bg-slate-100 text-slate-800' },
  PULL: { label: 'Pull', className: 'bg-sky-100 text-sky-800' },
  PUSH: { label: 'Push', className: 'bg-violet-100 text-violet-800' },
  PROCESSING: { label: 'Processing', className: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  FAILED: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  PERMANENTLY_FAILED: { label: 'Perm. failed', className: 'bg-red-100 text-red-900' },
  RETRYING: { label: 'Retrying', className: 'bg-amber-100 text-amber-800' },
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
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-black/5',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
