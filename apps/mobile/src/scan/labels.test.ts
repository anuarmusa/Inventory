import { ActionBody } from '@inventory/shared';
import { inventoryFrom, type LabelRow } from '@inventory/shared';
import { attachLabel, labelOf, whatLabelOpens } from './labels';

const label = (code: string, extra: Partial<LabelRow>): LabelRow => ({ code, assetId: null, locationId: null, retiredAt: null, createdAt: '', ...extra });
const TV = '13131313-1313-4313-8313-131313131313';
const FREEZER = '22222222-2222-4222-8222-222222222222';

const inv = inventoryFrom({
  labels: [label('7K2QX', { assetId: TV }), label('9P4MN', { locationId: FREEZER }), label('ABCDE', { assetId: TV, retiredAt: '2026-11-01T00:00:00Z' }), label('BLANK', {})],
});

describe('Labels in the app', () => {
  it('opens the Asset or Location a Label is on, says when it was replaced, and treats the rest as Blank', () => {
    expect(whatLabelOpens(inv, '7K2QX')).toEqual({ kind: 'asset', assetId: TV });
    expect(whatLabelOpens(inv, '9P4MN')).toEqual({ kind: 'location', locationId: FREEZER });
    expect(whatLabelOpens(inv, 'ABCDE')).toEqual({ kind: 'retired' });
    expect(whatLabelOpens(inv, 'BLANK')).toEqual({ kind: 'blank' });
    // A code from a printed sheet the household hasn't seen yet is a Blank label too.
    expect(whatLabelOpens(inv, 'ZZZZZ')).toEqual({ kind: 'blank' });
  });

  it('attaches a Blank label with an Action, so it works offline', () => {
    const body = attachLabel('ZZZZZ', { locationId: FREEZER });
    expect(body).toEqual({ type: 'label.attached', payload: { code: 'ZZZZZ', target: { kind: 'location', locationId: FREEZER } } });
    expect(ActionBody.safeParse(body).success).toBe(true);
  });

  it('shows the current Label of a thing, ignoring replaced ones', () => {
    expect(labelOf(inv, { assetId: TV })).toBe('7K2QX');
    expect(labelOf(inv, { locationId: 'nowhere' })).toBeNull();
  });
});
