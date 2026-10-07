import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PAGE_BACKGROUND } from '../../theme';

export type ColorModePreference = 'system' | 'light' | 'dark';
type ColorMode = 'light' | 'dark';

// Same key the pre-paint script in index.html reads.
const STORAGE_KEY = 'uplink-theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ColorModePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // storage unavailable
  }
  return 'system';
}

/** Chakra's `_dark` condition keys off a `dark` class on the root element. */
function apply(mode: ColorMode, animate: boolean): void {
  const root = document.documentElement;
  // Switch instantly instead of letting every component's color transition run.
  const freeze = animate ? null : document.createElement('style');
  if (freeze) {
    freeze.textContent = '*,*::before,*::after{transition:none!important}';
    document.head.appendChild(freeze);
  }
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = PAGE_BACKGROUND[mode];
  }
  if (freeze) {
    void getComputedStyle(root).opacity;
    requestAnimationFrame(() => freeze.remove());
  }
}

interface ColorModeContextValue {
  preference: ColorModePreference;
  colorMode: ColorMode;
  setPreference(value: ColorModePreference): void;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  const first = useRef(true);

  useEffect(() => {
    const query = darkQuery();
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    // Keep other open tabs in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPreferenceState(readPreference());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      query.removeEventListener('change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const colorMode: ColorMode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    apply(colorMode, first.current);
    first.current = false;
  }, [colorMode]);

  const setPreference = useCallback((value: ColorModePreference) => {
    setPreferenceState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // applied for this session only
    }
  }, []);

  const value = useMemo(() => ({ preference, colorMode, setPreference }), [preference, colorMode, setPreference]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used inside ColorModeProvider');
  return ctx;
}
