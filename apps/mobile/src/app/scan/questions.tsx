import type { CalendarDate } from '@inventory/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { localToday, supplyNameFrom } from '@inventory/shared';
import {
  answerExpiry,
  answerNewProduct,
  answerWeighed,
  foundProduct,
  type Line,
  lineQuantity,
  nextQuestion,
  supplyOf,
  type SupplyChoice,
} from '../../scan/basket';
import { useBasket } from '../../scan/BasketProvider';
import { expiryChoices, formatDate, parseTypedDate } from '@inventory/shared';
import { OFF_ATTRIBUTION } from '../../scan/openFoodFacts';
import { Stepper, styles as pick, SupplyPicker } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { colors, ui } from '../../ui/styles';

/**
 * After "Done scanning": one question per screen, only for the lines that need it (spec §6.2).
 * When none are left, on to the review.
 */
export default function Questions() {
  const { inventory } = useSession();
  const { basket } = useBasket();
  const question = nextQuestion(basket, inventory);
  const line = question ? basket.lines.find((l) => l.code === question.code) : undefined;

  useEffect(() => {
    if (basket.lines.length && !question) router.replace('/scan/review');
  }, [basket.lines.length, question]);

  if (!basket.lines.length) return <Redirect href="/scan" />;
  if (!question || !line) return null;

  const remaining = basket.lines.filter((l) => !l.identified || !l.expiryAnswered).length;
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
      <Text style={ui.mute}>{remaining === 1 ? 'Last question' : `${remaining} lines to set up`}</Text>
      {question.kind === 'new_product' && <NewProductQuestion key={line.code} line={line} />}
      {question.kind === 'weighed' && <WeighedQuestion key={line.code} line={line} />}
      {question.kind === 'expiry' && <ExpiryQuestion key={line.code} line={line} />}
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={ui.mute}>Back to scanning</Text>
      </Pressable>
    </ScrollView>
  );
}

/** A new product: the lookup result, the name on the pack, which Supply it is, units per scan. */
function NewProductQuestion({ line }: { line: Line }) {
  const { inventory } = useSession();
  const { basket, update } = useBasket();
  const found = foundProduct(line);
  const [productName, setProductName] = useState(found ? [found.brand, found.productName].filter(Boolean).join(' ') : '');
  const [choice, setChoice] = useState<SupplyChoice | null>(null);
  const [unitsPerScan, setUnitsPerScan] = useState(1);

  // Fill the name in when the lookup answers while this screen is open.
  useEffect(() => {
    if (found && !productName) setProductName([found.brand, found.productName].filter(Boolean).join(' '));
  }, [found, productName]);

  const unit = choice && 'newSupply' in choice ? choice.newSupply.unit : choice ? supplyOf(basket, inventory, choice.supplyId)?.unit : null;
  const save = () =>
    choice &&
    update((b) =>
      answerNewProduct(b, inventory, line.code, {
        choice,
        unitsPerScan,
        product: {
          productName: productName.trim() || null,
          brand: found?.brand ?? null,
          packSize: found?.packSize ?? null,
          fromOpenFoodFacts: Boolean(found),
        },
      }),
    );

  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.title}>New product</Text>
      <Text style={ui.mute}>
        Barcode {line.code} · scanned {line.scans}×
      </Text>
      <LookupNote line={line} />
      <Text style={ui.label}>Name on the pack</Text>
      <TextInput style={ui.input} value={productName} onChangeText={setProductName} placeholder="e.g. Kuih bangkit 300g" />
      <Text style={ui.label}>Which Supply is it?</Text>
      <SupplyPicker inventory={inventory} basket={basket} suggestion={supplyNameFrom(found?.productName ?? productName)} value={choice} onChange={setChoice} />
      <Text style={ui.label}>One scan of this barcode adds</Text>
      <Stepper value={unitsPerScan} unit={unit ?? 'units'} onChange={setUnitsPerScan} />
      <Pressable style={[ui.primary, !choice && { opacity: 0.4 }]} disabled={!choice} onPress={save}>
        <Text style={ui.primaryText}>Next</Text>
      </Pressable>
    </View>
  );
}

function LookupNote({ line }: { line: Line }) {
  if (line.lookup === 'pending') {
    return (
      <View style={[ui.note, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
        <ActivityIndicator />
        <Text style={ui.noteText}>Looking it up on Open Food Facts…</Text>
      </View>
    );
  }
  const found = foundProduct(line);
  if (found) {
    return (
      <View style={[ui.note, { backgroundColor: colors.accentSoft }]}>
        <Text style={[ui.body, { color: colors.accent }]}>
          Found: {[found.brand, found.productName, found.packSize].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[ui.mute, { fontSize: 12 }]}>{OFF_ATTRIBUTION}</Text>
      </View>
    );
  }
  const offline = line.lookup?.status === 'offline';
  return (
    <View style={ui.note}>
      <Text style={ui.noteText}>
        {offline ? 'Couldn’t look it up (no internet). Type the name in.' : 'Not on Open Food Facts. Type the name in.'}
      </Text>
    </View>
  );
}

/** A shop-weighed code says only the weight and price: which Supply is it? */
function WeighedQuestion({ line }: { line: Line }) {
  const { inventory } = useSession();
  const { basket, update } = useBasket();
  const [choice, setChoice] = useState<SupplyChoice | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.title}>Shop-weighed item</Text>
      <Text style={ui.mute}>This code only says the weight and price. Which Supply is it?</Text>
      <SupplyPicker inventory={inventory} basket={basket} suggestion="" value={choice} onChange={setChoice} />
      <Pressable
        style={[ui.primary, !choice && { opacity: 0.4 }]}
        disabled={!choice}
        onPress={() => choice && update((b) => answerWeighed(b, inventory, line.code, choice))}
      >
        <Text style={ui.primaryText}>Next</Text>
      </Pressable>
    </View>
  );
}

/** A date: quick picks or typed as day/month/year. */
function DateChoice({ value, onChange }: { value: CalendarDate | null; onChange(d: CalendarDate | null): void }) {
  const [typed, setTyped] = useState('');
  const choices = expiryChoices(localToday());
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {choices.map((c) => (
          <Pressable key={c.label} style={[pick.chip, value === c.date && pick.chipOn]} onPress={() => onChange(c.date)}>
            <Text style={{ color: value === c.date ? '#fff' : colors.ink }}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={ui.input}
        value={typed}
        keyboardType="numbers-and-punctuation"
        placeholder="Or type it: 31/12/2026"
        onChangeText={(t) => {
          setTyped(t);
          onChange(parseTypedDate(t));
        }}
      />
      <Text style={ui.mute}>{value ? `Expires ${formatDate(value)}` : typed ? 'Not a date yet: day/month/year' : ' '}</Text>
    </View>
  );
}

/** Expiry, for Supplies that expire. Optional; Split gives part of the line a second date. */
function ExpiryQuestion({ line }: { line: Line }) {
  const { inventory } = useSession();
  const { basket, update } = useBasket();
  const supply = supplyOf(basket, inventory, line.supplyId)!;
  const total = lineQuantity(line);
  const [expiry, setExpiry] = useState<CalendarDate | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitQuantity, setSplitQuantity] = useState(1);
  const [secondExpiry, setSecondExpiry] = useState<CalendarDate | null>(null);

  const answer = (first: CalendarDate | null) =>
    update((b) => answerExpiry(b, line.code, first, splitting ? { quantity: splitQuantity, expiry: secondExpiry } : null));

  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.title}>{supply.name}</Text>
      <Text style={ui.body}>
        When does it expire? {total} {supply.unit}
      </Text>
      <Pressable style={ui.secondary} onPress={() => answer(null)}>
        <Text style={ui.secondaryText}>No date on the pack</Text>
      </Pressable>
      <DateChoice value={expiry} onChange={setExpiry} />
      {total > 1 &&
        (splitting ? (
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
            <Text style={ui.label}>How many have a second date?</Text>
            <Stepper value={Math.min(splitQuantity, total - 1)} unit={supply.unit} onChange={(n) => setSplitQuantity(Math.min(n, total - 1))} />
            <DateChoice value={secondExpiry} onChange={setSecondExpiry} />
            <Pressable onPress={() => setSplitting(false)}>
              <Text style={{ color: colors.accent }}>Don’t split</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setSplitting(true)}>
            <Text style={{ color: colors.accent }}>Split: some have a different date</Text>
          </Pressable>
        ))}
      <Pressable style={[ui.primary, !expiry && { opacity: 0.4 }]} disabled={!expiry} onPress={() => answer(expiry)}>
        <Text style={ui.primaryText}>Next</Text>
      </Pressable>
    </View>
  );
}
