import { describe, expect, it } from 'vitest';
import { ActionBody } from '../actions.ts';
import { type AssetRow, inventoryFrom, type LabelRow } from './inventory.ts';
import {
  blankLabels,
  LABEL_ALPHABET,
  labelForThing,
  labelQr,
  labelsForNewThings,
  labelThings,
  newLabelCode,
  replaceLabel,
  sheetPositions,
} from './labels.ts';

const TV = '13131313-1313-4313-8313-131313131313';
const DRILL = '14141414-1414-4414-8414-141414141414';
const FREEZER = '22222222-2222-4222-8222-222222222222';
const asset = (id: string, name: string, extra: Partial<AssetRow> = {}) => ({ id, name, deletedAt: null, disposedAt: null, ...extra }) as AssetRow;
const label = (code: string, extra: Partial<LabelRow>): LabelRow => ({ code, assetId: null, locationId: null, retiredAt: null, createdAt: '', ...extra });

const inv = inventoryFrom({
  assets: [asset(TV, 'Samsung TV'), asset(DRILL, 'Cordless drill'), asset('old', 'Old radio', { disposedAt: '2026-01-01' })],
  locations: [{ id: FREEZER, name: 'Freezer', createdAt: '', deletedAt: null }],
  labels: [label('7K2QX', { assetId: TV }), label('ABCDE', { assetId: TV, retiredAt: '2026-01-01T00:00:00Z' })],
});

/** A fixed sequence of "random" numbers, for predictable codes. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('Label codes', () => {
  it('are 5 characters with no look-alikes, never one already used', () => {
    expect(LABEL_ALPHABET).not.toMatch(/[ILOU]/);
    expect(newLabelCode(inv)).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    // The first draw would be ABCDE (taken, even though retired): it draws again.
    const abcde = [10, 11, 12, 13, 14].map((n) => (n + 0.5) / 32);
    expect(newLabelCode(inv, new Set(), seq(...abcde, 0, 0, 0, 0, 0))).toBe('00000');
    expect(labelQr('7K2QX')).toBe('INV1:7K2QX');
  });
});

describe('what to print', () => {
  it('lists Assets still owned and Locations with their current Label', () => {
    expect(labelThings(inv).map((t) => [t.name, t.code])).toEqual([
      ['Cordless drill', null],
      ['Freezer', null],
      ['Samsung TV', '7K2QX'],
    ]);
  });

  it('“Print Labels for N new things” gives each a new code, linked with Actions', () => {
    const { labels, actions } = labelsForNewThings(inv);
    expect(labels.map((l) => l.name)).toEqual(['Cordless drill', 'Freezer']);
    expect(new Set(labels.map((l) => l.code)).size).toBe(2);
    expect(actions[1]).toEqual({ type: 'label.attached', payload: { code: labels[1]!.code, target: { kind: 'location', locationId: FREEZER } } });
    for (const a of actions) expect(ActionBody.safeParse(a).success).toBe(true);
  });

  it('Reprint keeps the code; Replace links a new code and retires the old', () => {
    const tv = labelThings(inv).find((t) => t.name === 'Samsung TV')!;
    expect(labelForThing(inv, tv)).toEqual({ label: { code: '7K2QX', name: 'Samsung TV' }, actions: [] });
    const { label: replaced, actions } = replaceLabel(inv, tv);
    expect(replaced.code).not.toBe('7K2QX');
    expect(actions).toEqual([{ type: 'label.replaced', payload: { oldCode: '7K2QX', newCode: replaced.code } }]);
  });

  it('blank Labels have codes but no name, and aren’t recorded until attached', () => {
    const blanks = blankLabels(inv, 21);
    expect(blanks).toHaveLength(21);
    expect(new Set(blanks.map((b) => b.code)).size).toBe(21);
    expect(blanks.every((b) => b.name === null)).toBe(true);
  });
});

describe('the sheet', () => {
  it('places 21 labels across then down, 63.5 × 38.1 mm', () => {
    const p = sheetPositions(21);
    expect(p[0]).toEqual({ page: 0, position: 1, x: 7.2, y: 15.15 });
    expect(p[1]!.x).toBeCloseTo(73.24);
    expect(p[3]).toMatchObject({ position: 4, x: 7.2 });
    expect(p[3]!.y).toBeCloseTo(53.25);
    expect(p[20]).toMatchObject({ page: 0, position: 21 });
  });

  it('starts at position N on a partly used sheet, and carries on to a new sheet', () => {
    const p = sheetPositions(4, 20);
    expect(p.map((x) => [x.page, x.position])).toEqual([
      [0, 20],
      [0, 21],
      [1, 1],
      [1, 2],
    ]);
  });
});
