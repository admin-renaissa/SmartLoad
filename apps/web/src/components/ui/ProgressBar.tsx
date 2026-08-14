import { cn } from '../../utils/cn.ts';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showPercent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  colorScheme?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}

export function ProgressBar({
  value,
  max,
  label,
  showPercent = true,
  size = 'md',
  colorScheme = 'default',
  className,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const sizes = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  const colors = {
    default: percent >= 100 ? 'bg-green-500' : percent >= 50 ? 'bg-accent' : 'bg-amber-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-gray-500">{label}</span>}
          {showPercent && (
            <span className="text-xs font-medium text-gray-700">
              {value}/{max} ({percent}%)
            </span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', sizes[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', colors[colorScheme])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
