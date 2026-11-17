import type { AppRelease, DeviceSummary, PairingOffer } from '@inventory/shared';

/** The calls the download page makes to the home server it was opened from. */
export interface DownloadApi {
  latestRelease(): Promise<AppRelease | null>;
  offer(): Promise<PairingOffer>;
  devices(): Promise<DeviceSummary[]>;
  removeDevice(id: string): Promise<void>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`The home server answered ${res.status}.`);
  return (await res.json()) as T;
}

export const serverApi: DownloadApi = {
  latestRelease: async () => (await json<{ release: AppRelease | null }>(await fetch('/apk/latest'))).release,
  offer: async () => json<PairingOffer>(await fetch('/pairing/offers', { method: 'POST' })),
  devices: async () => json<DeviceSummary[]>(await fetch('/devices')),
  removeDevice: async (id) => {
    await json<unknown>(await fetch(`/devices/${id}/remove`, { method: 'POST' }));
  },
};
