import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate } from '@inventory/shared';
import { Stepper } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { previewUse } from '@inventory/shared';
import { useToast } from '../../ui/Toast';
import { colors, ui } from '../../ui/styles';

/** How long the Undo toast shows; the sync waits for it, so Undo leaves nothing in history. */
const UNDO_MS = 6_000;

/**
 * "I used some" (spec §6.2): how many, in the Supply's own unit (default 1); the oldest Batch goes
 * first and what's left; Save confirms, and a short Undo toast follows.
 */
export default function UseSome() {
  const { supplyId } = useLocalSearchParams<{ supplyId: string }>();
  const { inventory, record, dropUnsent } = useSession();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const supply = supplyId ? inventory.supplies[supplyId] : undefined;
  const preview = supplyId ? previewUse(inventory, supplyId, quantity) : null;

  if (!supply || supply.deletedAt || !preview) return <Redirect href="/scan" />;

  const save = async () => {
    setSaving(true);
    try {
      const action = await record({ type: 'supply.used', payload: { supplyId: supply.id, quantity } }, { syncDelayMs: UNDO_MS });
      router.dismissTo('/');
      toast({
        text: `Used ${quantity} ${supply.unit} of ${supply.name}. ${preview.left} left.`,
        actionLabel: 'Undo',
        ms: UNDO_MS,
        onAction: () => {
          void dropUnsent(action.id).then((dropped) =>
            toast({ text: dropped ? 'Undone.' : 'Already synced: undo it from Recent activity.' }),
          );
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const oldest = preview.oldest;
  return (
    <View style={[ui.screen, { paddingTop: 56 }]}>
      <Text style={ui.mute}>I used some</Text>
      <Text style={ui.title}>{supply.name}</Text>
      <Text style={ui.label}>How many?</Text>
      <Stepper value={quantity} unit={supply.unit} onChange={setQuantity} />
      <Text style={ui.body}>
        {oldest
          ? `The oldest Batch goes first: ${oldest.quantity} ${supply.unit}, ${oldest.expiry ? `expires ${formatDate(oldest.expiry)}` : 'no date'}${oldest.locationName ? `, in ${oldest.locationName}` : ''}.`
          : 'None is recorded at home.'}
      </Text>
      <Text style={[ui.body, { fontWeight: '700' }]}>
        {preview.left} {supply.unit} left after this.
      </Text>
      {preview.willBeLowStock && preview.short === 0 && (
        <View style={ui.note}>
          <Text style={ui.noteText}>It will be Low stock and go on the Shopping list.</Text>
        </View>
      )}
      {preview.short > 0 && (
        <View style={ui.error}>
          <Text style={ui.errorText}>
            That’s {preview.short} more than recorded. It will still be saved, and the home server will ask someone to check
            the count.
          </Text>
        </View>
      )}
      <Pressable style={[ui.primary, saving && { opacity: 0.4 }]} disabled={saving} onPress={() => void save()}>
        <Text style={ui.primaryText}>Save</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: colors.mute }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
