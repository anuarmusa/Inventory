import { type FormEvent, useMemo, useState } from 'react';
import {
  type AssetForm,
  assetForm,
  assetList,
  assetProblems,
  type AssetRow,
  canDeleteCategory,
  canDeleteLocation,
  formatDate,
  liveCategories,
  liveLocations,
  parseRinggit,
  parseTypedDate,
  ringgit,
  saveAsset,
  saveSupply,
  type SupplyForm,
  supplyForm,
  supplyList,
  supplyProblems,
  type SupplyRow,
} from '@inventory/shared';
import type { Household } from './household.ts';

/**
 * Editing on the web (spec §10.1, §13): Supplies, Assets, Locations and Categories, mirroring the
 * phone's forms. Every change is an Action recorded by the Dashboard.
 */

const newId = () => crypto.randomUUID();

function Select({ value, options, onChange, none }: { value: string | null; options: { id: string; name: string }[]; onChange(v: string | null): void; none: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{none}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

const numberOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))));

export function SuppliesPage({ household }: { household: Household }) {
  const { inventory, record } = household;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SupplyRow | 'new' | null>(null);
  const rows = useMemo(() => supplyList(inventory, search), [inventory, search]);
  return (
    <main className="main">
      <h1>Supplies</h1>
      <div className="toolbar">
        <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" onClick={() => setEditing('new')}>
          + New Supply
        </button>
      </div>
      {editing && (
        <SupplyEditor
          key={editing === 'new' ? 'new' : editing.id}
          household={household}
          existing={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      <table className="card">
        <thead>
          <tr>
            <th>Supply</th>
            <th className="num">On hand</th>
            <th>Category</th>
            <th>Usually in</th>
            <th className="num">Minimum</th>
            <th className="num">Restock to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ supply, onHand }) => (
            <tr key={supply.id}>
              <td>{supply.name}</td>
              <td className="num">
                {onHand} {supply.unit}
              </td>
              <td>{(supply.categoryId && inventory.categories[supply.categoryId]?.name) || '—'}</td>
              <td>{(supply.usualLocationId && inventory.locations[supply.usualLocationId]?.name) || '—'}</td>
              <td className="num">{supply.minimum ?? '—'}</td>
              <td className="num">{supply.restockTo ?? '—'}</td>
              <td>
                <button type="button" className="ghost small" onClick={() => setEditing(supply)}>
                  Edit
                </button>{' '}
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    if (window.confirm(`Delete ${supply.name}? It is hidden with its history kept, and can be undone.`)) {
                      void record({ type: 'supply.deleted', payload: { supplyId: supply.id } });
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="mute">
                No Supplies.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

function SupplyEditor({ household, existing, onDone }: { household: Household; existing?: SupplyRow; onDone(): void }) {
  const { inventory, record } = household;
  const [form, setForm] = useState<SupplyForm>(() => supplyForm(existing));
  const set = <K extends keyof SupplyForm>(k: K, v: SupplyForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const problems = supplyProblems(form);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = saveSupply(existing, form, newId);
    if (body) void record(body);
    onDone();
  };
  return (
    <form className="card editor" onSubmit={submit}>
      <h2>{existing ? `Edit ${existing.name}` : 'New Supply'}</h2>
      <label>
        Item name: what you call it at home, any brand{' '}
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Jasmine rice" />
      </label>
      <label>
        Counted in (cans, packs, bottles…) <input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
      </label>
      <label>
        Category <Select value={form.categoryId} options={liveCategories(inventory)} onChange={(v) => set('categoryId', v)} none="None" />
      </label>
      <label>
        Usually in <Select value={form.usualLocationId} options={liveLocations(inventory)} onChange={(v) => set('usualLocationId', v)} none="Not set" />
      </label>
      <label>
        Minimum <input type="number" min={0} value={form.minimum ?? ''} onChange={(e) => set('minimum', numberOrNull(e.target.value))} placeholder="none" />
      </label>
      <label>
        Restock to <input type="number" min={1} value={form.restockTo ?? ''} onChange={(e) => set('restockTo', numberOrNull(e.target.value))} placeholder="none" />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.expires} onChange={(e) => set('expires', e.target.checked)} /> It expires
      </label>
      {form.expires && (
        <label>
          Near expiry warning (days){' '}
          <input type="number" min={0} value={form.nearExpiryDays ?? ''} onChange={(e) => set('nearExpiryDays', numberOrNull(e.target.value))} placeholder="household default" />
        </label>
      )}
      {problems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      <div className="buttons">
        <button type="submit" disabled={problems.length > 0}>
          Save
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AssetsPage({ household }: { household: Household }) {
  const { inventory } = household;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AssetRow | 'new' | null>(null);
  const rows = useMemo(() => assetList(inventory, search), [inventory, search]);
  return (
    <main className="main">
      <h1>Assets</h1>
      <div className="toolbar">
        <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" onClick={() => setEditing('new')}>
          + New Asset
        </button>
      </div>
      {editing && (
        <AssetEditor key={editing === 'new' ? 'new' : editing.id} household={household} existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
      )}
      <table className="card">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Category</th>
            <th>Where</th>
            <th>Bought</th>
            <th className="num">Price</th>
            <th>Warranty</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={a.disposedAt ? 'disposed' : undefined}>
              <td>
                {a.name} {a.disposedAt && <span className="badge">Disposed {formatDate(a.disposedAt)}</span>}
              </td>
              <td>{(a.categoryId && inventory.categories[a.categoryId]?.name) || '—'}</td>
              <td>{(a.locationId && inventory.locations[a.locationId]?.name) || '—'}</td>
              <td>{a.purchaseDate ? formatDate(a.purchaseDate) : '—'}</td>
              <td className="num">{ringgit(a.priceSen)}</td>
              <td>{a.warrantyEnd ? formatDate(a.warrantyEnd) : '—'}</td>
              <td>
                <button type="button" className="ghost small" onClick={() => setEditing(a)}>
                  Edit
                </button>{' '}
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    if (window.confirm(`Delete ${a.name}? Delete is for mistakes: it is hidden with its history kept, and can be undone.`)) {
                      void household.record({ type: 'asset.deleted', payload: { assetId: a.id } });
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="mute">
                No Assets.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const typed = (date: string | null) => (date ? date.split('-').reverse().join('/') : '');

function AssetEditor({ household, existing, onDone }: { household: Household; existing?: AssetRow; onDone(): void }) {
  const { inventory, record } = household;
  const [form, setForm] = useState<AssetForm>(() => assetForm(existing));
  const [price, setPrice] = useState(existing?.priceSen != null ? (existing.priceSen / 100).toFixed(2) : '');
  const [bought, setBought] = useState(typed(form.purchaseDate));
  const [warranty, setWarranty] = useState(typed(form.warrantyEnd));
  const set = <K extends keyof AssetForm>(k: K, v: AssetForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const priceSen = parseRinggit(price);
  const boughtDate = bought.trim() ? parseTypedDate(bought) : null;
  const warrantyDate = warranty.trim() ? parseTypedDate(warranty) : null;
  const problems = [
    ...assetProblems(form),
    ...(priceSen === undefined ? ['The price should look like 349 or 349.90.'] : []),
    ...(bought.trim() && !boughtDate ? ['“Bought” should be a date: day/month/year.'] : []),
    ...(warranty.trim() && !warrantyDate ? ['“Warranty ends” should be a date: day/month/year.'] : []),
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = saveAsset(existing, { ...form, priceSen: priceSen ?? null, purchaseDate: boughtDate, warrantyEnd: warrantyDate }, newId);
    if (body) void record(body);
    onDone();
  };
  return (
    <form className="card editor" onSubmit={submit}>
      <h2>{existing ? `Edit ${existing.name}` : 'New Asset'}</h2>
      <label>
        Name <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        Category <Select value={form.categoryId} options={liveCategories(inventory)} onChange={(v) => set('categoryId', v)} none="None" />
      </label>
      <label>
        Location <Select value={form.locationId} options={liveLocations(inventory)} onChange={(v) => set('locationId', v)} none="Not set" />
      </label>
      <label>
        Bought <input value={bought} onChange={(e) => setBought(e.target.value)} placeholder="31/12/2026" />
      </label>
      <label>
        Price (RM) <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="2899" />
      </label>
      <label>
        Shop <input value={form.shop ?? ''} onChange={(e) => set('shop', e.target.value)} />
      </label>
      <label>
        Serial number <input value={form.serialNumber ?? ''} onChange={(e) => set('serialNumber', e.target.value)} />
      </label>
      <label>
        Warranty ends <input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="31/12/2027" />
      </label>
      <label>
        Notes <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {problems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      <div className="buttons">
        <button type="submit" disabled={problems.length > 0}>
          Save
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PlacesPage({ household }: { household: Household }) {
  const { inventory } = household;
  return (
    <main className="main">
      <h1>Locations &amp; Categories</h1>
      <div className="grid2">
        <NameList kind="location" title="Locations" items={liveLocations(inventory)} canDelete={(id) => canDeleteLocation(inventory, id)} household={household} />
        <NameList kind="category" title="Categories" items={liveCategories(inventory)} canDelete={(id) => canDeleteCategory(inventory, id)} household={household} />
      </div>
    </main>
  );
}

function NameList({
  kind,
  title,
  items,
  canDelete,
  household,
}: {
  kind: 'location' | 'category';
  title: string;
  items: { id: string; name: string }[];
  canDelete(id: string): boolean;
  household: Household;
}) {
  const [adding, setAdding] = useState('');
  const { record } = household;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    void record(
      kind === 'location'
        ? { type: 'location.created', payload: { locationId: newId(), name } }
        : { type: 'category.created', payload: { categoryId: newId(), name } },
    );
    setAdding('');
  };
  const rename = (item: { id: string; name: string }) => {
    const name = window.prompt(`Rename ${item.name}`, item.name)?.trim();
    if (!name || name === item.name) return;
    void record(
      kind === 'location'
        ? { type: 'location.renamed', payload: { locationId: item.id, name } }
        : { type: 'category.renamed', payload: { categoryId: item.id, name } },
    );
  };
  const remove = (item: { id: string; name: string }) => {
    if (!canDelete(item.id)) {
      window.alert(kind === 'location' ? `${item.name} still holds things. Move or use them up first.` : `${item.name} is still used. Give its Supplies and Assets another Category first.`);
      return;
    }
    if (!window.confirm(`Delete ${item.name}?`)) return;
    void record(
      kind === 'location' ? { type: 'location.deleted', payload: { locationId: item.id } } : { type: 'category.deleted', payload: { categoryId: item.id } },
    );
  };
  return (
    <section className="card">
      <h2>{title}</h2>
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="num">
                <button type="button" className="ghost small" onClick={() => rename(item)}>
                  Rename
                </button>{' '}
                <button type="button" className="ghost small" onClick={() => remove(item)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="inline" onSubmit={add}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`New ${kind === 'location' ? 'Location' : 'Category'}`} />
        <button type="submit" disabled={!adding.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}
