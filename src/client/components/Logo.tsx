import { HStack, Text } from '@chakra-ui/react';
import { cssColor } from '../lib/tokens';

/** The app mark: a dial opening at the bottom with an upward arrow. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="120" fill={cssColor('brand.solid')} />
      <path
        d="M 149.93 362.07 A 150 150 0 1 1 362.07 362.07"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="38"
        strokeLinecap="round"
      />
      <path d="M 149.93 362.07 A 150 150 0 1 1 391.95 192.61" fill="none" stroke="#fff" strokeWidth="38" strokeLinecap="round" />
      <path d="M256 318V206M210 250l46-46 46 46" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <HStack gap="2.5">
      <LogoMark />
      <Text fontWeight="semibold" textStyle="md" letterSpacing="-0.01em">
        Uplink
      </Text>
    </HStack>
  );
}
