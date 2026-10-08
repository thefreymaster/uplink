import { Alert, Box, Button, Card, Grid, HStack, Icon, Link, SimpleGrid, Spinner, Stack, Text } from '@chakra-ui/react';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { Gauge } from '../components/Gauge';
import { LinkStrip } from '../components/LinkStrip';
import { MetricCard, type MetricState } from '../components/MetricCard';
import { PhaseSteps } from '../components/PhaseSteps';
import { TestsTable } from '../components/TestsTable';
import { Sparkline } from '../components/charts/Sparkline';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { type RunState, type TransferState, phaseProgress, useSpeedTest } from '../hooks/useSpeedTest';
import { useTests } from '../hooks/useTests';
import { type Parts, formatBytes, formatDuration, formatMs, formatSpeed, msParts, speedParts } from '../lib/format';
import { RouterLink, navigate, useLocation } from '../lib/router';
import { useDevice, useSettings } from '../lib/settings';
import { SERIES_TOKEN } from '../lib/tokens';
import { currentDevice } from '../lib/ua';
import { useLive } from '../live/LiveProvider';
import type { TestConfig } from '../../shared/protocol';

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The live number in the middle of the dial. */
function Readout({ icon, label, value, format }: { icon: ReactNode; label: string; value: number | null; format: (v: number | null) => Parts }) {
  const animated = useAnimatedNumber(value ?? 0, 120);
  const parts = format(value === null ? null : animated);
  return (
    <Stack gap="1.5" align="center">
      <HStack gap="1.5" color="fg.muted">
        <Icon size="sm">{icon}</Icon>
        <Text textStyle="sm" fontWeight="medium">
          {label}
        </Text>
      </HStack>
      <Text fontSize={{ base: '5xl', sm: '6xl' }} fontWeight="semibold" lineHeight="1" letterSpacing="-0.03em" fontVariantNumeric="tabular-nums">
        {parts.value}
      </Text>
      <Text textStyle="sm" color="fg.muted">
        {parts.unit}
      </Text>
    </Stack>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <Stack gap="3" align="center">
      <Spinner size="lg" color="fg.subtle" borderWidth="2px" />
      <Text textStyle="sm" color="fg.muted">
        {label}
      </Text>
    </Stack>
  );
}

function transferCard(run: RunState, phase: 'download' | 'upload', durationMs: number) {
  const t: TransferState = run[phase];
  const state: MetricState = run.phase === phase ? 'active' : t.result ? 'done' : 'pending';
  const value = t.result ? speedParts(t.result.mbps) : state === 'active' ? speedParts(t.live) : speedParts(null);
  const detail = t.result
    ? `Peak ${formatSpeed(t.result.peakMbps)} · ${formatBytes(t.result.bytes)}`
    : state === 'active'
      ? `Peak ${formatSpeed(t.peak)}`
      : 'Not measured yet';
  const label = phase === 'download' ? 'Download' : 'Upload';
  const chart =
    t.series.length > 1 ? (
      <Sparkline
        data={t.series}
        color={SERIES_TOKEN[phase]}
        label={label}
        domainX={[0, durationMs]}
        formatValue={formatSpeed}
        formatX={seconds}
      />
    ) : (
      <Box h="44px" borderBottomWidth="1px" borderColor="border.muted" />
    );
  return (
    <MetricCard
      label={label}
      color={SERIES_TOKEN[phase]}
      icon={phase === 'download' ? <ArrowDown size={18} strokeWidth={1.75} /> : <ArrowUp size={18} strokeWidth={1.75} />}
      value={value.value}
      unit={value.unit}
      state={state}
      detail={detail}
      chart={chart}
    />
  );
}

function LatencyCard({ run }: { run: RunState }) {
  const { latency } = run;
  const state: MetricState = run.phase === 'latency' ? 'active' : latency.result ? 'done' : 'pending';
  const value = latency.result ? msParts(latency.result.medianMs) : msParts(median(latency.rtts));
  const loadedDown = run.download.loaded?.medianMs ?? (run.phase === 'download' ? run.loadedRtt : null);
  const loadedUp = run.upload.loaded?.medianMs ?? (run.phase === 'upload' ? run.loadedRtt : null);
  return (
    <MetricCard
      label="Latency"
      color="series.latency"
      icon={<Activity size={18} strokeWidth={1.75} />}
      value={value.value}
      unit={value.unit}
      state={state}
      detail={
        <Stack gap="0.5">
          <Text>Jitter {formatMs(latency.result?.jitterMs ?? null)}</Text>
          <Text>
            Under load: down {formatMs(loadedDown)} · up {formatMs(loadedUp)}
          </Text>
        </Stack>
      }
      chart={
        latency.rtts.length > 1 ? (
          <Sparkline
            data={latency.rtts.map((v, i) => [i + 1, v])}
            color="series.latency"
            label="Round trip"
            domainX={[1, latency.total]}
            formatValue={formatMs}
            formatX={(x) => `Ping ${x}`}
            height={36}
          />
        ) : (
          <Box h="36px" borderBottomWidth="1px" borderColor="border.muted" />
        )
      }
    />
  );
}

function RecentTests() {
  const { db } = useLive();
  const tests = useTests({ range: 'all', device: null, limit: 6 });
  const items = tests.items.slice(0, 6);
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Header flexDirection="row" alignItems="center" justifyContent="space-between" pb="2">
        <Card.Title textStyle="sm" fontWeight="medium">
          Recent tests
        </Card.Title>
        <Link asChild textStyle="sm" color="brand.fg">
          <RouterLink href="/history">View all</RouterLink>
        </Link>
      </Card.Header>
      <Card.Body pt="0" px="2" pb="2">
        {db && !db.connected ? (
          <Text textStyle="sm" color="fg.muted" px="4" py="3">
            Results aren't being saved: {db.error ?? 'the database is unavailable'}.
          </Text>
        ) : items.length ? (
          <TestsTable compact items={items} onSelect={(id) => navigate(`/history?test=${id}`)} />
        ) : (
          <Text textStyle="sm" color="fg.muted" px="4" py="3">
            {tests.loaded ? 'No tests yet. Results from every device on your network show up here.' : 'Loading…'}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
}

function configSummary(config: Pick<TestConfig, 'durationMs' | 'streams'>) {
  return `${config.durationMs / 1000} s each way · ${config.streams} ${config.streams === 1 ? 'stream' : 'streams'}`;
}

export function TestPage() {
  const { run, active, start, cancel } = useSpeedTest();
  const live = useLive();
  const [settings] = useSettings();
  const [device] = useDevice();
  const { params } = useLocation();
  const kind = useMemo(() => currentDevice().kind, []);

  const status = live.status;
  const otherTest = status.busy && !(active && status.test.sessionId === run.sessionId) ? status.test : null;
  const canStart = live.connection === 'open' && !active && !otherTest;

  // Home-screen shortcut: /?start=1
  const wantsStart = params.get('start') === '1';
  useEffect(() => {
    if (!wantsStart || live.connection !== 'open') return;
    navigate('/', { replace: true });
    if (canStart) start();
  }, [wantsStart, live.connection, canStart, start]);

  const phase = run.phase;
  const transfer = phase === 'download' || phase === 'upload' ? run[phase] : null;
  const durationMs = run.config?.durationMs ?? settings.durationMs;

  let center: ReactNode;
  if (run.status === 'connecting' || (run.status === 'running' && !phase)) center = <Pending label="Connecting" />;
  else if (run.status === 'saving') center = <Pending label="Saving result" />;
  else if (phase === 'latency') {
    center = <Readout icon={<Activity />} label="Latency" value={median(run.latency.rtts)} format={msParts} />;
  } else if (transfer && phase) {
    center = (
      <Readout
        icon={phase === 'download' ? <ArrowDown /> : <ArrowUp />}
        label={phase === 'download' ? 'Download' : 'Upload'}
        value={transfer.live}
        format={speedParts}
      />
    );
  } else {
    center = (
      <Button
        onClick={start}
        disabled={!canStart}
        colorPalette="brand"
        rounded="full"
        w={{ base: '124px', sm: '136px' }}
        h={{ base: '124px', sm: '136px' }}
        fontSize="lg"
        fontWeight="semibold"
        aria-label="Start speed test"
      >
        {run.status === 'done' ? 'Run again' : 'Start'}
      </Button>
    );
  }

  const serverName = live.server?.name ?? run.server?.name ?? 'Server';
  const flow = phase === 'download' ? 'down' : phase === 'upload' ? 'up' : null;
  const rtt = active && run.loadedRtt !== null ? run.loadedRtt : live.rtt;

  return (
    <Stack gap={{ base: '4', md: '6' }}>
      <LinkStrip
        deviceLabel={device.label}
        deviceKind={kind}
        clientIp={live.clientIp ?? run.clientIp}
        serverName={serverName}
        serverDetail={
          live.connection === 'open' ? `Uplink ${live.server?.version ?? ''}` : live.connection === 'connecting' ? 'Connecting…' : 'Unreachable'
        }
        rtt={rtt}
        flow={flow}
      />

      {otherTest && (
        <Alert.Root status="info" variant="surface" size="sm">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{otherTest.deviceLabel} is running a test</Alert.Title>
            <Alert.Description>
              {otherTest.phase === 'download' || otherTest.phase === 'upload'
                ? `${otherTest.phase === 'download' ? 'Download' : 'Upload'} ${formatSpeed(otherTest.mbps)}. `
                : ''}
              Tests run one at a time so they don't skew each other. You can start once it finishes.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1.15fr) minmax(0, 1fr)' }} gap={{ base: '4', md: '6' }} alignItems="start">
        <Card.Root variant="outline" bg="bg.panel">
          <Card.Body alignItems="center" gap="6" px={{ base: '4', md: '8' }} py={{ base: '5', md: '8' }}>
            <Gauge
              value={transfer?.live ?? 0}
              color={phase ? SERIES_TOKEN[phase] : 'series.download'}
              progress={phaseProgress(run)}
              peak={transfer ? transfer.peak : null}
              center={center}
              label={transfer && phase ? `${phase} ${formatSpeed(transfer.live)}` : 'Speed dial'}
            />
            <PhaseSteps run={run} />
            <HStack w="full" justify="space-between" minH="8" gap="3">
              <Text textStyle="xs" color="fg.muted">
                {run.status === 'done' && run.test
                  ? `Completed in ${formatDuration(run.test.durationMs)} · ${configSummary({ durationMs: run.test.phaseDurationMs, streams: run.test.streams })}`
                  : active
                    ? configSummary(run.config ?? settings)
                    : live.connection !== 'open'
                      ? 'The server is unreachable.'
                      : otherTest
                        ? 'Waiting for the other test to finish.'
                        : 'Ready.'}
              </Text>
              {active && (
                <Button size="xs" variant="outline" onClick={cancel} disabled={run.status === 'saving'}>
                  Cancel
                </Button>
              )}
            </HStack>
            {run.status === 'error' && run.error && run.error.code !== 'cancelled' && run.error.code !== 'busy' && (
              <Alert.Root status="error" size="sm">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>The test didn't finish</Alert.Title>
                  <Alert.Description>{run.error.message}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}
          </Card.Body>
        </Card.Root>

        <SimpleGrid columns={{ base: 2, lg: 1 }} gap={{ base: '3', md: '4' }}>
          {transferCard(run, 'download', durationMs)}
          {transferCard(run, 'upload', durationMs)}
          <Box gridColumn={{ base: 'span 2', lg: 'auto' }}>
            <LatencyCard run={run} />
          </Box>
        </SimpleGrid>
      </Grid>

      <RecentTests />
    </Stack>
  );
}
