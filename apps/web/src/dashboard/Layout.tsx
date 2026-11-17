import { type ReactNode, useEffect, useState } from 'react';
import type { BackupStatus } from '@inventory/shared';
import { dashboardApi } from './household.ts';
import './dashboard.css';

const PAGES: [string, string][] = [
  ['/', 'Overview'],
  ['/supplies', 'Supplies'],
  ['/assets', 'Assets'],
  ['/places', 'Locations & Categories'],
  ['/app', 'Get the app'],
];

/** Every dashboard page: navigation on top, the footer at the bottom. */
export function Layout({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="dash">
      <nav className="nav">
        <b>Our home</b>
        {PAGES.map(([href, label]) => (
          <a key={href} href={href} className={path === href ? 'on' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {children}
      <Footer />
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  return `${days} days ago`;
}

/** On every web page (spec §10.1): the server's version and the last backup; red when it failed. */
export function Footer({ load = dashboardApi.server }: { load?: () => Promise<{ version: string; lastBackup: BackupStatus | null }> }) {
  const [info, setInfo] = useState<{ version: string; lastBackup: BackupStatus | null } | null>(null);
  useEffect(() => {
    void load()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [load]);
  if (!info) return <footer className="foot" />;
  const backup = info.lastBackup;
  return (
    <footer className="foot">
      <span>Server v{info.version}</span>
      {!backup ? (
        <span className="badge">No backup yet</span>
      ) : backup.ok ? (
        <span>Last backup: {when(backup.at)} ✓</span>
      ) : (
        <span className="badge bad" title={backup.message}>
          Last backup failed: {when(backup.at)}
          {backup.message ? ` (${backup.message})` : ''}
        </span>
      )}
    </footer>
  );
}
