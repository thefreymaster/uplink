import { Box, Card, HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { LineKey } from './charts/ChartParts';

export type MetricState = 'pending' | 'active' | 'done';

interface MetricCardProps {
  label: string;
  color: string;
  icon: ReactNode;
  value: string;
  unit: string;
  state: MetricState;
  detail?: ReactNode;
  chart?: ReactNode;
}

export function MetricCard({ label, color, icon, value, unit, state, detail, chart }: MetricCardProps) {
  return (
    <Card.Root
      variant="outline"
      bg="bg.panel"
      borderColor={state === 'active' ? color : 'border'}
      transition="border-color 0.2s"
      overflow="hidden"
      aria-live={state === 'done' ? 'polite' : undefined}
    >
      <Card.Body p="4" gap="2.5">
        <HStack justify="space-between">
          <HStack gap="2">
            <LineKey color={color} />
            <Text textStyle="sm" fontWeight="medium" color="fg.muted">
              {label}
            </Text>
          </HStack>
          <Box color={state === 'pending' ? 'fg.subtle' : 'fg.muted'} display="flex">
            {icon}
          </Box>
        </HStack>
        <HStack gap="1.5" align="baseline">
          <Text
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="semibold"
            letterSpacing="-0.02em"
            lineHeight="1"
            color={state === 'pending' ? 'fg.subtle' : 'fg'}
            fontVariantNumeric={state === 'active' ? 'tabular-nums' : undefined}
          >
            {value}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {unit}
          </Text>
        </HStack>
        {detail && (
          <Box textStyle="xs" color="fg.muted" minH="4">
            {detail}
          </Box>
        )}
        {chart}
      </Card.Body>
    </Card.Root>
  );
}
