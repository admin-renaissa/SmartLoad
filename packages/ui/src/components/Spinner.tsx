export type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClass: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export function Spinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-slate-200 border-t-slate-600 ${sizeClass[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
