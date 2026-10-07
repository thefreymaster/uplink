import { Laptop, Monitor, Smartphone, Tablet } from 'lucide-react';
import { type DeviceKind, parseUserAgent } from '../lib/ua';

export function DeviceIcon({ kind, size = 18 }: { kind: DeviceKind | 'unknown'; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  switch (kind) {
    case 'phone':
      return <Smartphone {...props} />;
    case 'tablet':
      return <Tablet {...props} />;
    case 'desktop':
      return <Laptop {...props} />;
    default:
      return <Monitor {...props} />;
  }
}

export function deviceKindFromUa(ua: string | null | undefined): DeviceKind | 'unknown' {
  return ua ? parseUserAgent(ua).kind : 'unknown';
}
