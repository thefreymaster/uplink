import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const systemFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif';

const lightDark = (light: string, dark: string) => ({ value: { _light: light, _dark: dark } });

/** Page background per mode; also used for the browser/PWA theme color. */
export const PAGE_BACKGROUND = { light: '#f3f4f6', dark: '#0c0d0f' } as const;

const config = defineConfig({
  globalCss: {
    'html, body': { bg: 'bg', color: 'fg' },
    body: { WebkitTapHighlightColor: 'transparent' },
    '#root': { minH: '100dvh' },
  },
  theme: {
    keyframes: {
      flowForward: { from: { strokeDashoffset: '0' }, to: { strokeDashoffset: '-20' } },
      flowBackward: { from: { strokeDashoffset: '0' }, to: { strokeDashoffset: '20' } },
      rowFlash: { from: { backgroundColor: 'var(--chakra-colors-brand-subtle)' }, to: { backgroundColor: 'transparent' } },
      softPulse: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
    },
    tokens: {
      fonts: {
        heading: { value: systemFont },
        body: { value: systemFont },
        mono: { value: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
      },
      colors: {
        // Cool, slightly blue-tinted neutrals in the spirit of network-gear dashboards.
        gray: {
          50: { value: '#f6f7f9' },
          100: { value: '#eef0f3' },
          200: { value: '#e3e6ea' },
          300: { value: '#cfd4da' },
          400: { value: '#9ba2ac' },
          500: { value: '#767d87' },
          600: { value: '#5a616b' },
          700: { value: '#3a3f46' },
          800: { value: '#272a30' },
          900: { value: '#1b1d21' },
          950: { value: '#121316' },
        },
        brand: {
          50: { value: '#eef5ff' },
          100: { value: '#d9e8ff' },
          200: { value: '#bcd6ff' },
          300: { value: '#8ebbff' },
          400: { value: '#5a9aff' },
          500: { value: '#3a83f6' },
          600: { value: '#1f6fe5' },
          700: { value: '#1a5ccc' },
          800: { value: '#1b4a96' },
          900: { value: '#1b3f78' },
          950: { value: '#132a4f' },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: lightDark(PAGE_BACKGROUND.light, PAGE_BACKGROUND.dark),
          panel: lightDark('#ffffff', '#15171a'),
          subtle: lightDark('#f6f7f9', '#1a1c20'),
          muted: lightDark('#eef0f3', '#212429'),
          emphasized: lightDark('#e3e6ea', '#2b2e34'),
        },
        fg: {
          DEFAULT: lightDark('#14171b', '#eceef1'),
          muted: lightDark('#5a616b', '#a3a9b2'),
          subtle: lightDark('#727985', '#7f8691'),
        },
        border: {
          DEFAULT: lightDark('#e3e6ea', '#25282d'),
          muted: lightDark('#eef0f3', '#1e2125'),
          subtle: lightDark('#f3f4f6', '#1a1c20'),
          emphasized: lightDark('#cfd4da', '#33373d'),
        },
        brand: {
          solid: { value: '{colors.brand.600}' },
          contrast: { value: '#ffffff' },
          fg: lightDark('{colors.brand.700}', '#7cb0ff'),
          muted: lightDark('{colors.brand.200}', '{colors.brand.900}'),
          subtle: lightDark('{colors.brand.50}', '{colors.brand.950}'),
          emphasized: lightDark('{colors.brand.300}', '{colors.brand.800}'),
          focusRing: lightDark('{colors.brand.600}', '{colors.brand.400}'),
          border: lightDark('{colors.brand.600}', '{colors.brand.400}'),
        },
        // Data colors. Validated as a set (all pairs, protan/deutan, contrast vs. panels) in both modes.
        series: {
          download: lightDark('#1f6fe5', '#3d8bff'),
          upload: lightDark('#0d9a76', '#1ca883'),
          latency: lightDark('#c27f00', '#c48500'),
        },
        chart: {
          grid: lightDark('#eceef1', '#212429'),
          axis: lightDark('#cfd4da', '#33373d'),
        },
        gauge: {
          track: lightDark('#d5dae0', '#2f343b'),
        },
        status: {
          good: { value: '#0ca30c' },
          warning: { value: '#e8a317' },
          critical: { value: '#d03b3b' },
          idle: lightDark('#9ba2ac', '#5a616b'),
        },
      },
      radii: {
        l1: { value: '4px' },
        l2: { value: '6px' },
        l3: { value: '10px' },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
