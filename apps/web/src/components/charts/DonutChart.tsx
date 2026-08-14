import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export type DonutSlice = {
  label: string;
  value: number;
  color?: string;
};

const DEFAULT_COLORS = ['#2563EB', '#0D9488', '#DC2626', '#F59E0B', '#7C3AED', '#059669', '#EF4444', '#3B82F6'];

export function DonutChart({
  data,
  height = 220,
  showLegend = true,
}: {
  data: DonutSlice[];
  height?: number;
  showLegend?: boolean;
}) {
  const normalized = data.filter((d) => d.value > 0);
  const slices = normalized.map((d, i) => ({
    ...d,
    color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  if (!slices.length) {
    return (
      <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
        No data
      </div>
    );
  }

  const outer = Math.min(height, 220) * 0.4;
  const inner = outer * 0.6;

  return (
    <div className="w-full flex justify-center items-center" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
          >
            {slices.map((s, i) => (
              <Cell key={`${s.label}-${i}`} fill={s.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--chart-tooltip-bg)', 
              color: 'var(--chart-tooltip-text)',
              borderRadius: '8px', 
              border: '1px solid var(--border)', 
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
            }}
            itemStyle={{ color: 'var(--chart-tooltip-text)' }}
            formatter={(v: number, name: string) => [v, name]} 
          />
          {showLegend && (
            <Legend 
              layout="horizontal" 
              align="center" 
              verticalAlign="bottom" 
              iconType="circle"
              wrapperStyle={{ paddingTop: '20px' }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

