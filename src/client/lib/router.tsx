import { type AnchorHTMLAttributes, type MouseEvent, forwardRef, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
window.addEventListener('popstate', notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => location.pathname + location.search;

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === snapshot()) return;
  if (options.replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  notify();
}

export function useLocation(): { pathname: string; params: URLSearchParams } {
  const href = useSyncExternalStore(subscribe, snapshot, snapshot);
  const url = new URL(href, location.origin);
  return { pathname: url.pathname, params: url.searchParams };
}

export function setParam(name: string, value: string | null, options: { replace?: boolean } = {}): void {
  const url = new URL(location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  navigate(url.pathname + url.search, options);
}

/** A plain anchor that navigates client-side; modified clicks still open new tabs. */
export const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
  function RouterLink({ onClick, href, ...rest }, ref) {
    const handle = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(href);
      window.scrollTo({ top: 0 });
    };
    return <a ref={ref} href={href} onClick={handle} {...rest} />;
  },
);
