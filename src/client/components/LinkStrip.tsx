import { Box, Card, Center, HStack, Text } from '@chakra-ui/react';
import { Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMs } from '../lib/format';
import { cssColor } from '../lib/tokens';
import type { DeviceKind } from '../lib/ua';
import { DeviceIcon } from './DeviceIcon';

function Endpoint({ icon, title, subtitle, end }: { icon: ReactNode; title: string; subtitle: string; end?: boolean }) {
  return (
    <HStack gap="3" minW="0" flex="0 1 auto" maxW="42%" flexDirection={end ? 'row-reverse' : 'row'} textAlign={end ? 'end' : 'start'}>
      <Center w="9" h="9" rounded="l2" bg="bg.muted" color="fg.muted" flexShrink={0}>
        {icon}
      </Center>
      <Box minW="0">
        <Text textStyle="sm" fontWeight="medium" truncate>
          {title}
        </Text>
        <Text textStyle="xs" color="fg.muted" truncate>
          {subtitle}
        </Text>
      </Box>
    </HStack>
  );
}

interface LinkStripProps {
  deviceLabel: string;
  deviceKind: DeviceKind;
  clientIp: string | null;
  serverName: string;
  serverDetail: string;
  rtt: number | null;
  /** Animates the link in the direction data is flowing. */
  flow: 'down' | 'up' | null;
}

/** This device and the server as two endpoints of one link, in the style of a network topology view. */
export function LinkStrip({ deviceLabel, deviceKind, clientIp, serverName, serverDetail, rtt, flow }: LinkStripProps) {
  const flowColor = flow === 'down' ? 'series.download' : 'series.upload';
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Body px={{ base: '3', md: '5' }} py={{ base: '3', md: '4' }}>
        <HStack gap={{ base: '2', md: '4' }}>
          <Endpoint icon={<DeviceIcon kind={deviceKind} />} title={deviceLabel} subtitle={clientIp ?? 'This device'} />
          <Box flex="1" position="relative" minW="10" h="6" aria-hidden="true">
            <svg width="100%" height="24" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <line x1="0" y1="12" x2="100%" y2="12" stroke={cssColor('border.emphasized')} strokeWidth="1" />
              {flow && (
                <Box
                  asChild
                  animation={`${flow === 'down' ? 'flowBackward' : 'flowForward'} 0.6s linear infinite`}
                  _motionReduce={{ animation: 'none' }}
                >
                  <line x1="0" y1="12" x2="100%" y2="12" stroke={cssColor(flowColor)} strokeWidth="2" strokeDasharray="4 6" />
                </Box>
              )}
            </svg>
            <Center position="absolute" inset="0">
              <Box
                px="2"
                py="0.5"
                rounded="full"
                bg="bg.panel"
                borderWidth="1px"
                borderColor="border"
                textStyle="xs"
                color="fg.muted"
                fontVariantNumeric="tabular-nums"
                whiteSpace="nowrap"
              >
                {rtt === null ? '—' : formatMs(rtt)}
              </Box>
            </Center>
          </Box>
          <Endpoint end icon={<Server size={18} strokeWidth={1.75} />} title={serverName} subtitle={serverDetail} />
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}
