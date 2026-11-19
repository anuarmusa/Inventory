import { House } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AppRelease, DeviceSummary, PairingOffer } from '@inventory/shared';
import { type DownloadApi, serverApi } from './api';
import { countdown, formatDate, isOutOfDate, spacedCode, timeAgo } from './format';
import { QrCode } from './QrCode';
import './download.css';

export interface DownloadPageProps {
  api?: DownloadApi;
  /** The clock; tests replace it. */
  now?: () => Date;
}

/**
 * The download page (spec §10.2): usually opened on the phone itself, so it is one column that works
 * at phone width. Three steps (download, install, connect), then the phones already connected.
 */
export function DownloadPage({ api = serverApi, now = () => new Date() }: DownloadPageProps) {
  const [release, setRelease] = useState<AppRelease | null | undefined>(undefined);
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(now);

  const loadDevices = useCallback(() => api.devices().then(setDevices), [api]);
  const loadOffer = useCallback(() => api.offer().then(setOffer), [api]);

  useEffect(() => {
    Promise.all([api.latestRelease().then(setRelease), loadOffer(), loadDevices()]).catch(() =>
      setError('Can’t reach the home server. Check you’re on the home Wi-Fi, then reload.'),
    );
  }, [api, loadOffer, loadDevices]);

  // Tick once a second for the code's countdown; offer a fresh code when it expires.
  useEffect(() => {
    const timer = setInterval(() => setClock(now()), 1000);
    return () => clearInterval(timer);
  }, [now]);
  useEffect(() => {
    if (offer && new Date(offer.expiresAt) <= clock) void loadOffer().catch(() => undefined);
  }, [offer, clock, loadOffer]);

  const remove = async (device: DeviceSummary) => {
    if (!window.confirm(`Remove ${device.name}? It stops syncing until it is connected again.`)) return;
    await api.removeDevice(device.id);
    await loadDevices();
  };

  const latest = release?.version ?? null;
  const shown = (devices ?? []).slice().sort((a, b) => Number(Boolean(a.removedAt)) - Number(Boolean(b.removedAt)));

  return (
    <main className="dl">
      <header className="dl-hero">
        <span className="dl-mark">
          <House size={26} />
        </span>
        <div>
          <h1>Get the Inventory app</h1>
          <p>For Android phones on our home Wi-Fi.</p>
        </div>
      </header>
      {error && <p className="note bad">{error}</p>}

      <ol className="steps">
        <li className="step">
          <h2>Download the app</h2>
          {release === undefined ? (
            <p className="mute">Checking…</p>
          ) : release === null ? (
            <p className="mute">No app has been put on the home server yet.</p>
          ) : (
            <>
              <p className="mute">
                v{release.version} · {formatDate(release.date)}
              </p>
              <p>{release.notes}</p>
              <a className="button primary" href="/apk/download" download>
                Download APK
              </a>
            </>
          )}
        </li>

        <li className="step">
          <h2>Install it</h2>
          <p className="mute">
            Open the download. If Android asks, allow your browser to install unknown apps, then tap Install.
          </p>
        </li>

        <li className="step">
          <h2>Connect this phone</h2>
          {offer ? (
            <>
              <a className="button primary" href={offer.link}>
                Connect this phone
              </a>
              <details className="other-screen">
                <summary>Using another screen? Scan a code instead</summary>
                <div className="pairing">
                  <QrCode text={offer.link} label="Pairing code for the Inventory app" />
                  <div>
                    <p className="mute">Or type in the app:</p>
                    <p>
                      Server <strong>{offer.server.replace(/^https?:\/\//, '')}</strong>
                    </p>
                    <p className="code" aria-label="Pairing code">
                      {spacedCode(offer.code)}
                    </p>
                    <p className="mute small">Code expires in {countdown(offer.expiresAt, clock)}</p>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <p className="mute">Getting a code…</p>
          )}
        </li>
      </ol>

      <h2 className="section">Phones connected</h2>
      {devices && devices.length === 0 && <p className="mute">No phones yet.</p>}
      {shown.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Phone</th>
              <th>App</th>
              <th>Last synced</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className={d.removedAt ? 'removed' : undefined}>
                <td>
                  <strong>{d.name}</strong>
                  {d.model && <div className="mute small">{d.model}</div>}
                </td>
                <td>
                  {d.appVersion ? `v${d.appVersion}` : '–'}{' '}
                  {isOutOfDate(d.appVersion, latest) && <span className="badge warn">Out of date</span>}
                </td>
                <td>{timeAgo(d.lastSyncedAt, clock)}</td>
                <td>
                  {d.removedAt ? (
                    <span className="badge">Removed</span>
                  ) : (
                    <button type="button" className="button small" onClick={() => void remove(d)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
