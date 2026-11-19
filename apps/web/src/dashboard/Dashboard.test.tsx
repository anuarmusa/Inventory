// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionBody, WebState } from '@inventory/shared';
import { type DashboardApi, useHousehold } from './household.ts';
import { Footer } from './Layout.tsx';
import { SuppliesPage } from './Manage.tsx';
import { Overview } from './Overview.tsx';

const RICE = '11111111-1111-4111-8111-111111111111';
const MILK = '12121212-1212-4212-8212-121212121212';
const PANTRY = '22222222-2222-4222-8222-222222222222';
const KITCHEN = '33333333-3333-4333-8333-333333333333';
const MISMATCH = '44444444-4444-4444-8444-444444444444';
const USED = '55555555-5555-4555-8555-555555555555';
const TV = '66666666-6666-4666-8666-666666666666';

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const supply = (id: string, name: string, extra = {}) => ({
  id,
  name,
  unit: 'packs',
  categoryId: null,
  usualLocationId: PANTRY,
  minimum: null,
  restockTo: null,
  expires: true,
  nearExpiryDays: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
});

function household(withMismatch = true): WebState {
  return {
    seq: 10,
    app: { latest: '1.4.0', minimum: '0.1.0' },
    server: { version: '1.4.0', lastBackup: null },
    changes: {
      locations: [{ id: PANTRY, name: 'Pantry', createdAt: '', deletedAt: null }],
      supplies: [supply(RICE, 'Jasmine rice', { minimum: 2, restockTo: 5 }), supply(MILK, 'Fresh milk')],
      batches: [
        { id: 'b1', supplyId: RICE, quantity: 1, expiry: null, locationId: PANTRY, createdAt: '' },
        { id: 'b2', supplyId: MILK, quantity: 2, expiry: inDays(2), locationId: PANTRY, createdAt: '' },
      ],
      assets: [{ id: TV, name: 'Samsung TV', categoryId: null, locationId: PANTRY, priceSen: 289900, photoIds: [], disposedAt: null, deletedAt: null }],
      devices: [{ id: KITCHEN, name: 'Kitchen phone' }],
      actions: [
        {
          seq: 5,
          id: USED,
          deviceId: KITCHEN,
          type: 'supply.used',
          payload: { supplyId: RICE, quantity: 3 },
          correctedTime: '2026-11-17T08:00:00.000Z',
          outcome: 'applied',
          result: { taken: [], shortfall: 2 },
          reversedByActionId: null,
        },
      ],
      mismatches: withMismatch
        ? [
            {
              id: MISMATCH,
              kind: 'shortfall',
              actionId: USED,
              details: { supplyId: RICE, requested: 3, shortfall: 2 },
              createdAt: '2026-11-17T08:00:00Z',
              resolvedAt: null,
              resolvedByActionId: null,
              resolution: null,
            },
          ]
        : [],
    },
  };
}

function fakeApi(state: WebState) {
  const recorded: ActionBody[][] = [];
  const api: DashboardApi = {
    state: vi.fn(async () => state),
    record: vi.fn(async (actions: ActionBody[]) => {
      recorded.push(actions);
      return [];
    }),
    server: vi.fn(async () => state.server),
  };
  return { api, recorded };
}

function Show({ api, page = 'overview' }: { api: DashboardApi; page?: 'overview' | 'supplies' }) {
  const h = useHousehold(api);
  return page === 'overview' ? <Overview household={h} /> : <SuppliesPage household={h} />;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('the dashboard', () => {
  it('shows the 2×2 grid: Shopping list, Near expiry, Low stock and Assets with their total', async () => {
    render(<Show api={fakeApi(household(false)).api} />);
    const buy = (await screen.findByRole('heading', { name: 'Shopping list' })).closest('section')!;
    expect(within(buy).getByText('Jasmine rice')).toBeTruthy();
    expect(within(buy).getByText('4 packs')).toBeTruthy();
    const near = screen.getByRole('heading', { name: 'Near expiry' }).closest('section')!;
    expect(within(near).getByText(/in 2 days/)).toBeTruthy();
    const low = screen.getByRole('heading', { name: 'Low stock' }).closest('section')!;
    expect(within(low).getByText('1 packs')).toBeTruthy();
    const assets = screen.getByRole('heading', { name: /^Assets/ }).closest('section')!;
    expect(within(assets).getAllByText('RM 2,899.00')).toHaveLength(2);
    expect(screen.queryByText(/Needs checking/)).toBeNull();
  });

  it('shows Needs checking only when Mismatches are open, and fixes them with Actions', async () => {
    const { api, recorded } = fakeApi(household());
    render(<Show api={api} />);
    const card = (await screen.findByRole('heading', { name: 'Needs checking (1)' })).closest('section')!;
    expect(within(card).getByText(/used 3 packs of Jasmine rice, but only 1 was on hand/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(recorded).toEqual([[{ type: 'mismatch.resolved', payload: { mismatchId: MISMATCH, resolution: 'accepted' } }]]));
  });

  it('counts a shortfall from the card', async () => {
    const { api, recorded } = fakeApi(household());
    render(<Show api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Count it' }));
    fireEvent.change(screen.getByLabelText(/Counted at home/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save count' }));
    await waitFor(() =>
      expect(recorded[0]).toEqual([
        { type: 'supply.counted', payload: { supplyId: RICE, quantity: 6 } },
        { type: 'mismatch.resolved', payload: { mismatchId: MISMATCH, resolution: 'counted' } },
      ]),
    );
  });

  it('lists Recent activity with the Device and an Undo', async () => {
    const { api, recorded } = fakeApi(household(false));
    render(<Show api={api} />);
    const sidebar = (await screen.findByRole('heading', { name: 'Recent activity' })).closest('aside')!;
    expect(within(sidebar).getByText('Used 3 packs of Jasmine rice')).toBeTruthy();
    expect(within(sidebar).getByText(/^Kitchen phone ·/)).toBeTruthy();
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(recorded).toEqual([[{ type: 'action.undone', payload: { targetActionId: USED } }]]));
  });

  it('keeps Shopping list ticks in this browser', async () => {
    render(<Show api={fakeApi(household(false)).api} />);
    fireEvent.click(await screen.findByLabelText('Bought Jasmine rice'));
    expect(JSON.parse(localStorage.getItem('inventory.shoppingTicks')!)).toEqual([RICE]);
  });

  it('creates a Supply from the web', async () => {
    const { api, recorded } = fakeApi(household(false));
    render(<Show api={api} page="supplies" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New Supply' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Jasmine rice'), { target: { value: 'Milo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(recorded[0]?.[0]).toMatchObject({ type: 'supply.created', payload: { name: 'Milo', unit: 'pieces' } }));
  });
});

describe('the footer', () => {
  it('shows the server version and a red badge when the last backup failed', async () => {
    render(
      <Footer load={async () => ({ version: '1.4.0', lastBackup: { at: '2026-11-14T03:00:00+08:00', ok: false, message: 'USB drive not mounted' } })} />,
    );
    expect(await screen.findByText('Server v1.4.0')).toBeTruthy();
    expect(screen.getByText(/Last backup failed/).className).toContain('bad');
  });

  it('says when there is no backup yet', async () => {
    render(<Footer load={async () => ({ version: '1.4.0', lastBackup: null })} />);
    expect(await screen.findByText('No backup yet')).toBeTruthy();
  });
});
