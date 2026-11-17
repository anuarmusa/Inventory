import { useMemo } from 'react';
import { expiresWhen, localToday, nearExpiry } from '../home/lists';
import { ListRow, ListScreen } from '../home/parts';
import { useSession } from '../session/SessionProvider';

/** Near expiry: Batches whose expiry date falls within their Supply's window, soonest first. */
export default function NearExpiry() {
  const { inventory } = useSession();
  const items = useMemo(() => nearExpiry(inventory, localToday()), [inventory]);
  return (
    <ListScreen title="Near expiry" empty="Nothing is near expiry.">
      {items.map(({ batch, supply, locationName, daysLeft }) => (
        <ListRow
          key={batch.id}
          title={`${supply.name} · ${batch.quantity} ${supply.unit}`}
          detail={locationName}
          badge={expiresWhen(daysLeft)}
        />
      ))}
    </ListScreen>
  );
}
