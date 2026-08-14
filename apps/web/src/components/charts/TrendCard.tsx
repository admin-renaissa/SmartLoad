import { ReactNode, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card.tsx';
import { Sparkline, type SparkPoint } from './Sparkline.tsx';

export function TrendCard({
  title,
  value,
  subtitle,
  trend,
  spark,
  right,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  spark?: SparkPoint[];
  right?: ReactNode;
}) {
  const trendText = useMemo(() => {
    if (!trend) return null;
    const dir = trend.value >= 0 ? 'up' : 'down';
    const abs = Math.abs(trend.value);
    return { dir, abs };
  }, [trend]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <p className="text-sm text-gray-500 font-normal mt-1">{subtitle}</p> : null}
        </div>
        {right}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {trend && trendText ? (
              <p
                className={
                  trendText.dir === 'up'
                    ? 'text-xs font-medium text-green-600 mt-1'
                    : 'text-xs font-medium text-red-600 mt-1'
                }
              >
                {trendText.dir === 'up' ? '↑' : '↓'} {trendText.abs} {trend.label}
              </p>
            ) : null}
          </div>
          {spark?.length ? (
            <div className="w-[120px]">
              <Sparkline data={spark} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

