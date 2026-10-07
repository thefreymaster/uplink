export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface UaInfo {
  browser: string;
  os: string;
  kind: DeviceKind;
}

export function parseUserAgent(ua: string, touchPoints = 0): UaInfo {
  let os = 'Unknown OS';
  let kind: DeviceKind = 'desktop';
  if (/iPhone|iPod/.test(ua)) {
    os = 'iOS';
    kind = 'phone';
  } else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) {
    os = 'iPadOS';
    kind = 'tablet';
  } else if (/Android/.test(ua)) {
    os = 'Android';
    kind = /Mobile/.test(ua) ? 'phone' : 'tablet';
  } else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return { browser, os, kind };
}

export function currentDevice(): UaInfo {
  return parseUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function defaultDeviceLabel(): string {
  const info = currentDevice();
  return `${info.browser} on ${info.os}`;
}
