import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

let state: InstallState = { prompt: null, installed: standalone() };
const listeners = new Set<() => void>();
const update = (next: Partial<InstallState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

// The prompt event fires once, early, so it is captured at module load rather than in a component.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  update({ prompt: event as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => update({ prompt: null, installed: true }));

export function useInstall() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
  const ua = navigator.userAgent;
  return {
    installed: current.installed,
    canPrompt: current.prompt !== null,
    /** Service workers (and so installation) need HTTPS, except on localhost. */
    secure: window.isSecureContext,
    iosSafari: /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    async promptInstall() {
      const prompt = current.prompt;
      if (!prompt) return;
      await prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
      update({ prompt: null });
    },
  };
}
