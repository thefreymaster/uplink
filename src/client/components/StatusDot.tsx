import { Box, HStack, Text } from '@chakra-ui/react';
import type { Connection } from '../live/LiveProvider';

export type StatusTone = 'good' | 'warning' | 'critical' | 'idle';

export function StatusDot({ tone, pulse }: { tone: StatusTone; pulse?: boolean }) {
  return (
    <Box
      as="span"
      display="inline-block"
      w="2"
      h="2"
      rounded="full"
      flexShrink={0}
      bg={`status.${tone}`}
      animation={pulse ? 'softPulse 1.6s ease-in-out infinite' : undefined}
    />
  );
}

export function connectionTone(connection: Connection): { tone: StatusTone; label: string } {
  switch (connection) {
    case 'open':
      return { tone: 'good', label: 'Connected' };
    case 'connecting':
      return { tone: 'warning', label: 'Connecting' };
    default:
      return { tone: 'critical', label: 'Offline' };
  }
}

/** Status is always dot + words, never color alone. */
export function ConnectionStatus({ connection, name }: { connection: Connection; name?: string | null }) {
  const { tone, label } = connectionTone(connection);
  return (
    <HStack gap="2" minW="0">
      <StatusDot tone={tone} pulse={connection === 'connecting'} />
      <Text textStyle="xs" color="fg.muted" truncate>
        {connection === 'open' && name ? name : label}
      </Text>
    </HStack>
  );
}
