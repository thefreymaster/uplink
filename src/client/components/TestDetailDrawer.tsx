import {
  Alert,
  Box,
  Button,
  CloseButton,
  Code,
  DataList,
  Dialog,
  Drawer,
  HStack,
  Portal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { type Parts, formatBytes, formatDateTime, formatDuration, formatMs, formatSpeed, msParts, speedParts } from '../lib/format';
import { parseUserAgent } from '../lib/ua';
import { useLiveEvents } from '../live/LiveProvider';
import type { TestDetail } from '../../shared/protocol';
import { Legend, LineKey } from './charts/ChartParts';
import { LatencyTimeline, ThroughputTimeline } from './charts/TimelineCharts';
import { toaster } from './ui/toaster';

function Figure({ label, parts, color }: { label: string; parts: Parts; color?: string }) {
  return (
    <Box borderWidth="1px" borderColor="border" rounded="l2" px="3" py="2.5">
      <HStack gap="2">
        {color && <LineKey color={color} />}
        <Text textStyle="xs" color="fg.muted">
          {label}
        </Text>
      </HStack>
      <HStack gap="1" align="baseline" mt="1">
        <Text textStyle="xl" fontWeight="semibold" letterSpacing="-0.01em">
          {parts.value}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {parts.unit}
        </Text>
      </HStack>
    </Box>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack gap="2.5">
      <HStack justify="space-between">
        <Text textStyle="sm" fontWeight="medium">
          {title}
        </Text>
        {aside}
      </HStack>
      {children}
    </Stack>
  );
}

function DeleteTest({ id, onDeleted }: { id: string; onDeleted(): void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteTest(id);
      setOpen(false);
      onDeleted();
      toaster.create({ type: 'info', title: 'Result deleted' });
    } catch (err) {
      toaster.create({ type: 'error', title: 'Could not delete', description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root role="alertdialog" open={open} onOpenChange={(e) => setOpen(e.open)} size="sm" placement="center">
      <Dialog.Trigger asChild>
        <Button variant="ghost" colorPalette="red" size="sm">
          <Trash2 /> Delete
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete this result?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text textStyle="sm" color="fg.muted">
                It will be removed from the history on every device. This can't be undone.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button colorPalette="red" size="sm" loading={busy} onClick={() => void remove()}>
                Delete
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Details({ test }: { test: TestDetail }) {
  const ua = test.userAgent ? parseUserAgent(test.userAgent) : null;
  const rows: Array<[string, React.ReactNode]> = [
    ['Device', test.deviceLabel ?? 'Unknown device'],
    ['Browser', ua ? `${ua.browser} on ${ua.os}` : '—'],
    ['Client address', test.clientIp ?? '—'],
    ['Test duration', formatDuration(test.durationMs)],
    ['Per direction', `${formatDuration(test.phaseDurationMs)} · ${test.streams} ${test.streams === 1 ? 'stream' : 'streams'}`],
    ['Peak', `Down ${formatSpeed(test.downloadPeakMbps)} · Up ${formatSpeed(test.uploadPeakMbps)}`],
    ['Transferred', `Down ${formatBytes(test.downloadBytes)} · Up ${formatBytes(test.uploadBytes)}`],
    ['Latency under load', `Down ${formatMs(test.loadedDownMs)} · Up ${formatMs(test.loadedUpMs)}`],
    ['Latency range', test.latencyMinMs === null ? '—' : `${formatMs(test.latencyMinMs)} – ${formatMs(test.latencyMaxMs)}`],
    ['Server', `${test.serverName ?? '—'}${test.appVersion ? ` · Uplink ${test.appVersion}` : ''}`],
    ['Test ID', <Code size="sm" variant="surface" key="id">{test.id}</Code>],
  ];
  return (
    <DataList.Root orientation="horizontal" size="sm" gap="2.5">
      {rows.map(([label, value]) => (
        <DataList.Item key={label}>
          <DataList.ItemLabel minW="36" color="fg.muted">
            {label}
          </DataList.ItemLabel>
          <DataList.ItemValue minW="0" wordBreak="break-word">
            {value}
          </DataList.ItemValue>
        </DataList.Item>
      ))}
    </DataList.Root>
  );
}

export function TestDetailDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const [state, setState] = useState<{ test: TestDetail | null; error: string | null }>({ test: null, error: null });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ test: null, error: null });
    api
      .test(id)
      .then((test) => !cancelled && setState({ test, error: null }))
      .catch((err: Error) => !cancelled && setState({ test: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useLiveEvents((event) => {
    if (event.t === 'test-deleted' && event.id === id) onClose();
  });

  const { test, error } = state;
  const samples = test?.samples;
  return (
    <Drawer.Root open={id !== null} onOpenChange={(e) => !e.open && onClose()} size={{ base: 'full', md: 'md' }}>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header pb="3">
              <Stack gap="0.5">
                <Drawer.Title>Test result</Drawer.Title>
                <Text textStyle="sm" color="fg.muted" minH="5">
                  {test ? formatDateTime(test.createdAt) : ''}
                </Text>
              </Stack>
            </Drawer.Header>
            <Drawer.Body>
              {error && (
                <Alert.Root status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Root>
              )}
              {!test && !error && (
                <Stack gap="4">
                  <SimpleGrid columns={2} gap="3">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} h="16" rounded="l2" />
                    ))}
                  </SimpleGrid>
                  <Skeleton h="48" rounded="l2" />
                </Stack>
              )}
              {test && (
                <Stack gap="6">
                  <SimpleGrid columns={2} gap="3">
                    <Figure label="Download" color="series.download" parts={speedParts(test.downloadMbps)} />
                    <Figure label="Upload" color="series.upload" parts={speedParts(test.uploadMbps)} />
                    <Figure label="Latency" color="series.latency" parts={msParts(test.latencyMs)} />
                    <Figure label="Jitter" parts={msParts(test.jitterMs)} />
                  </SimpleGrid>
                  {samples && samples.download.length + samples.upload.length > 1 && (
                    <Section
                      title="Throughput"
                      aside={
                        <Legend
                          items={[
                            { label: 'Download', color: 'series.download' },
                            { label: 'Upload', color: 'series.upload' },
                          ]}
                        />
                      }
                    >
                      <ThroughputTimeline samples={samples} />
                    </Section>
                  )}
                  {samples && samples.ping.length > 1 && (
                    <Section title="Latency">
                      <LatencyTimeline samples={samples} />
                    </Section>
                  )}
                  <Section title="Details">
                    <Details test={test} />
                  </Section>
                </Stack>
              )}
            </Drawer.Body>
            <Drawer.Footer justifyContent="space-between">
              {test ? <DeleteTest id={test.id} onDeleted={onClose} /> : <span />}
              <Drawer.ActionTrigger asChild>
                <Button variant="outline" size="sm">
                  Close
                </Button>
              </Drawer.ActionTrigger>
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
