import { compareVersions } from '@inventory/shared';

/** "15 Nov 2026" for a `YYYY-MM-DD` date. */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "just now", "10 min ago", "3 h ago", "2 days ago", or "never". */
export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return 'never';
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** A Device is out of date when it reports an app version older than the hosted one. */
export function isOutOfDate(appVersion: string | null, latest: string | null): boolean {
  return appVersion !== null && latest !== null && compareVersions(appVersion, latest) < 0;
}

/** "482 913" */
export function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** "9:41" left until `expiresAt`, never negative. */
export function countdown(expiresAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
