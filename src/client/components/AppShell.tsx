import { Box, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { Gauge, History, type LucideIcon, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSpeedTest } from '../hooks/useSpeedTest';
import { RouterLink, useLocation } from '../lib/router';
import { SERIES_TOKEN } from '../lib/tokens';
import { useLive } from '../live/LiveProvider';
import { Logo } from './Logo';
import { ConnectionStatus } from './StatusDot';

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Speed test', icon: Gauge },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

/** A dot on the Speed test nav item while a run continues in the background. */
function RunningDot() {
  const { active, run } = useSpeedTest();
  if (!active) return null;
  return (
    <Box
      w="1.5"
      h="1.5"
      rounded="full"
      bg={run.phase ? SERIES_TOKEN[run.phase] : 'fg.subtle'}
      animation="softPulse 1.4s ease-in-out infinite"
      aria-label="Test running"
    />
  );
}

function SideNav() {
  const { pathname } = useLocation();
  const live = useLive();
  return (
    // The outer box carries the panel color the full height of the page; the inner column sticks.
    <Box display={{ base: 'none', md: 'block' }} w="232px" flexShrink={0} bg="bg.panel" borderRightWidth="1px" borderColor="border">
      <Flex as="nav" aria-label="Main" direction="column" position="sticky" top="0" h="100dvh" px="3" py="5">
        <Box px="2" mb="7">
          <Logo />
        </Box>
        <Stack gap="0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const current = pathname === href;
            return (
              <Box
                asChild
                key={href}
                display="flex"
                alignItems="center"
                gap="3"
                h="9"
                px="2.5"
                rounded="l2"
                textStyle="sm"
                fontWeight="medium"
                color={current ? 'fg' : 'fg.muted'}
                bg={current ? 'bg.muted' : 'transparent'}
                _hover={{ bg: current ? 'bg.muted' : 'bg.subtle', color: 'fg' }}
                focusRingColor="brand.focusRing"
              >
                <RouterLink href={href} aria-current={current ? 'page' : undefined}>
                  <Box color={current ? 'brand.fg' : 'inherit'} display="flex">
                    <Icon size={18} strokeWidth={1.75} />
                  </Box>
                  <Text flex="1">{label}</Text>
                  {href === '/' && <RunningDot />}
                </RouterLink>
              </Box>
            );
          })}
        </Stack>
        <Box mt="auto" px="2.5" pt="4" borderTopWidth="1px" borderColor="border.muted">
          <ConnectionStatus connection={live.connection} name={live.server?.name} />
          {live.server && (
            <Text textStyle="xs" color="fg.subtle" mt="1">
              Uplink {live.server.version}
            </Text>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

function MobileHeader() {
  const live = useLive();
  return (
    <HStack
      display={{ base: 'flex', md: 'none' }}
      justify="space-between"
      position="sticky"
      top="0"
      zIndex="sticky"
      bg="bg"
      px="4"
      pt="calc(env(safe-area-inset-top) + 10px)"
      pb="2.5"
      borderBottomWidth="1px"
      borderColor="border.muted"
    >
      <Logo />
      <Box maxW="50%">
        <ConnectionStatus connection={live.connection} name={live.server?.name} />
      </Box>
    </HStack>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <HStack
      as="nav"
      aria-label="Main"
      display={{ base: 'flex', md: 'none' }}
      position="fixed"
      bottom="0"
      insetX="0"
      zIndex="sticky"
      bg="bg.panel"
      borderTopWidth="1px"
      borderColor="border"
      pb="env(safe-area-inset-bottom)"
      gap="0"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const current = pathname === href;
        return (
          <Box
            asChild
            key={href}
            flex="1"
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap="1"
            pt="2"
            pb="1.5"
            color={current ? 'brand.fg' : 'fg.muted'}
            textStyle="2xs"
            fontWeight="medium"
          >
            <RouterLink href={href} aria-current={current ? 'page' : undefined}>
              <Box position="relative" display="flex">
                <Icon size={22} strokeWidth={1.75} />
                {href === '/' && (
                  <Box position="absolute" top="-1" right="-1.5">
                    <RunningDot />
                  </Box>
                )}
              </Box>
              {label}
            </RouterLink>
          </Box>
        );
      })}
    </HStack>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Flex minH="100dvh">
      <SideNav />
      <Flex flex="1" minW="0" direction="column">
        <MobileHeader />
        <Box
          as="main"
          flex="1"
          w="full"
          maxW="1180px"
          mx="auto"
          px={{ base: '4', md: '8' }}
          pt={{ base: '4', md: '8' }}
          pb={{ base: 'calc(84px + env(safe-area-inset-bottom))', md: '10' }}
        >
          {children}
        </Box>
      </Flex>
      <BottomNav />
    </Flex>
  );
}
