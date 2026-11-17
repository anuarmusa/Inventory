// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppRelease, DeviceSummary, PairingOffer } from '@inventory/shared';
import type { DownloadApi } from './api';
import { DownloadPage } from './DownloadPage';

const NOW = new Date('2026-11-17T09:41:00Z');

const release: AppRelease = { version: '1.4.0', date: '2026-11-15', notes: 'Undo after saving.', file: 'inventory-1.4.0.apk' };

function offerAt(code: string, expiresAt: string): PairingOffer {
  return {
    code,
    expiresAt,
    server: 'http://192.168.1.10',
    link: `inventory://pair?server=http%3A%2F%2F192.168.1.10&code=${code}`,
  };
}

const phones: DeviceSummary[] = [
  { id: 'a', name: 'Kitchen phone', model: 'Redmi Note 13', appVersion: '1.4.0', pairedAt: '2026-11-01T00:00:00Z', lastSyncedAt: '2026-11-17T09:31:00Z', removedAt: null },
  { id: 'b', name: 'Aisyah’s phone', model: 'Oppo A78', appVersion: '1.3.2', pairedAt: '2026-11-02T00:00:00Z', lastSyncedAt: '2026-11-15T08:00:00Z', removedAt: null },
  { id: 'c', name: 'Old tablet', model: null, appVersion: '1.0.0', pairedAt: '2026-10-01T00:00:00Z', lastSyncedAt: null, removedAt: '2026-11-10T00:00:00Z' },
];

function fakeApi(overrides: Partial<DownloadApi> = {}): DownloadApi & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    latestRelease: async () => release,
    offer: async () => offerAt('482913', '2026-11-17T09:51:00Z'),
    devices: async () => phones.map((p) => (removed.includes(p.id) ? { ...p, removedAt: NOW.toISOString() } : p)),
    removeDevice: async (id) => {
      removed.push(id);
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('download page', () => {
  it('step 1 offers the hosted app with its version, date and what’s new', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    expect(await screen.findByText('v1.4.0 · 15 Nov 2026')).toBeTruthy();
    expect(screen.getByText('Undo after saving.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download APK' }).getAttribute('href')).toBe('/apk/download');
  });

  it('step 1 says so when no app is hosted yet', async () => {
    render(<DownloadPage api={fakeApi({ latestRelease: async () => null })} now={() => NOW} />);
    expect(await screen.findByText('No app has been put on the home server yet.')).toBeTruthy();
  });

  it('step 2 explains allowing unknown apps', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    expect(screen.getByText(/allow your browser to install unknown apps/)).toBeTruthy();
  });

  it('step 3 links "Connect this phone" to the pairing link, with the code for another screen', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    const connect = await screen.findByRole('link', { name: 'Connect this phone' });
    expect(connect.getAttribute('href')).toBe('inventory://pair?server=http%3A%2F%2F192.168.1.10&code=482913');
    expect(screen.getByText('Using another screen? Scan a code instead')).toBeTruthy();
    expect(screen.getByLabelText('Pairing code').textContent).toBe('482 913');
    expect(screen.getByText('192.168.1.10')).toBeTruthy();
    expect(screen.getByText('Code expires in 10:00')).toBeTruthy();
  });

  it('draws the pairing QR code', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    const qr = await screen.findByRole('img', { name: 'Pairing code for the Inventory app' });
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
  });

  it('gets a fresh code when the shown one expires', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let clock = NOW;
    let offers = 0;
    const api = fakeApi({
      offer: async () => {
        offers += 1;
        return offers === 1 ? offerAt('482913', '2026-11-17T09:41:02Z') : offerAt('551177', '2026-11-17T09:51:05Z');
      },
    });
    render(<DownloadPage api={api} now={() => clock} />);
    expect((await screen.findByLabelText('Pairing code')).textContent).toBe('482 913');
    clock = new Date('2026-11-17T09:41:03Z');
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(screen.getByLabelText('Pairing code').textContent).toBe('551 177'));
  });

  it('lists connected phones with model, version, last sync and an "Out of date" badge', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    const kitchen = (await screen.findByText('Kitchen phone')).closest('tr')!;
    expect(within(kitchen).getByText('Redmi Note 13')).toBeTruthy();
    expect(within(kitchen).getByText(/v1\.4\.0/)).toBeTruthy();
    expect(within(kitchen).queryByText('Out of date')).toBeNull();
    expect(within(kitchen).getByText('10 min ago')).toBeTruthy();

    const aisyah = screen.getByText('Aisyah’s phone').closest('tr')!;
    expect(within(aisyah).getByText('Out of date')).toBeTruthy();
    expect(within(aisyah).getByText('2 days ago')).toBeTruthy();
  });

  it('shows removed phones last, without a Remove button', async () => {
    render(<DownloadPage api={fakeApi()} now={() => NOW} />);
    await screen.findByText('Old tablet');
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows.at(-1)!).getByText('Old tablet')).toBeTruthy();
    expect(within(rows.at(-1)!).getByText('Removed')).toBeTruthy();
    expect(within(rows.at(-1)!).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('removes a phone after confirming', async () => {
    const api = fakeApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DownloadPage api={api} now={() => NOW} />);
    const row = (await screen.findByText('Kitchen phone')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(within(screen.getByText('Kitchen phone').closest('tr')!).getByText('Removed')).toBeTruthy());
    expect(api.removed).toEqual(['a']);
  });

  it('keeps a phone when removal is cancelled', async () => {
    const api = fakeApi();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DownloadPage api={api} now={() => NOW} />);
    const row = (await screen.findByText('Kitchen phone')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(api.removed).toEqual([]);
  });

  it('says so when the home server can’t be reached', async () => {
    render(<DownloadPage api={fakeApi({ devices: async () => Promise.reject(new Error('offline')) })} now={() => NOW} />);
    expect(await screen.findByText(/Can’t reach the home server/)).toBeTruthy();
  });
});
