import { useMemo } from 'react';
import { lowStock } from '../home/lists';
import { ListRow, ListScreen } from '../home/parts';
import { useSession } from '../session/SessionProvider';

/** Low stock: Supplies at or below their minimum. */
export default function LowStock() {
  const { inventory } = useSession();
  const items = useMemo(() => lowStock(inventory), [inventory]);
  return (
    <ListScreen title="Low stock" empty="Nothing is low.">
      {items.map(({ supply, onHand }) => (
        <ListRow key={supply.id} title={supply.name} detail={`Minimum ${supply.minimum} ${supply.unit}`} badge={`${onHand} left`} href={{ pathname: '/supply/[id]', params: { id: supply.id } }} />
      ))}
    </ListScreen>
  );
}
