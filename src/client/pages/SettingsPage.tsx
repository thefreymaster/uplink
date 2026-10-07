import { Box, Button, Card, DataList, Field, Flex, HStack, Input, SegmentGroup, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { StatusDot } from '../components/StatusDot';
import { type ColorModePreference, useColorMode } from '../components/ui/color-mode';
import { api } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useInstall } from '../lib/install';
import { useDevice, useSettings } from '../lib/settings';
import { defaultDeviceLabel } from '../lib/ua';
import { useLive } from '../live/LiveProvider';
import { DURATION_OPTIONS_MS, STREAM_OPTIONS } from '../../shared/measure';
import type { InfoResponse } from '../../shared/protocol';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Header pb="0">
        <Card.Title textStyle="md" fontWeight="semibold">
          {title}
        </Card.Title>
        {description && (
          <Card.Description textStyle="sm" color="fg.muted">
            {description}
          </Card.Description>
        )}
      </Card.Header>
      <Card.Body pt="5">
        <Stack gap="5">{children}</Stack>
      </Card.Body>
    </Card.Root>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <Flex gap={{ base: '2.5', md: '6' }} direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'center' }} justify="space-between">
      <Box minW="0">
        <Text textStyle="sm" fontWeight="medium">
          {label}
        </Text>
        {help && (
          <Text textStyle="xs" color="fg.muted" mt="0.5">
            {help}
          </Text>
        )}
      </Box>
      <Box flexShrink={0} overflowX="auto">
        {children}
      </Box>
    </Flex>
  );
}

function InstallSection() {
  const install = useInstall();
  let body: React.ReactNode;
  if (install.installed) body = <Text textStyle="sm">Uplink is installed on this device.</Text>;
  else if (install.canPrompt) {
    body = (
      <Box>
        <Button size="sm" colorPalette="brand" onClick={() => void install.promptInstall()}>
          Install Uplink
        </Button>
      </Box>
    );
  } else if (!install.secure) {
    body = (
      <Text textStyle="sm" color="fg.muted">
        Installing needs HTTPS. Open Uplink through your reverse proxy (an https:// address) and the install option will appear.
      </Text>
    );
  } else if (install.iosSafari) {
    body = (
      <Text textStyle="sm" color="fg.muted">
        In Safari, tap Share, then Add to Home Screen.
      </Text>
    );
  } else {
    body = (
      <Text textStyle="sm" color="fg.muted">
        Use the install option in your browser's address bar or menu.
      </Text>
    );
  }
  return (
    <Section title="Install app" description="Run Uplink from your home screen or dock like a native app.">
      {body}
    </Section>
  );
}

export function SettingsPage() {
  const [settings, update] = useSettings();
  const [device, setDeviceLabel] = useDevice();
  const [label, setLabel] = useState(device.label);
  const { preference, setPreference } = useColorMode();
  const live = useLive();
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const limits = live.server?.limits;

  useEffect(() => {
    api.info().then(setInfo, () => setInfo(null));
  }, [live.db?.connected, live.connection]);

  const db = live.db ?? info?.db ?? null;
  const dbTone = db?.connected ? 'good' : db?.configured ? 'critical' : 'idle';
  const dbText = db?.connected ? 'Connected' : db?.configured ? (db.error ?? 'Unavailable') : 'Not configured: results are not saved';

  return (
    <Stack gap={{ base: '4', md: '6' }} maxW="3xl">
      <PageHeader title="Settings" description="Test preferences are stored on this device." />

      <Section title="This device" description="Every result is tagged with this name.">
        <Field.Root>
          <Field.Label>Device name</Field.Label>
          <Input
            value={label}
            maxLength={64}
            onChange={(e) => setLabel(e.currentTarget.value)}
            onBlur={() => {
              const next = label.trim() || defaultDeviceLabel();
              setLabel(next);
              setDeviceLabel(next);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            size="sm"
            bg="bg.panel"
          />
          <Field.HelperText>For example "Office desktop" or "Living room iPad".</Field.HelperText>
        </Field.Root>
      </Section>

      <Section title="Test" description="How each run loads the link.">
        <Row label="Duration per direction" help="Longer runs average out bursty links such as Wi-Fi.">
          <SegmentGroup.Root
            size="sm"
            value={String(settings.durationMs)}
            onValueChange={(e) => e.value && update({ durationMs: Number(e.value) })}
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items
              items={DURATION_OPTIONS_MS.map((ms) => ({
                value: String(ms),
                label: `${ms / 1000} s`,
                disabled: limits ? ms > limits.maxDurationMs : false,
              }))}
            />
          </SegmentGroup.Root>
        </Row>
        <Row label="Parallel connections" help="More connections fill fast links; one shows single-stream speed.">
          <SegmentGroup.Root size="sm" value={String(settings.streams)} onValueChange={(e) => e.value && update({ streams: Number(e.value) })}>
            <SegmentGroup.Indicator />
            <SegmentGroup.Items
              items={STREAM_OPTIONS.map((n) => ({
                value: String(n),
                label: String(n),
                disabled: limits ? n > limits.maxStreams : false,
              }))}
            />
          </SegmentGroup.Root>
        </Row>
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <SegmentGroup.Root size="sm" value={preference} onValueChange={(e) => e.value && setPreference(e.value as ColorModePreference)}>
            <SegmentGroup.Indicator />
            <SegmentGroup.Items
              items={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </SegmentGroup.Root>
        </Row>
      </Section>

      <Section title="Server">
        <DataList.Root orientation="horizontal" size="sm" gap="3">
          <DataList.Item>
            <DataList.ItemLabel minW="36">Name</DataList.ItemLabel>
            <DataList.ItemValue>{live.server?.name ?? '—'}</DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel minW="36">Version</DataList.ItemLabel>
            <DataList.ItemValue>{live.server?.version ?? '—'}</DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel minW="36">Database</DataList.ItemLabel>
            <DataList.ItemValue>
              <HStack gap="2" minW="0">
                <StatusDot tone={dbTone} />
                <Text truncate>{dbText}</Text>
              </HStack>
            </DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel minW="36">Stored tests</DataList.ItemLabel>
            <DataList.ItemValue>{info?.db.tests?.toLocaleString() ?? '—'}</DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel minW="36">Your address</DataList.ItemLabel>
            <DataList.ItemValue>{live.clientIp ?? '—'}</DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel minW="36">Limits</DataList.ItemLabel>
            <DataList.ItemValue>
              {limits ? `Up to ${formatDuration(limits.maxDurationMs)} per direction · ${limits.maxStreams} connections` : '—'}
            </DataList.ItemValue>
          </DataList.Item>
        </DataList.Root>
      </Section>

      <InstallSection />
    </Stack>
  );
}
