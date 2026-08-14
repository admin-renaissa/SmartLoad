import { DonutChart, type DonutSlice } from './DonutChart.tsx';

export function StatusDistribution({
  title,
  data,
  height = 220,
}: {
  title?: string;
  data: DonutSlice[];
  height?: number;
}) {
  return (
    <div className="w-full">
      {title ? (
        <div className="mb-2">
          <p className="text-sm font-medium text-gray-900">{title}</p>
        </div>
      ) : null}
      <DonutChart data={data} height={height} showLegend />
    </div>
  );
}

