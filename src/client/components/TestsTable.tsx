import { Box, HStack, Stack, Table, Text } from '@chakra-ui/react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatDateTime, formatDuration, formatMs, formatShortDateTime } from '../lib/format';
import { cssColor } from '../lib/tokens';
import type { TestSummary } from '../../shared/protocol';

const number = (value: number | null, digits: (v: number) => number) =>
  value === null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: digits(value), maximumFractionDigits: digits(value) });

const mbpsDigits = (v: number) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
const msDigits = (v: number) => (v < 1 ? 2 : v < 100 ? 1 : 0);

interface TestsTableProps {
  items: TestSummary[];
  onSelect(id: string): void;
  compact?: boolean;
  highlight?: ReadonlySet<string>;
}

/** Phones: one stacked row per test instead of a table that scrolls sideways. */
function TestsList({ items, onSelect, highlight }: TestsTableProps) {
  return (
    <Stack as="ul" gap="0" hideFrom="md" listStyleType="none">
      {items.map((test) => (
        <Box as="li" key={test.id} borderBottomWidth="1px" borderColor="border.muted" _last={{ borderBottomWidth: '0' }}>
          <Box
            as="button"
            w="full"
            display="flex"
            alignItems="center"
            gap="3"
            px="3"
            py="2.5"
            textAlign="start"
            rounded="l2"
            cursor="pointer"
            _hover={{ bg: 'bg.subtle' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'brand.focusRing' }}
            animation={highlight?.has(test.id) ? 'rowFlash 2.4s ease-out' : undefined}
            onClick={() => onSelect(test.id)}
          >
            <Box flex="1" minW="0">
              <Text textStyle="sm" fontWeight="medium" truncate>
                {test.deviceLabel ?? 'Unknown device'}
              </Text>
              <Text textStyle="xs" color="fg.muted" truncate>
                {formatShortDateTime(test.createdAt)} · {formatMs(test.latencyMs)}
              </Text>
            </Box>
            <Stack gap="0.5" align="end" flexShrink={0} fontVariantNumeric="tabular-nums">
              <HStack gap="3" textStyle="sm" fontWeight="medium">
                <HStack gap="1">
                  <ArrowDown size={14} strokeWidth={2} color={cssColor('series.download')} aria-label="Download" />
                  {number(test.downloadMbps, mbpsDigits)}
                </HStack>
                <HStack gap="1">
                  <ArrowUp size={14} strokeWidth={2} color={cssColor('series.upload')} aria-label="Upload" />
                  {number(test.uploadMbps, mbpsDigits)}
                </HStack>
              </HStack>
              <Text textStyle="xs" color="fg.subtle">
                Mbps
              </Text>
            </Stack>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function TestsTable(props: TestsTableProps) {
  return (
    <>
      <TestsList {...props} />
      <Box hideBelow="md">
        <TestsGrid {...props} />
      </Box>
    </>
  );
}

function TestsGrid({ items, onSelect, compact, highlight }: TestsTableProps) {
  return (
    <Table.ScrollArea>
      <Table.Root size="sm" interactive css={{ '& td, & th': { fontVariantNumeric: 'tabular-nums' } }}>
        <Table.Header>
          <Table.Row bg="transparent">
            <Table.ColumnHeader color="fg.muted" fontWeight="medium">
              Time
            </Table.ColumnHeader>
            <Table.ColumnHeader color="fg.muted" fontWeight="medium">
              Device
            </Table.ColumnHeader>
            <Table.ColumnHeader color="fg.muted" fontWeight="medium" textAlign="end">
              Download <Text as="span" color="fg.subtle">Mbps</Text>
            </Table.ColumnHeader>
            <Table.ColumnHeader color="fg.muted" fontWeight="medium" textAlign="end">
              Upload <Text as="span" color="fg.subtle">Mbps</Text>
            </Table.ColumnHeader>
            <Table.ColumnHeader color="fg.muted" fontWeight="medium" textAlign="end">
              Latency <Text as="span" color="fg.subtle">ms</Text>
            </Table.ColumnHeader>
            {!compact && (
              <>
                <Table.ColumnHeader color="fg.muted" fontWeight="medium" textAlign="end" hideBelow="md">
                  Jitter <Text as="span" color="fg.subtle">ms</Text>
                </Table.ColumnHeader>
                <Table.ColumnHeader color="fg.muted" fontWeight="medium" textAlign="end" hideBelow="lg">
                  Duration
                </Table.ColumnHeader>
              </>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((test) => (
            <Table.Row
              key={test.id}
              cursor="pointer"
              tabIndex={0}
              bg="transparent"
              onClick={() => onSelect(test.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(test.id);
                }
              }}
              animation={highlight?.has(test.id) ? 'rowFlash 2.4s ease-out' : undefined}
              _focusVisible={{ outline: '2px solid', outlineColor: 'brand.focusRing', outlineOffset: '-2px' }}
            >
              <Table.Cell whiteSpace="nowrap" color="fg.muted">
                {formatDateTime(test.createdAt)}
              </Table.Cell>
              <Table.Cell maxW={{ base: '32', md: '56' }}>
                <Box truncate>{test.deviceLabel ?? 'Unknown device'}</Box>
              </Table.Cell>
              <Table.Cell textAlign="end" fontWeight="medium">
                {number(test.downloadMbps, mbpsDigits)}
              </Table.Cell>
              <Table.Cell textAlign="end" fontWeight="medium">
                {number(test.uploadMbps, mbpsDigits)}
              </Table.Cell>
              <Table.Cell textAlign="end">{number(test.latencyMs, msDigits)}</Table.Cell>
              {!compact && (
                <>
                  <Table.Cell textAlign="end" hideBelow="md" color="fg.muted">
                    {number(test.jitterMs, msDigits)}
                  </Table.Cell>
                  <Table.Cell textAlign="end" hideBelow="lg" color="fg.muted" whiteSpace="nowrap">
                    {formatDuration(test.durationMs)}
                  </Table.Cell>
                </>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
