import { forwardRef } from 'react';
import { cn } from '../../utils/cn.ts';
import { LoadingSpinner } from './LoadingSpinner.tsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-accent text-white hover:bg-accent/90 focus:ring-accent/50',
      secondary: 'bg-[#0F2044] dark:bg-accent text-white hover:opacity-90 focus:ring-accent/50',
      outline: 'border border-border bg-card text-text-primary hover:bg-surface focus:ring-accent/50',
      ghost: 'text-text-secondary hover:bg-surface focus:ring-gray-300',
      danger: 'bg-error text-white hover:bg-red-700 focus:ring-error/50',
    };

    const sizes = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-button font-medium transition-colors',
          'transform-gpu hover:shadow-card active:scale-[0.99]',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <LoadingSpinner size="sm" className="border-current border-t-current/30" /> : icon}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
