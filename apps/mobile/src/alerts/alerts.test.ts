import { type BatchRow, inventoryFrom, type SupplyRow } from '../sync/inventory';
import { attention, emptyAlertState, nextNineAm, planAlert } from './alerts';

const supply = (id: string, name: string, extra: Partial<SupplyRow> = {}) =>
  ({ id, name, unit: 'packs', minimum: null, restockTo: null, expires: true, nearExpiryDays: null, deletedAt: null, ...extra }) as SupplyRow;
const batch = (id: string, supplyId: string, quantity: number, expiry: string | null) =>
  ({ id, supplyId, quantity, expiry, locationId: null, createdAt: '' }) as BatchRow;

const inv = inventoryFrom({
  supplies: [supply('rice', 'Jasmine rice', { minimum: 2 }), supply('milk', 'Fresh milk')],
  batches: [batch('r', 'rice', 1, null), batch('m', 'milk', 1, '2026-11-19')],
});

const at = (iso: string) => new Date(iso);

describe('daily summary', () => {
  it('works out Low stock and Near expiry from the phone’s own data', () => {
    expect(attention(inv, '2026-11-17')).toEqual([
      { key: 'low:rice', kind: 'low', text: 'Jasmine rice (1 left)' },
      { key: 'near:m', kind: 'near', text: 'Fresh milk (in 2 days)' },
    ]);
  });

  it('schedules one summary for the next 09:00 with what’s new', () => {
    const now = at('2026-11-17T14:00:00');
    const { state, summary } = planAlert(emptyAlertState(), attention(inv, '2026-11-17'), now);
    expect(summary).toEqual({
      fireAt: at('2026-11-18T09:00:00'),
      title: '1 Low stock, 1 Near expiry',
      body: 'Low stock: Jasmine rice (1 left). Near expiry: Fresh milk (in 2 days).',
    });
    expect(state.scheduled?.keys).toEqual(['low:rice', 'near:m']);
  });

  it('doesn’t repeat what a summary already told, and sends nothing when nothing is new', () => {
    const items = attention(inv, '2026-11-17');
    const first = planAlert(emptyAlertState(), items, at('2026-11-17T14:00:00'));
    // The next day, after 09:00: those were told.
    const next = planAlert(first.state, items, at('2026-11-18T10:00:00'));
    expect(next.summary).toBeNull();
    expect(next.state).toEqual({ told: ['low:rice', 'near:m'], scheduled: null });
  });

  it('replans before 09:00 without counting the summary as told', () => {
    const items = attention(inv, '2026-11-17');
    const first = planAlert(emptyAlertState(), items, at('2026-11-17T14:00:00'));
    const again = planAlert(first.state, items, at('2026-11-17T20:00:00'));
    expect(again.summary?.title).toBe('1 Low stock, 1 Near expiry');
  });

  it('tells again about something that was fixed and came back', () => {
    const items = attention(inv, '2026-11-17');
    const told = planAlert(planAlert(emptyAlertState(), items, at('2026-11-17T14:00:00')).state, items, at('2026-11-18T10:00:00')).state;
    const restocked = planAlert(told, [items[1]!], at('2026-11-18T11:00:00')).state; // rice bought
    const lowAgain = planAlert(restocked, items, at('2026-11-20T11:00:00'));
    expect(lowAgain.summary?.title).toBe('1 Low stock');
  });

  it('fires at 09:00 today when it is still early', () => {
    expect(nextNineAm(at('2026-11-17T07:30:00'))).toEqual(at('2026-11-17T09:00:00'));
    expect(nextNineAm(at('2026-11-17T09:00:00'))).toEqual(at('2026-11-18T09:00:00'));
  });
});
