import { Box, type BoxProps } from '@chakra-ui/react';
import { type ReactNode, useId } from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { cssColor } from '../lib/tokens';

const SIZE = 320;
const C = SIZE / 2;
const START = 135; // degrees clockwise from 3 o'clock: the dial opens at the bottom
const SWEEP = 270;
const R_TICKS = 126;
const TICK_LENGTH = 16;
const TICKS = 61;
const TICK_WIDTH = 2.4;
const R_TIME = 147;
const R_LABELS = 99;
/** The dial is open at the bottom, so the drawing is cropped just below the arc ends. */
const HEIGHT = 274;

const rad = (deg: number) => (deg * Math.PI) / 180;
const TICK_ARC = R_TICKS * rad(SWEEP);
const TICK_GAP = (TICK_ARC - TICKS * TICK_WIDTH) / (TICKS - 1);
const TIME_ARC = R_TIME * rad(SWEEP);

/** Non-linear dial: equal angle per step so 5 Mbps and 2.5 Gbps both read clearly. */
const SCALE = [0, 10, 50, 100, 250, 500, 1000, 2500, 10000];
const SCALE_LABELS = ['0', '10', '50', '100', '250', '500', '1G', '2.5G', '10G'];

export function dialFraction(mbps: number): number {
  if (!(mbps > 0)) return 0;
  for (let i = 1; i < SCALE.length; i++) {
    if (mbps <= SCALE[i]) {
      const lo = SCALE[i - 1];
      return (i - 1 + (mbps - lo) / (SCALE[i] - lo)) / (SCALE.length - 1);
    }
  }
  return 1;
}

function polar(r: number, deg: number): [number, number] {
  return [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
}

function arc(r: number): string {
  const [x0, y0] = polar(r, START);
  const [x1, y1] = polar(r, START + SWEEP);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const TICK_PATH = arc(R_TICKS);
const TIME_PATH = arc(R_TIME);

interface GaugeProps extends Omit<BoxProps, 'children'> {
  /** Current reading in Mbps; drives the lit ticks. */
  value: number;
  /** Token for the lit ticks, e.g. "series.download". */
  color: string;
  /** 0..1 progress through the current phase (outer ring). */
  progress: number;
  /** Highest reading this phase, marked on the dial. */
  peak?: number | null;
  /** Content centered inside the dial. */
  center: ReactNode;
  label?: string;
}

export function Gauge({ value, color, progress, peak, center, label, ...rest }: GaugeProps) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const shown = useAnimatedNumber(value);
  const lit = dialFraction(shown);
  const peakAngle = peak && peak > 0 ? START + SWEEP * dialFraction(peak) : null;
  const time = Math.min(1, Math.max(0, progress));

  return (
    <Box position="relative" w="full" maxW={{ base: '300px', sm: '340px', lg: '380px' }} mx="auto" aspectRatio={`${SIZE} / ${HEIGHT}`} {...rest}>
      <svg viewBox={`0 0 ${SIZE} ${HEIGHT}`} width="100%" height="100%" role="img" aria-label={label} style={{ display: 'block' }}>
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse">
            <path
              d={TICK_PATH}
              fill="none"
              stroke="#fff"
              strokeWidth={TICK_LENGTH + 6}
              strokeDasharray={`${lit * TICK_ARC} ${TICK_ARC + 1}`}
            />
          </mask>
        </defs>

        {/* Phase timer */}
        <path d={TIME_PATH} fill="none" stroke={cssColor('border')} strokeWidth={2} strokeLinecap="round" />
        {time > 0.002 && (
          <path
            d={TIME_PATH}
            fill="none"
            stroke={cssColor('fg.subtle')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${time * TIME_ARC} ${TIME_ARC + 4}`}
          />
        )}

        {/* Ticks: an unlit track, and the same pattern lit up to the reading */}
        <path d={TICK_PATH} fill="none" stroke={cssColor('gauge.track')} strokeWidth={TICK_LENGTH} strokeDasharray={`${TICK_WIDTH} ${TICK_GAP}`} />
        <path
          d={TICK_PATH}
          fill="none"
          stroke={cssColor(color)}
          strokeWidth={TICK_LENGTH}
          strokeDasharray={`${TICK_WIDTH} ${TICK_GAP}`}
          mask={`url(#${id})`}
        />

        {peakAngle !== null && (
          <line
            x1={polar(R_TICKS - TICK_LENGTH / 2 - 5, peakAngle)[0]}
            y1={polar(R_TICKS - TICK_LENGTH / 2 - 5, peakAngle)[1]}
            x2={polar(R_TICKS + TICK_LENGTH / 2 + 3, peakAngle)[0]}
            y2={polar(R_TICKS + TICK_LENGTH / 2 + 3, peakAngle)[1]}
            stroke={cssColor('fg.muted')}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {SCALE.map((stop, i) => {
          const [x, y] = polar(R_LABELS, START + (SWEEP * i) / (SCALE.length - 1));
          const reached = shown >= stop && shown > 0;
          return (
            <text
              key={stop}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10.5"
              fontWeight={500}
              fill={cssColor(reached ? 'fg.muted' : 'fg.subtle')}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {SCALE_LABELS[i]}
            </text>
          );
        })}
      </svg>
      {/* A square overlay keeps the readout centered on the dial's hub rather than the cropped box. */}
      <Box position="absolute" top="0" insetX="0" aspectRatio="1" display="flex" alignItems="center" justifyContent="center" pointerEvents="none">
        <Box pointerEvents="auto" textAlign="center">
          {center}
        </Box>
      </Box>
    </Box>
  );
}
