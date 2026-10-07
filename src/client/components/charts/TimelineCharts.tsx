import { Chart, useChart } from '@chakra-ui/charts';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, Tooltip, XAxis, YAxis } from 'recharts';
import { axisSpeed, formatMs, formatSpeed } from '../../lib/format';
import type { TestSamples } from '../../../shared/protocol';
import { TooltipCard } from './ChartParts';

const axisProps = { tickLine: false, tickMargin: 8, fontSize: 11 } as const;
const seconds = (ms: number) => Math.round(ms / 10) / 100;
const formatSeconds = (s: number) => `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
const formatTick = (s: number) => `${Math.round(s * 10) / 10} s`;

function span(points: Array<[number, number]>): [number, number] | null {
  if (!points.length) return null;
  return [seconds(points[0][0]), seconds(points[points.length - 1][0])];
}

interface Row {
  t: number;
  download?: number;
  upload?: number;
}

/** Throughput across the whole run: download then upload on one time axis. */
export function ThroughputTimeline({ samples }: { samples: TestSamples }) {
  const rows = useMemo<Row[]>(
    () =>
      [
        ...samples.download.map(([t, v]) => ({ t: seconds(t), download: v })),
        ...samples.upload.map(([t, v]) => ({ t: seconds(t), upload: v })),
      ].sort((a, b) => a.t - b.t),
    [samples],
  );
  const chart = useChart({
    data: rows,
    series: [
      { name: 'download', color: 'series.download', label: 'Download' },
      { name: 'upload', color: 'series.upload', label: 'Upload' },
    ],
  });

  return (
    <Chart.Root chart={chart} h="200px" aspectRatio="auto">
      <LineChart responsive data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} style={{ width: '100%', height: '100%' }}>
        <CartesianGrid vertical={false} stroke={chart.color('chart.grid')} />
        <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tickFormatter={formatTick} axisLine={{ stroke: chart.color('chart.axis') }} {...axisProps} />
        <YAxis width={44} axisLine={false} tickFormatter={axisSpeed} {...axisProps} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: chart.color('chart.axis'), strokeWidth: 1 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as Row | undefined;
            if (!active || !row) return null;
            const isDown = row.download !== undefined;
            return (
              <TooltipCard
                title={formatSeconds(row.t)}
                rows={[
                  {
                    key: 'v',
                    label: isDown ? 'Download' : 'Upload',
                    color: isDown ? 'series.download' : 'series.upload',
                    value: formatSpeed(isDown ? row.download : row.upload),
                  },
                ]}
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
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color(s.color) }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </Chart.Root>
  );
}

/** Every ping of the run; the shaded spans show when the link was loaded. */
export function LatencyTimeline({ samples }: { samples: TestSamples }) {
  const rows = useMemo(() => samples.ping.map(([t, rtt, phase]) => ({ t: seconds(t), rtt, phase })), [samples]);
  const down = span(samples.download);
  const up = span(samples.upload);
  const chart = useChart({ data: rows, series: [{ name: 'rtt', color: 'series.latency', label: 'Latency' }] });
  const phaseName = ['Idle', 'During download', 'During upload'];

  return (
    <Chart.Root chart={chart} h="180px" aspectRatio="auto">
      <LineChart responsive data={chart.data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }} style={{ width: '100%', height: '100%' }}>
        <CartesianGrid vertical={false} stroke={chart.color('chart.grid')} />
        {down && (
          <ReferenceArea
            x1={down[0]}
            x2={down[1]}
            fill={chart.color('series.download')}
            fillOpacity={0.07}
            stroke="none"
            ifOverflow="extendDomain"
            label={{ value: 'Download', position: 'insideTop', fill: chart.color('fg.muted'), fontSize: 11, dy: -16 }}
          />
        )}
        {up && (
          <ReferenceArea
            x1={up[0]}
            x2={up[1]}
            fill={chart.color('series.upload')}
            fillOpacity={0.07}
            stroke="none"
            ifOverflow="extendDomain"
            label={{ value: 'Upload', position: 'insideTop', fill: chart.color('fg.muted'), fontSize: 11, dy: -16 }}
          />
        )}
        <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tickFormatter={formatTick} axisLine={{ stroke: chart.color('chart.axis') }} {...axisProps} />
        <YAxis width={44} axisLine={false} tickFormatter={(v: number) => `${Number(v.toFixed(v < 10 ? 1 : 0))}`} {...axisProps} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: chart.color('chart.axis'), strokeWidth: 1 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as { t: number; rtt: number; phase: 0 | 1 | 2 } | undefined;
            if (!active || !row) return null;
            return (
              <TooltipCard
                title={`${formatSeconds(row.t)} · ${phaseName[row.phase]}`}
                rows={[{ key: 'rtt', label: 'Round trip', color: 'series.latency', value: formatMs(row.rtt) }]}
              />
            );
          }}
        />
        <Line
          type="linear"
          dataKey="rtt"
          stroke={chart.color('series.latency')}
          strokeWidth={2}
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: chart.color('bg.panel'), fill: chart.color('series.latency') }}
          isAnimationActive={false}
        />
      </LineChart>
    </Chart.Root>
  );
}
