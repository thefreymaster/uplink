import { Box, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { Check } from 'lucide-react';
import { type RunState, phaseProgress } from '../hooks/useSpeedTest';
import { formatDuration } from '../lib/format';
import { SERIES_TOKEN } from '../lib/tokens';
import type { Phase } from '../../shared/protocol';

const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: 'latency', label: 'Latency' },
  { phase: 'download', label: 'Download' },
  { phase: 'upload', label: 'Upload' },
];

function stepState(run: RunState, phase: Phase): { progress: number; state: 'pending' | 'active' | 'done' } {
  const done =
    (phase === 'latency' && run.latency.result !== null) ||
    (phase === 'download' && run.download.result !== null) ||
    (phase === 'upload' && run.upload.result !== null);
  if (done) return { progress: 1, state: 'done' };
  if (run.phase === phase) return { progress: phaseProgress(run), state: 'active' };
  return { progress: 0, state: 'pending' };
}

export function PhaseSteps({ run }: { run: RunState }) {
  const transferring = run.phase === 'download' || run.phase === 'upload';
  return (
    <HStack gap="3" w="full" align="start">
      {STEPS.map(({ phase, label }) => {
        const { progress, state } = stepState(run, phase);
        const color = SERIES_TOKEN[phase];
        return (
          <Stack key={phase} flex="1" gap="1.5" minW="0">
            <HStack gap="1.5" justify="space-between">
              <HStack gap="1.5" minW="0">
                {state === 'done' ? (
                  <Icon size="xs" color="fg.muted">
                    <Check strokeWidth={2.5} />
                  </Icon>
                ) : (
                  <Box
                    w="1.5"
                    h="1.5"
                    rounded="full"
                    bg={state === 'active' ? color : 'gauge.track'}
                    animation={state === 'active' ? 'softPulse 1.4s ease-in-out infinite' : undefined}
                  />
                )}
                <Text textStyle="xs" fontWeight="medium" color={state === 'pending' ? 'fg.subtle' : 'fg.muted'} truncate>
                  {label}
                </Text>
              </HStack>
              {state === 'active' && transferring && run.config && (
                <Text textStyle="xs" color="fg.subtle" fontVariantNumeric="tabular-nums" hideBelow="sm">
                  {formatDuration(Math.max(0, run.config.durationMs - run[run.phase as 'download' | 'upload'].elapsed))}
                </Text>
              )}
            </HStack>
            <Box h="2px" bg="gauge.track" rounded="full" overflow="hidden">
              <Box h="full" bg={state === 'pending' ? 'transparent' : color} style={{ width: `${progress * 100}%` }} transition="width 0.12s linear" />
            </Box>
          </Stack>
        );
      })}
    </HStack>
  );
}
