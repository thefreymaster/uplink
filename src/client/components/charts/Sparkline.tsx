import { Chart, useChart } from '@chakra-ui/charts';
import { useMemo } from 'react';
import { Area, AreaChart, Tooltip, XAxis, YAxis } from 'recharts';
import { TooltipCard } from './ChartParts';

interface SparklineProps {
  /** [x, value] pairs. */
  data: Array<[number, number]>;
  /** Color token for the series. */
  color: string;
  label: string;
  domainX: [number, number];
  formatValue: (v: number) => string;
  formatX: (x: number) => string;
  height?: number;
}

/** A small live trend: 2px line over a 10% wash of the same hue. */
export function Sparkline({ data, color, label, domainX, formatValue, formatX, height = 44 }: SparklineProps) {
  const rows = useMemo(() => data.map(([x, v]) => ({ x, v })), [data]);
  const chart = useChart({ data: rows, series: [{ name: 'v', color, label }] });

  return (
    <Chart.Root chart={chart} h={`${height}px`} aspectRatio="auto">
      <AreaChart responsive data={chart.data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }} style={{ width: '100%', height: '100%' }}>
        <XAxis dataKey="x" type="number" domain={domainX} hide />
        <YAxis domain={[0, (max: number) => Math.max(max * 1.15, 0.001)]} hide />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: chart.color('chart.axis'), strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as { x: number; v: number } | undefined;
            if (!active || !point) return null;
            return <TooltipCard title={formatX(point.x)} rows={[{ key: 'v', label, color, value: formatValue(point.v) }]} />;
          }}
        />
        <Area
          type="linear"
          dataKey="v"
          stroke={chart.color(color)}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={chart.color(color)}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color(color) }}
          isAnimationActive={false}
        />
      </AreaChart>
    </Chart.Root>
  );
}
