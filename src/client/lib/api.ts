import type { DeviceSummary, InfoResponse, TestDetail, TestPage } from '../../shared/protocol';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError(0, 'Server unreachable');
  }
  if (!res.ok) {
    let body: { error?: string; message?: string } | null = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error
    }
    throw new ApiError(res.status, body?.message ?? res.statusText, body?.error);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface TestQuery {
  since?: Date | null;
  device?: string | null;
  limit?: number;
  before?: string | null;
}

function queryString(q: TestQuery): string {
  const params = new URLSearchParams();
  if (q.since) params.set('since', q.since.toISOString());
  if (q.device) params.set('device', q.device);
  if (q.limit) params.set('limit', String(q.limit));
  if (q.before) params.set('before', q.before);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = {
  info: () => request<InfoResponse>('/api/info'),
  tests: (q: TestQuery) => request<TestPage>(`/api/tests${queryString(q)}`),
  test: (id: string) => request<TestDetail>(`/api/tests/${encodeURIComponent(id)}`),
  deleteTest: (id: string) => request<void>(`/api/tests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  devices: () => request<DeviceSummary[]>('/api/devices'),
  exportUrl: (q: TestQuery) => `/api/export.csv${queryString({ since: q.since, device: q.device })}`,
};

export function wsBase(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}
