import type { EngineCommand, EngineEvent, EngineOptions } from './types';

export interface EngineHandle {
  cancel(reason?: string): void;
}

/** Starts one run in a fresh worker; the worker is torn down when the run ends. */
export function startEngine(options: EngineOptions, onEvent: (event: EngineEvent) => void): EngineHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'uplink-engine' });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    worker.terminate();
  };

  worker.onmessage = (event: MessageEvent<EngineEvent>) => {
    onEvent(event.data);
    if (event.data.type === 'done' || event.data.type === 'error') finish();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    onEvent({ type: 'error', code: 'internal', message: event.message || 'The measurement worker failed' });
    finish();
  };
  worker.postMessage({ type: 'start', options } satisfies EngineCommand);

  return {
    cancel(reason) {
      if (!finished) worker.postMessage({ type: 'cancel', reason } satisfies EngineCommand);
    },
  };
}
