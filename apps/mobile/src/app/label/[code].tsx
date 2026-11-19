import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { attachLabel, whatLabelOpens } from '../../scan/labels';
import { useSession } from '../../session/SessionProvider';
import { assetList, liveLocations } from '@inventory/shared';
import { colors, ui } from '../../ui/styles';

type Step = 'choose' | 'asset' | 'location';

/** A Blank label: "Attach to: a new Asset / an existing Asset / a Location" (spec §6.4). */
export default function BlankLabel() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { inventory, record } = useSession();
  const [step, setStep] = useState<Step>('choose');
  const [search, setSearch] = useState('');
  const assets = useMemo(() => assetList(inventory, search).filter((a) => !a.disposedAt), [inventory, search]);
  const opens = code ? whatLabelOpens(inventory, code) : null;

  const attach = async (target: { assetId: string } | { locationId: string }) => {
    await record(attachLabel(code!, target));
    if ('assetId' in target) router.replace({ pathname: '/asset/[id]', params: { id: target.assetId } });
    else router.replace({ pathname: '/location/[id]', params: { id: target.locationId } });
  };

  if (!code || !opens || opens.kind !== 'blank') {
    return (
      <View style={ui.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Label' }} />
        <Text style={ui.mute}>This Label is already attached.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: `Blank label ${code}` }} />
      {step === 'choose' && (
        <>
          <Text style={ui.title}>Attach to:</Text>
          <Pressable style={ui.primary} onPress={() => router.replace({ pathname: '/asset/edit', params: { label: code } })}>
            <Text style={ui.primaryText}>A new Asset</Text>
          </Pressable>
          <Pressable style={ui.secondary} onPress={() => setStep('asset')}>
            <Text style={ui.secondaryText}>An existing Asset</Text>
          </Pressable>
          <Pressable style={ui.secondary} onPress={() => setStep('location')}>
            <Text style={ui.secondaryText}>A Location</Text>
          </Pressable>
        </>
      )}
      {step === 'asset' && (
        <>
          <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search Assets" autoFocus />
          {assets.length === 0 && <Text style={ui.mute}>No Asset matches.</Text>}
          {assets.map((a) => (
            <Pressable key={a.id} style={styles.row} onPress={() => void attach({ assetId: a.id })}>
              <Text style={ui.body}>{a.name}</Text>
            </Pressable>
          ))}
        </>
      )}
      {step === 'location' &&
        liveLocations(inventory).map((l) => (
          <Pressable key={l.id} style={styles.row} onPress={() => void attach({ locationId: l.id })}>
            <Text style={ui.body}>{l.name}</Text>
          </Pressable>
        ))}
      {step !== 'choose' && (
        <Pressable onPress={() => setStep('choose')} style={{ padding: 8 }}>
          <Text style={{ color: colors.accent }}>‹ Back</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
});
