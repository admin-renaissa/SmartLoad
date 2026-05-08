import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ActivityBars({
  data,
  barColor = '#2563EB',
  height = 220,
  xKey = 'label',
  yKey = 'value',
}: {
  data: Array<Record<string, string | number>>;
  barColor?: string;
  height?: number;
  xKey?: string;
  yKey?: string;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'currentColor' }} interval={3} className="text-gray-400" />
          <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} className="text-gray-400" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--chart-tooltip-bg)', 
              color: 'var(--chart-tooltip-text)',
              borderRadius: '8px', 
              border: '1px solid var(--border)',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
            itemStyle={{ color: 'var(--chart-tooltip-text)' }}
          />
          <Bar dataKey={yKey} fill={barColor} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

