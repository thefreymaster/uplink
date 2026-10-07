import { Chart, useChart } from '@chakra-ui/charts';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { axisSpeed, formatDateTime, formatDayMonth, formatMs, formatSpeed, formatTimeOfDay, formatTimeWithSeconds } from '../../lib/format';
import type { TestSummary } from '../../../shared/protocol';
import { TooltipCard } from './ChartParts';

interface Point {
  ts: number;
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  device: string;
}

function usePoints(tests: TestSummary[]): { points: Point[]; domain: [number, number]; formatTick: (ts: number) => string } {
  return useMemo(() => {
    const points = tests
      .map((t) => ({
        ts: Date.parse(t.createdAt),
        download: t.downloadMbps,
        upload: t.uploadMbps,
        latency: t.latencyMs,
        jitter: t.jitterMs,
        device: t.deviceLabel ?? 'Unknown device',
      }))
      .sort((a, b) => a.ts - b.ts);
    const first = points[0]?.ts ?? Date.now();
    const last = points[points.length - 1]?.ts ?? Date.now();
    const pad = last - first < 60_000 ? 30 * 60_000 : 0;
    const span = last - first;
    return {
      points,
      domain: [first - pad, last + pad],
      formatTick: span < 15 * 60_000 ? formatTimeWithSeconds : span < 36 * 3_600_000 ? formatTimeOfDay : formatDayMonth,
    };
  }, [tests]);
}

const axisProps = { tickLine: false, tickMargin: 8, fontSize: 11 } as const;

export function ThroughputHistoryChart({ tests }: { tests: TestSummary[] }) {
  const { points, domain, formatTick } = usePoints(tests);
  const chart = useChart({
    data: points,
    series: [
      { name: 'download', color: 'series.download', label: 'Download' },
      { name: 'upload', color: 'series.upload', label: 'Upload' },
    ],
  });
  const showDots = points.length <= 48;

  return (
    <Chart.Root chart={chart} h="240px" aspectRatio="auto">
      <LineChart responsive data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} style={{ width: '100%', height: '100%' }}>
        <CartesianGrid vertical={false} stroke={chart.color('chart.grid')} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={domain}
          tickFormatter={formatTick}
          axisLine={{ stroke: chart.color('chart.axis') }}
          minTickGap={40}
          {...axisProps}
        />
        <YAxis width={44} axisLine={false} tickFormatter={axisSpeed} {...axisProps} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: chart.color('chart.axis'), strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as Point | undefined;
            if (!active || !p) return null;
            return (
              <TooltipCard
                title={formatDateTime(p.ts)}
                rows={[
                  { key: 'd', label: 'Download', color: 'series.download', value: formatSpeed(p.download) },
                  { key: 'u', label: 'Upload', color: 'series.upload', value: formatSpeed(p.upload) },
                ]}
                footer={p.device}
              />
            );
          }}
        />
        {chart.series.map((s) => (
          <Line
            key={String(s.name)}
            type="linear"
            dataKey={chart.key(s.name)}
            stroke={chart.color(s.color)}
            strokeWidth={2}
            strokeLinejoin="round"
            connectNulls
            dot={showDots ? { r: 4, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color(s.color) } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color(s.color) }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </Chart.Root>
  );
}

export function LatencyHistoryChart({ tests }: { tests: TestSummary[] }) {
  const { points, domain, formatTick } = usePoints(tests);
  const chart = useChart({ data: points, series: [{ name: 'latency', color: 'series.latency', label: 'Latency' }] });
  const showDots = points.length <= 48;

  return (
    <Chart.Root chart={chart} h="240px" aspectRatio="auto">
      <LineChart responsive data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} style={{ width: '100%', height: '100%' }}>
        <CartesianGrid vertical={false} stroke={chart.color('chart.grid')} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={domain}
          tickFormatter={formatTick}
          axisLine={{ stroke: chart.color('chart.axis') }}
          minTickGap={40}
          {...axisProps}
        />
        <YAxis width={40} axisLine={false} tickFormatter={(v: number) => `${Number(v.toFixed(v < 10 ? 1 : 0))}`} {...axisProps} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: chart.color('chart.axis'), strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as Point | undefined;
            if (!active || !p) return null;
            return (
              <TooltipCard
                title={formatDateTime(p.ts)}
                rows={[{ key: 'l', label: 'Latency', color: 'series.latency', value: formatMs(p.latency) }]}
                footer={`Jitter ${formatMs(p.jitter)} · ${p.device}`}
              />
            );
          }}
        />
        <Line
          type="linear"
          dataKey="latency"
          stroke={chart.color('series.latency')}
          strokeWidth={2}
          strokeLinejoin="round"
          connectNulls
          dot={showDots ? { r: 4, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color('series.latency') } : false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color('series.latency') }}
          isAnimationActive={false}
        />
      </LineChart>
    </Chart.Root>
  );
}
