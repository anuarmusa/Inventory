import { useMemo, useState } from 'react';
import {
  type ActionBody,
  blankLabels,
  labelForThing,
  labelsForNewThings,
  labelThings,
  LABELS_PER_SHEET,
  type LabelThing,
  type PrintLabel,
  replaceLabel,
  SHEET,
} from '@inventory/shared';
import type { Household } from './household.ts';

/** A print job: the labels, and the Actions that link their codes, recorded when the PDF is made. */
interface Job {
  title: string;
  labels: PrintLabel[];
  actions: ActionBody[];
}

/**
 * Label printing (spec §10.3): "Print Labels for N new things", print on any Asset or Location
 * (Reprint keeps the code; Replace links a new one and retires the old), and "Print a sheet of blank
 * Labels". The print dialog starts at a chosen position, to reuse a partly used sheet.
 */
export function LabelsPage({ household, save = savePdf }: { household: Household; save?: (labels: PrintLabel[], start: number) => void }) {
  const { inventory, record } = household;
  const things = useMemo(() => labelThings(inventory), [inventory]);
  const unlabelled = things.filter((t) => !t.code);
  const [job, setJob] = useState<Job | null>(null);
  const [blanks, setBlanks] = useState(LABELS_PER_SHEET);

  const forThing = (thing: LabelThing, replace = false) => {
    const { label, actions } = replace ? replaceLabel(inventory, thing) : labelForThing(inventory, thing);
    setJob({ title: replace ? `Replace the Label on ${thing.name}` : `${thing.code ? 'Reprint' : 'Print'} the Label for ${thing.name}`, labels: [label], actions });
  };

  return (
    <main className="main">
      <h1>Labels</h1>
      {job ? (
        <PrintDialog
          job={job}
          onCancel={() => setJob(null)}
          onPrint={async (start) => {
            // Link new codes first, so a printed Label always opens its thing.
            if (job.actions.length) await record(...job.actions);
            save(job.labels, start);
            setJob(null);
          }}
        />
      ) : (
        <>
          <div className="toolbar">
            <button
              type="button"
              disabled={unlabelled.length === 0}
              onClick={() => {
                const { labels, actions } = labelsForNewThings(inventory);
                setJob({ title: `Labels for ${labels.length} new things`, labels, actions });
              }}
            >
              Print Labels for {unlabelled.length} new {unlabelled.length === 1 ? 'thing' : 'things'}
            </button>
            <label>
              <input type="number" min={1} max={210} value={blanks} onChange={(e) => setBlanks(Math.max(1, Math.min(210, Number(e.target.value) || 1)))} style={{ width: 64 }} />{' '}
            </label>
            <button type="button" className="ghost" onClick={() => setJob({ title: `${blanks} blank Labels`, labels: blankLabels(inventory, blanks), actions: [] })}>
              Print a sheet of blank Labels
            </button>
          </div>
          <table className="card">
            <thead>
              <tr>
                <th>Asset or Location</th>
                <th>Label</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {things.map((t) => (
                <tr key={`${t.kind}:${t.id}`}>
                  <td>
                    {t.kind === 'location' ? '📍 ' : ''}
                    {t.name}
                  </td>
                  <td>{t.code ? <code>{t.code}</code> : <span className="mute">No Label yet</span>}</td>
                  <td className="num">
                    <button type="button" className="ghost small" onClick={() => forThing(t)}>
                      {t.code ? 'Reprint' : 'Print'}
                    </button>{' '}
                    {t.code && (
                      <button type="button" className="ghost small" onClick={() => forThing(t, true)}>
                        Replace
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {things.length === 0 && (
                <tr>
                  <td colSpan={3} className="mute">
                    No Assets or Locations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mute small">
            A4 sticker sheets of 21 labels, 63.5 × 38.1 mm. Paper indoors; waterproof vinyl for the freezer, fridge, garage and outdoors. Reprint
            prints the same code and the old Label keeps working; Replace gives a new code and the old Label stops working.
          </p>
        </>
      )}
    </main>
  );
}

/** "Start at label position N", with a sheet map: used positions greyed, these labels filled. */
export function PrintDialog({ job, onPrint, onCancel }: { job: Job; onPrint(start: number): void; onCancel(): void }) {
  const [start, setStart] = useState(1);
  const onFirstSheet = Math.min(job.labels.length, LABELS_PER_SHEET - start + 1);
  return (
    <section className="card print">
      <h2>{job.title}</h2>
      <p>
        {job.labels.length} label{job.labels.length === 1 ? '' : 's'}. Start at label position{' '}
        <input type="number" min={1} max={LABELS_PER_SHEET} value={start} onChange={(e) => setStart(Math.max(1, Math.min(LABELS_PER_SHEET, Number(e.target.value) || 1)))} aria-label="Start at label position" style={{ width: 56 }} />
      </p>
      <div className="sheet" style={{ gridTemplateColumns: `repeat(${SHEET.columns}, 1fr)` }} aria-label="Sheet map">
        {Array.from({ length: LABELS_PER_SHEET }, (_, i) => {
          const position = i + 1;
          const state = position < start ? 'used' : position < start + onFirstSheet ? 'new' : 'free';
          return (
            <button key={position} type="button" className={`cell ${state}`} onClick={() => setStart(position)} title={`Start at ${position}`}>
              {position}
            </button>
          );
        })}
      </div>
      {job.labels.length > onFirstSheet && <p className="mute small">The rest go on a new sheet.</p>}
      {job.actions.length > 0 && <p className="mute small">Printing links the new codes, so the Labels work as soon as they’re stuck on.</p>}
      <div className="buttons">
        <button type="button" onClick={() => onPrint(start)}>
          Make the PDF
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** The PDF code is loaded only when a PDF is made, keeping the dashboard itself small. */
function savePdf(labels: PrintLabel[], start: number) {
  void import('./labelPdf.ts').then(({ labelPdf }) => labelPdf(labels, start).save(`labels-${new Date().toISOString().slice(0, 10)}.pdf`));
}
