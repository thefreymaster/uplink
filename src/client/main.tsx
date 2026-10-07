import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ReloadPrompt } from './components/ReloadPrompt';
import { Provider } from './components/ui/provider';
import { Toaster } from './components/ui/toaster';
import { SpeedTestProvider } from './hooks/useSpeedTest';
import './lib/install';
import { LiveProvider } from './live/LiveProvider';
import './global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <LiveProvider>
        <SpeedTestProvider>
          <App />
          <ReloadPrompt />
          <Toaster />
        </SpeedTestProvider>
      </LiveProvider>
    </Provider>
  </StrictMode>,
);
