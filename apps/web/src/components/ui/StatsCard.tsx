import { cn } from '../../utils/cn.ts';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
  colorScheme?: 'default' | 'success' | 'warning' | 'error' | 'accent';
}

export function StatsCard({ title, value, icon, trend, className, colorScheme = 'default' }: StatsCardProps) {
  const colors = {
    default: 'border-gray-100',
    success: 'border-l-4 border-l-green-500',
    warning: 'border-l-4 border-l-amber-500',
    error: 'border-l-4 border-l-red-500',
    accent: 'border-l-4 border-l-accent',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-card shadow-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)]',
        colors[colorScheme],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && (
            <p className={cn('text-xs mt-1 font-medium', trend.value >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)} {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-gray-50 text-gray-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
