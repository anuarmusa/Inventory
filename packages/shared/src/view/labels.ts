import type { ActionBody } from '../actions.ts';
import type { Inventory } from './inventory.ts';

/**
 * Label printing (spec §10.3). A Label's QR holds `INV1:<code>`: a random 5-character code from an
 * alphabet without look-alikes (no I, L, O, U). Printing happens on the dashboard only.
 */
export const LABEL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const labelQr = (code: string) => `INV1:${code}`;

/** A new code not used by any Label yet. `random` returns 0 ≤ n < 1. */
export function newLabelCode(inv: Inventory, taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += LABEL_ALPHABET[Math.floor(random() * LABEL_ALPHABET.length)];
    if (!inv.labels[code] && !taken.has(code)) return code;
  }
}

/** Something a Label can be on. */
export interface LabelThing {
  kind: 'asset' | 'location';
  id: string;
  name: string;
  /** Its current Label, or null: "No Label yet". */
  code: string | null;
}

/** Assets still owned and Locations, with their current Labels, by name. */
export function labelThings(inv: Inventory): LabelThing[] {
  const current = new Map<string, string>();
  for (const l of Object.values(inv.labels)) {
    if (l.retiredAt) continue;
    if (l.assetId) current.set(`asset:${l.assetId}`, l.code);
    if (l.locationId) current.set(`location:${l.locationId}`, l.code);
  }
  const things: LabelThing[] = [
    ...Object.values(inv.assets)
      .filter((a) => !a.deletedAt && !a.disposedAt)
      .map((a) => ({ kind: 'asset' as const, id: a.id, name: a.name, code: current.get(`asset:${a.id}`) ?? null })),
    ...Object.values(inv.locations)
      .filter((l) => !l.deletedAt)
      .map((l) => ({ kind: 'location' as const, id: l.id, name: l.name, code: current.get(`location:${l.id}`) ?? null })),
  ];
  return things.sort((a, b) => a.name.localeCompare(b.name));
}

/** One label to print: an assigned one shows the thing's name, a Blank label only its code. */
export interface PrintLabel {
  code: string;
  name: string | null;
}

/**
 * "Print Labels for N new things": a new code for everything showing "No Label yet", and the
 * Actions that link them.
 */
export function labelsForNewThings(inv: Inventory, random?: () => number): { labels: PrintLabel[]; actions: ActionBody[] } {
  const taken = new Set<string>();
  const labels: PrintLabel[] = [];
  const actions: ActionBody[] = [];
  for (const thing of labelThings(inv).filter((t) => !t.code)) {
    const code = newLabelCode(inv, taken, random);
    taken.add(code);
    labels.push({ code, name: thing.name });
    actions.push(attachTo(code, thing));
  }
  return { labels, actions };
}

function attachTo(code: string, thing: LabelThing): ActionBody {
  return {
    type: 'label.attached',
    payload: { code, target: thing.kind === 'asset' ? { kind: 'asset', assetId: thing.id } : { kind: 'location', locationId: thing.id } },
  };
}

/** Print for one thing: Reprint keeps its code; a thing without one gets a new code, linked. */
export function labelForThing(inv: Inventory, thing: LabelThing, random?: () => number): { label: PrintLabel; actions: ActionBody[] } {
  if (thing.code) return { label: { code: thing.code, name: thing.name }, actions: [] };
  const code = newLabelCode(inv, new Set(), random);
  return { label: { code, name: thing.name }, actions: [attachTo(code, thing)] };
}

/** Replace Label: a new code linked to the same thing; the old code is retired. */
export function replaceLabel(inv: Inventory, thing: LabelThing, random?: () => number): { label: PrintLabel; actions: ActionBody[] } {
  if (!thing.code) return labelForThing(inv, thing, random);
  const code = newLabelCode(inv, new Set(), random);
  return { label: { code, name: thing.name }, actions: [{ type: 'label.replaced', payload: { oldCode: thing.code, newCode: code } }] };
}

/** "Print a sheet of blank Labels": new codes linked to nothing yet. */
export function blankLabels(inv: Inventory, count: number, random?: () => number): PrintLabel[] {
  const taken = new Set<string>();
  return Array.from({ length: count }, () => {
    const code = newLabelCode(inv, taken, random);
    taken.add(code);
    return { code, name: null };
  });
}

/** A4 sticker sheet: 3 × 7 labels of 63.5 × 38.1 mm (the common 21-up layout), in millimetres. */
export const SHEET = {
  width: 210,
  height: 297,
  columns: 3,
  rows: 7,
  labelWidth: 63.5,
  labelHeight: 38.1,
  left: 7.2,
  top: 15.15,
  columnPitch: 66.04,
  rowPitch: 38.1,
} as const;
export const LABELS_PER_SHEET = SHEET.columns * SHEET.rows;

/**
 * Where each label goes, starting at position `start` (1–21, across then down) on the first sheet,
 * so a partly used sheet can be reused. Later sheets start at position 1.
 */
export function sheetPositions(count: number, start = 1): { page: number; position: number; x: number; y: number }[] {
  const first = Math.min(Math.max(1, Math.floor(start)), LABELS_PER_SHEET) - 1;
  return Array.from({ length: count }, (_, i) => {
    const slot = first + i;
    const page = Math.floor(slot / LABELS_PER_SHEET);
    const position = slot % LABELS_PER_SHEET;
    const col = position % SHEET.columns;
    const row = Math.floor(position / SHEET.columns);
    return { page, position: position + 1, x: SHEET.left + col * SHEET.columnPitch, y: SHEET.top + row * SHEET.rowPitch };
  });
}
