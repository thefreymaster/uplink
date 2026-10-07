import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Flex gap="4" align={{ base: 'start', sm: 'center' }} justify="space-between" direction={{ base: 'column', sm: 'row' }}>
      <Box minW="0">
        <Heading as="h1" textStyle={{ base: 'xl', md: '2xl' }} fontWeight="semibold" letterSpacing="-0.01em">
          {title}
        </Heading>
        {description && (
          <Text textStyle="sm" color="fg.muted" mt="1">
            {description}
          </Text>
        )}
      </Box>
      {actions && <Box flexShrink={0}>{actions}</Box>}
    </Flex>
  );
}
