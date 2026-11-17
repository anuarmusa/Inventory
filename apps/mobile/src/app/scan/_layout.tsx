import { Stack } from 'expo-router';
import { BasketProvider } from '../../scan/BasketProvider';

/** The scan screens share one shopping basket. */
export default function ScanLayout() {
  return (
    <BasketProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BasketProvider>
  );
}
