import type { Action } from '@inventory/shared';
import type { SyncState } from './engine';
import { describeAction, editableQuantity, statusLine, withQuantity } from './describe';
import { inventoryFrom, type SupplyRow } from './inventory';

const idle: SyncState = { home: true, syncing: false, problem: null, lastSyncedAt: null, app: null };

describe('the status bar', () => {
  it('says home and synced, or away with the unsent count', () => {
    expect(statusLine(idle, 0)).toEqual({ text: 'Home · synced', tone: 'ok' });
    expect(statusLine({ ...idle, home: false }, 3)).toEqual({ text: 'Away · 3 unsent', tone: 'away' });
    expect(statusLine({ ...idle, home: false }, 1).text).toBe('Away · 1 unsent');
    expect(statusLine({ ...idle, home: false }, 0).text).toBe('Away · all synced');
    expect(statusLine({ ...idle, syncing: true }, 2).text).toBe('Syncing 2 unsent…');
    expect(statusLine({ ...idle, home: null }, 0).text).toBe('Checking…');
  });

  it('explains refusals, keeping the count', () => {
    expect(statusLine({ ...idle, problem: 'app_too_old' }, 2)).toEqual({ text: 'Update needed to sync · 2 unsent', tone: 'problem' });
    expect(statusLine({ ...idle, problem: 'server_too_old' }, 1).text).toBe('The home server is older than this app · 1 unsent');
    expect(statusLine({ ...idle, problem: 'failed' }, 1).text).toBe('Sync failed · 1 unsent');
  });
});

const RICE = '11111111-1111-4111-8111-111111111111';
const used: Action = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  deviceId: '33333333-3333-4333-8333-333333333333',
  deviceTime: '2026-11-17T09:00:00.000Z',
  v: 1,
  type: 'supply.used',
  payload: { supplyId: RICE, quantity: 2 },
};

describe('Unsent Actions', () => {
  it('are described in the household’s words', () => {
    const inv = inventoryFrom({ supplies: [{ id: RICE, name: 'Jasmine rice', unit: 'packs' } as SupplyRow] });
    expect(describeAction(used, inv)).toBe('Used 2 packs of Jasmine rice');
  });

  it('can change the amount of quantity Actions only', () => {
    expect(editableQuantity(used)).toBe(2);
    expect(withQuantity(used, 3)).toEqual({ type: 'supply.used', payload: { supplyId: RICE, quantity: 3 } });
    expect(() => withQuantity(used, 0)).toThrow('at least 1');
    expect(() => withQuantity(used, 1.5)).toThrow();
    const rename = { ...used, type: 'location.renamed', payload: { locationId: RICE, name: 'Store' } } as Action;
    expect(editableQuantity(rename)).toBeNull();
  });
});
