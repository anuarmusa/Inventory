// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ActionBody, inventoryFrom, type PrintLabel } from '@inventory/shared';
import type { Household } from './household.ts';
import { labelPdf } from './labelPdf.ts';
import { LabelsPage } from './LabelsPage.tsx';

const TV = '13131313-1313-4313-8313-131313131313';
const FREEZER = '22222222-2222-4222-8222-222222222222';

function household() {
  const recorded: ActionBody[][] = [];
  const h: Household = {
    inventory: inventoryFrom({
      assets: [{ id: TV, name: 'Samsung TV', deletedAt: null, disposedAt: null } as never],
      locations: [{ id: FREEZER, name: 'Freezer', createdAt: '', deletedAt: null }],
      labels: [{ code: '7K2QX', assetId: TV, locationId: null, retiredAt: null, createdAt: '' }],
    }),
    state: null,
    error: null,
    record: vi.fn(async (...actions: ActionBody[]) => {
      recorded.push(actions);
    }),
    reload: vi.fn(async () => undefined),
  };
  return { h, recorded };
}

afterEach(cleanup);

describe('Label printing', () => {
  it('prints Labels for new things: links them, then makes the PDF from the chosen position', async () => {
    const { h, recorded } = household();
    const save = vi.fn<(labels: PrintLabel[], start: number) => void>();
    render(<LabelsPage household={h} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Labels for 1 new thing' }));
    fireEvent.click(screen.getByTitle('Start at 5'));
    fireEvent.click(screen.getByRole('button', { name: 'Make the PDF' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [labels, start] = save.mock.calls[0]!;
    expect(start).toBe(5);
    expect(labels).toEqual([{ code: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{5}$/), name: 'Freezer' }]);
    expect(recorded[0]).toEqual([
      { type: 'label.attached', payload: { code: labels[0]!.code, target: { kind: 'location', locationId: FREEZER } } },
    ]);
  });

  it('reprints the same code without recording anything, and Replace retires the old code', async () => {
    const { h, recorded } = household();
    const save = vi.fn();
    render(<LabelsPage household={h} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reprint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make the PDF' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith([{ code: '7K2QX', name: 'Samsung TV' }], 1));
    expect(recorded).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make the PDF' }));
    await waitFor(() => expect(recorded[0]?.[0]).toMatchObject({ type: 'label.replaced', payload: { oldCode: '7K2QX' } }));
  });

  it('prints a sheet of blank Labels, recording nothing', async () => {
    const { h, recorded } = household();
    const save = vi.fn();
    render(<LabelsPage household={h} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print a sheet of blank Labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make the PDF' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0]).toHaveLength(21);
    expect(recorded).toEqual([]);
  });
});

describe('the PDF', () => {
  it('is A4, a page per sheet, with each code printed', () => {
    const labels = Array.from({ length: 23 }, (_, i) => ({ code: `AB${String(i).padStart(3, '0')}`, name: i % 2 ? 'Samsung TV' : null }));
    const doc = labelPdf(labels, 1);
    expect(doc.getNumberOfPages()).toBe(2);
    const text = doc.output();
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('AB022');
    expect(text).toContain('Samsung TV');
  });
});
