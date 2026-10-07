import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSpeedTest } from '../hooks/useSpeedTest';

/** Offers new versions of the app instead of reloading on its own, which could interrupt a test. */
export function ReloadPrompt() {
  const { active } = useSpeedTest();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <Box
      role="status"
      position="fixed"
      zIndex="toast"
      bottom={{ base: 'calc(76px + env(safe-area-inset-bottom))', md: '6' }}
      right={{ base: '4', md: '6' }}
      left={{ base: '4', md: 'auto' }}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      rounded="l3"
      shadow="lg"
      px="4"
      py="3"
    >
      <HStack gap="4" justify="space-between">
        <Box>
          <Text textStyle="sm" fontWeight="medium">
            Update available
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {active ? 'Reload after the test finishes.' : 'Reload to use the latest version.'}
          </Text>
        </Box>
        <HStack gap="2">
          <Button size="xs" variant="ghost" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button size="xs" colorPalette="brand" disabled={active} onClick={() => void updateServiceWorker(true)}>
            Reload
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
