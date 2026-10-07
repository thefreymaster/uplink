import {
  Alert,
  Box,
  Button,
  Card,
  EmptyState,
  Flex,
  Grid,
  HStack,
  NativeSelect,
  SegmentGroup,
  SimpleGrid,
  Stack,
  Stat,
  Text,
} from '@chakra-ui/react';
import { Download, History as HistoryIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TestDetailDrawer } from '../components/TestDetailDrawer';
import { TestsTable } from '../components/TestsTable';
import { Legend } from '../components/charts/ChartParts';
import { LatencyHistoryChart, ThroughputHistoryChart } from '../components/charts/HistoryCharts';
import { RANGES, type RangeKey, rangeStart, useTests } from '../hooks/useTests';
import { api } from '../lib/api';
import { type Parts, msParts, speedParts } from '../lib/format';
import { RouterLink, setParam, useLocation } from '../lib/router';
import { persistentStore, useStore } from '../lib/store';
import { useLiveEvents } from '../live/LiveProvider';
import type { DeviceSummary, TestSummary } from '../../shared/protocol';

const rangeStore = persistentStore<RangeKey>('uplink.history.range', () => '7d', (raw) =>
  RANGES.some((r) => r.value === raw) ? (raw as RangeKey) : '7d',
);

function median(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function StatCard({ label, parts, help }: { label: string; parts: Parts; help?: string }) {
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Body p="4">
        <Stat.Root gap="1">
          <Stat.Label color="fg.muted">{label}</Stat.Label>
          <HStack gap="1" align="baseline">
            <Stat.ValueText fontSize={{ base: 'xl', md: '2xl' }} fontWeight="semibold" letterSpacing="-0.01em">
              {parts.value}
            </Stat.ValueText>
            {parts.unit && <Stat.ValueUnit color="fg.muted">{parts.unit}</Stat.ValueUnit>}
          </HStack>
          {help && <Stat.HelpText color="fg.subtle">{help}</Stat.HelpText>}
        </Stat.Root>
      </Card.Body>
    </Card.Root>
  );
}

function useDevices() {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    api.devices().then(setDevices, () => undefined);
  }, [version]);
  useLiveEvents((event) => {
    if (event.t === 'test-saved' && !devices.some((d) => d.deviceId === event.test.deviceId)) setVersion((v) => v + 1);
  });
  return devices;
}

function Summary({ items }: { items: TestSummary[] }) {
  const stats = useMemo(
    () => ({
      down: median(items.map((t) => t.downloadMbps)),
      up: median(items.map((t) => t.uploadMbps)),
      latency: median(items.map((t) => t.latencyMs)),
      jitter: median(items.map((t) => t.jitterMs)),
    }),
    [items],
  );
  return (
    <SimpleGrid columns={{ base: 2, lg: 4 }} gap={{ base: '3', md: '4' }}>
      <StatCard label="Tests" parts={{ value: items.length.toLocaleString(), unit: '' }} help="In this range" />
      <StatCard label="Median download" parts={speedParts(stats.down)} />
      <StatCard label="Median upload" parts={speedParts(stats.up)} />
      <StatCard label="Median latency" parts={msParts(stats.latency)} help={`Jitter ${msParts(stats.jitter).value} ms`} />
    </SimpleGrid>
  );
}

export function HistoryPage() {
  const range = useStore(rangeStore);
  const [device, setDevice] = useState<string | null>(null);
  const devices = useDevices();
  const tests = useTests({ range, device });
  const { params } = useLocation();
  const selected = params.get('test');

  // Briefly highlight rows that arrive live from other devices.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useLiveEvents((event) => {
    if (event.t !== 'test-saved') return;
    setFresh((s) => new Set(s).add(event.test.id));
    setTimeout(() => setFresh((s) => {
      const next = new Set(s);
      next.delete(event.test.id);
      return next;
    }), 2600);
  });

  const exportHref = api.exportUrl({ since: rangeStart(range), device });
  const empty = tests.loaded && !tests.loading && !tests.error && tests.items.length === 0;

  return (
    <Stack gap={{ base: '4', md: '6' }}>
      <PageHeader
        title="History"
        description="Every test from every device, stored on your server."
        actions={
          <Button asChild size="sm" variant="outline">
            <a href={exportHref} download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />

      <Flex gap="3" wrap="wrap" align="center">
        <SegmentGroup.Root size="sm" value={range} onValueChange={(e) => e.value && rangeStore.set(e.value as RangeKey)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        </SegmentGroup.Root>
        <NativeSelect.Root size="sm" w={{ base: 'full', sm: '56' }}>
          <NativeSelect.Field
            aria-label="Device"
            value={device ?? ''}
            onChange={(e) => setDevice(e.currentTarget.value || null)}
            bg="bg.panel"
          >
            <option value="">All devices</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label ?? 'Unknown device'} ({d.count})
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>

      {tests.error && (
        <Alert.Root status="warning" size="sm">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>History is unavailable</Alert.Title>
            <Alert.Description>{tests.error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {empty ? (
        <Card.Root variant="outline" bg="bg.panel">
          <EmptyState.Root size="md">
            <EmptyState.Content>
              <EmptyState.Indicator>
                <HistoryIcon />
              </EmptyState.Indicator>
              <Stack gap="1" textAlign="center">
                <EmptyState.Title>No tests in this range</EmptyState.Title>
                <EmptyState.Description>Run a speed test from any device and it will appear here instantly.</EmptyState.Description>
              </Stack>
              <Button asChild size="sm" colorPalette="brand">
                <RouterLink href="/">Run a test</RouterLink>
              </Button>
            </EmptyState.Content>
          </EmptyState.Root>
        </Card.Root>
      ) : (
        // While a new range loads, keep the previous render dimmed instead of flashing skeletons.
        <Stack gap={{ base: '4', md: '6' }} opacity={tests.loading && tests.loaded ? 0.55 : 1} transition="opacity 0.15s">
          <Summary items={tests.items} />
          <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1.6fr) minmax(0, 1fr)' }} gap={{ base: '4', md: '6' }}>
            <Card.Root variant="outline" bg="bg.panel">
              <Card.Header flexDirection="row" justifyContent="space-between" alignItems="center" gap="3" flexWrap="wrap" pb="0">
                <Card.Title textStyle="sm" fontWeight="medium">
                  Throughput
                </Card.Title>
                <Legend
                  items={[
                    { label: 'Download', color: 'series.download' },
                    { label: 'Upload', color: 'series.upload' },
                  ]}
                />
              </Card.Header>
              <Card.Body pt="4">
                <ThroughputHistoryChart tests={tests.items} />
              </Card.Body>
            </Card.Root>
            <Card.Root variant="outline" bg="bg.panel">
              <Card.Header pb="0">
                <Card.Title textStyle="sm" fontWeight="medium">
                  Latency
                </Card.Title>
              </Card.Header>
              <Card.Body pt="4">
                <LatencyHistoryChart tests={tests.items} />
              </Card.Body>
            </Card.Root>
          </Grid>
          <Card.Root variant="outline" bg="bg.panel">
            <Card.Header pb="2">
              <Card.Title textStyle="sm" fontWeight="medium">
                All tests
              </Card.Title>
            </Card.Header>
            <Card.Body pt="0" px="2" pb="2">
              <TestsTable items={tests.items} highlight={fresh} onSelect={(id) => setParam('test', id)} />
              {tests.next && (
                <Box textAlign="center" py="3">
                  <Button size="sm" variant="ghost" onClick={() => void tests.loadMore()}>
                    Load more
                  </Button>
                </Box>
              )}
              {!tests.items.length && !tests.loaded && (
                <Text textStyle="sm" color="fg.muted" px="4" py="3">
                  Loading…
                </Text>
              )}
            </Card.Body>
          </Card.Root>
        </Stack>
      )}

      <TestDetailDrawer id={selected} onClose={() => setParam('test', null, { replace: true })} />
    </Stack>
  );
}
