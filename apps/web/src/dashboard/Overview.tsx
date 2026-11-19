import { CircleAlert, History, Hourglass, type LucideIcon, ShoppingCart, TrendingDown, Tv, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type CheckItem,
  countActions,
  expiresWhen,
  type Fix,
  fixActions,
  formatDate,
  history,
  type HistoryEntry,
  keepTicks,
  localToday,
  lowStock,
  nearExpiry,
  needsChecking,
  onHand,
  redoActions,
  ringgit,
  shoppingList,
  supplyList,
  totalAssetValueSen,
  undoBody,
} from '@inventory/shared';
import type { Household } from './household.ts';

const TICKS_KEY = 'inventory.shoppingTicks';

function readTicks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TICKS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * The dashboard (spec §10.1, prototype variant A): "Needs checking" across the top only when
 * Mismatches are open, a 2×2 grid (Shopping list, Near expiry, Low stock, Assets) and Recent activity.
 */
export function Overview({ household }: { household: Household }) {
  const { inventory, state, error } = household;
  const today = localToday();
  const checking = useMemo(() => needsChecking(inventory), [inventory]);
  const buy = useMemo(() => shoppingList(inventory), [inventory]);
  const near = useMemo(() => nearExpiry(inventory, today), [inventory, today]);
  const low = useMemo(() => lowStock(inventory), [inventory]);
  const assets = useMemo(
    () =>
      Object.values(inventory.assets)
        .filter((a) => !a.deletedAt && !a.disposedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [inventory],
  );
  const activity = useMemo(() => history(inventory, [], null, 30), [inventory]);
  const [ticked, setTicked] = useState<string[]>(readTicks);

  const tick = (id: string) => {
    const next = keepTicks(ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id], buy);
    setTicked(next);
    try {
      localStorage.setItem(TICKS_KEY, JSON.stringify(next));
    } catch {
      // Ticks are a convenience; without storage they last until the page reloads.
    }
  };

  if (!state) return <main className="main">{error ? <p className="error">{error}</p> : <p className="mute">Loading…</p>}</main>;

  return (
    <div className="overview">
      <main className="main">
        <header className="hero">
          <div>
            <p className="hello">{greeting()}</p>
            <h1>Our home</h1>
          </div>
        </header>
        <div className="kpis">
          <Kpi icon={ShoppingCart} tone="blue" label="To buy" value={buy.length} />
          <Kpi icon={TrendingDown} tone="amber" label="Low stock" value={low.length} />
          <Kpi icon={Hourglass} tone="rose" label="Near expiry" value={near.length} />
          <Kpi icon={Wallet} tone="purple" label="Asset value" value={ringgit(totalAssetValueSen(Object.values(inventory.assets)))} />
        </div>
        {error && <p className="error">{error}</p>}
        {checking.length > 0 && (
          <section className="card checking">
            <h2>
              <CircleAlert size={18} className="ic bad" /> Needs checking ({checking.length})
            </h2>
            {checking.map((item) => (
              <CheckingItem key={item.mismatch.id} item={item} household={household} />
            ))}
          </section>
        )}
        <div className="grid2">
          <section className="card">
            <h2>
              <ShoppingCart size={18} className="ic blue" /> Shopping list
            </h2>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Supply</th>
                  <th className="num">Buy</th>
                  <th className="num">At home</th>
                </tr>
              </thead>
              <tbody>
                {buy.map(({ supply, amount, onHand: have }) => (
                  <tr key={supply.id} className={ticked.includes(supply.id) ? 'done' : undefined}>
                    <td>
                      <input type="checkbox" checked={ticked.includes(supply.id)} onChange={() => tick(supply.id)} aria-label={`Bought ${supply.name}`} />
                    </td>
                    <td>{supply.name}</td>
                    <td className="num">
                      <b>
                        {amount} {supply.unit}
                      </b>
                    </td>
                    <td className="num">{have}</td>
                  </tr>
                ))}
                {buy.length === 0 && (
                  <tr>
                    <td colSpan={4} className="mute">
                      Nothing to buy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>
              <Hourglass size={18} className="ic rose" /> Near expiry
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Where</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {near.map(({ batch, supply, locationName, daysLeft }) => (
                  <tr key={batch.id}>
                    <td>
                      {batch.quantity} {supply.unit} {supply.name}
                    </td>
                    <td>{locationName ?? '—'}</td>
                    <td>
                      <span className="badge warn">
                        {formatDate(batch.expiry)} · {expiresWhen(daysLeft)}
                      </span>
                    </td>
                  </tr>
                ))}
                {near.length === 0 && (
                  <tr>
                    <td colSpan={3} className="mute">
                      Nothing near expiry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>
              <TrendingDown size={18} className="ic amber" /> Low stock
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Supply</th>
                  <th className="num">On hand</th>
                  <th className="num">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {low.map(({ supply, onHand: have }) => (
                  <tr key={supply.id}>
                    <td>{supply.name}</td>
                    <td className="num">
                      {have} {supply.unit}
                    </td>
                    <td className="num">{supply.minimum}</td>
                  </tr>
                ))}
                {low.length === 0 && (
                  <tr>
                    <td colSpan={3} className="mute">
                      Nothing is low.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>
              <Tv size={18} className="ic purple" /> Assets · {ringgit(totalAssetValueSen(Object.values(inventory.assets)))}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Where</th>
                  <th className="num">Price</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{(a.locationId && inventory.locations[a.locationId]?.name) || '—'}</td>
                    <td className="num">{ringgit(a.priceSen)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>
                    <b>Total (still owned)</b>
                  </td>
                  <td />
                  <td className="num">
                    <b>{ringgit(totalAssetValueSen(Object.values(inventory.assets)))}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </main>
      <aside className="activity">
        <h2>
          <History size={18} className="ic" /> Recent activity
        </h2>
        <Activity entries={activity} household={household} />
      </aside>
    </div>
  );
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** A colourful summary card: icon, value and label. */
function Kpi({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: 'blue' | 'amber' | 'rose' | 'purple'; label: string; value: number | string }) {
  return (
    <div className={`kpi ${tone}`}>
      <span className="kpi-icon">
        <Icon size={20} />
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function CheckingItem({ item, household }: { item: CheckItem; household: Household }) {
  const { inventory, record } = household;
  const [counting, setCounting] = useState<string | null>(null);
  const [redoing, setRedoing] = useState<string | null>(null);

  const apply = (fix: Fix) => {
    switch (fix.kind) {
      case 'count':
        return setCounting(String(onHand(inventory, fix.supplyId)));
      case 'redo':
        return setRedoing('');
      case 'merge': {
        const from = inventory.supplies[fix.fromSupplyId]?.name;
        const into = inventory.supplies[fix.intoSupplyId]?.name;
        if (!window.confirm(`Merge ${from} into ${into}? Its Batches and Barcodes move over and ${from} is hidden. This can’t be undone.`)) return;
        return void record(...fixActions(item, fix));
      }
      default:
        return void record(...fixActions(item, fix));
    }
  };
  const countFix = item.fixes.find((f) => f.kind === 'count');
  const redoFix = item.fixes.find((f) => f.kind === 'redo');

  return (
    <div className="note bad">
      <p>{item.text}</p>
      <div className="buttons">
        {item.fixes.map((fix) => (
          <button key={fix.label} type="button" className="ghost" onClick={() => apply(fix)}>
            {fix.label}
          </button>
        ))}
      </div>
      {counting !== null && countFix?.kind === 'count' && (
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(counting);
            if (Number.isInteger(n) && n >= 0) void record(...countActions(countFix.supplyId, n, item.mismatch.id));
          }}
        >
          <label>
            Counted at home <input type="number" min={0} value={counting} onChange={(e) => setCounting(e.target.value)} />
          </label>
          <button type="submit">Save count</button>
        </form>
      )}
      {redoing !== null && redoFix?.kind === 'redo' && (
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (redoing) void record(...redoActions(item, redoFix.body, redoing));
          }}
        >
          <label>
            Which Supply was it?{' '}
            <select value={redoing} onChange={(e) => setRedoing(e.target.value)}>
              <option value="">Choose…</option>
              {supplyList(inventory).map(({ supply }) => (
                <option key={supply.id} value={supply.id}>
                  {supply.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!redoing}>
            Redo it
          </button>
        </form>
      )}
    </div>
  );
}

export function Activity({ entries, household }: { entries: HistoryEntry[]; household: Household }) {
  const undo = (e: HistoryEntry) => {
    if (!e.undone && e.countedSince && !window.confirm('Counted since: this won’t change the amount. Undo anyway?')) return;
    void household.record(undoBody(e));
  };
  if (entries.length === 0) return <p className="mute">Nothing has happened yet.</p>;
  return (
    <table className="activity-table">
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>
              <span className={e.undone || e.fixed ? 'struck' : undefined}>{e.text}</span>
              {e.fixed && <div className="fixed">{e.fixed}</div>}
              <div className="mute small">
                {e.deviceName} · {new Date(e.when).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {e.undone ? ` · ${e.undone}` : ''}
                {e.skipped ? ' · skipped' : ''}
              </div>
            </td>
            <td>
              {e.canUndo && (
                <button type="button" className="ghost small" onClick={() => undo(e)}>
                  {e.undone ? 'Bring back' : 'Undo'}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
