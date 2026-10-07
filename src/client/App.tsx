import { Button, EmptyState, Stack } from '@chakra-ui/react';
import { Compass } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { RouterLink, useLocation } from './lib/router';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { TestPage } from './pages/TestPage';

const ROUTES: Record<string, { title: string; render: () => ReactNode }> = {
  '/': { title: 'Speed test', render: () => <TestPage /> },
  '/history': { title: 'History', render: () => <HistoryPage /> },
  '/settings': { title: 'Settings', render: () => <SettingsPage /> },
};

function NotFound() {
  return (
    <EmptyState.Root>
      <EmptyState.Content>
        <EmptyState.Indicator>
          <Compass />
        </EmptyState.Indicator>
        <Stack textAlign="center" gap="1">
          <EmptyState.Title>Page not found</EmptyState.Title>
          <EmptyState.Description>That address doesn't exist in Uplink.</EmptyState.Description>
        </Stack>
        <Button asChild size="sm" colorPalette="brand">
          <RouterLink href="/">Go to speed test</RouterLink>
        </Button>
      </EmptyState.Content>
    </EmptyState.Root>
  );
}

export function App() {
  const { pathname } = useLocation();
  const route = ROUTES[pathname];

  useEffect(() => {
    document.title = route ? `${route.title} · Uplink` : 'Uplink';
  }, [route]);

  return <AppShell>{route ? route.render() : <NotFound />}</AppShell>;
}
