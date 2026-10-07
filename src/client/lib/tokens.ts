import type { Phase } from '../../shared/protocol';

/** CSS variable for a Chakra color token, for places that need a raw color (SVG attributes). */
export function cssColor(token: string): string {
  return `var(--chakra-colors-${token.replace(/\./g, '-')})`;
}

export const SERIES_TOKEN: Record<Phase, string> = {
  latency: 'series.latency',
  download: 'series.download',
  upload: 'series.upload',
};
