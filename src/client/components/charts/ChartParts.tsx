import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { cssColor } from '../../lib/tokens';

/** Identity key for a line series: a short stroke in the series color. */
export function LineKey({ color }: { color: string }) {
  return <Box as="span" display="inline-block" w="3" h="2px" rounded="full" flexShrink={0} style={{ background: cssColor(color) }} />;
}

export interface LegendItem {
  label: string;
  color: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <HStack gap="4" flexWrap="wrap" role="list" aria-label="Legend">
      {items.map((item) => (
        <HStack key={item.label} gap="1.5" role="listitem">
          <LineKey color={item.color} />
          <Text textStyle="xs" color="fg.muted">
            {item.label}
          </Text>
        </HStack>
      ))}
    </HStack>
  );
}

export interface TooltipRow {
  key: string;
  label: string;
  color: string;
  value: string;
}

/** Tooltip body: the value is the strong element, the series name follows in secondary ink. */
export function TooltipCard({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <Box bg="bg.panel" borderWidth="1px" borderColor="border" rounded="l2" shadow="md" px="3" py="2" minW="36" textStyle="xs">
      {title && (
        <Text color="fg.muted" mb="1.5">
          {title}
        </Text>
      )}
      <Stack gap="1">
        {rows.map((row) => (
          <HStack key={row.key} gap="2">
            <LineKey color={row.color} />
            <Text fontWeight="semibold" color="fg" fontVariantNumeric="tabular-nums">
              {row.value}
            </Text>
            <Text color="fg.muted">{row.label}</Text>
          </HStack>
        ))}
      </Stack>
      {footer && (
        <Text color="fg.subtle" mt="1.5">
          {footer}
        </Text>
      )}
    </Box>
  );
}
