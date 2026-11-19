import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, shadow, ui } from './styles';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** An icon in a soft coloured circle. */
export function IconCircle({ name, color, background, size = 40 }: { name: IconName; color: string; background: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.52} color={color} />
    </View>
  );
}

/** A white rounded card. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

/** A small rounded label, e.g. "3 left". */
export function Pill({ text, color = colors.warn, background = colors.warnSoft }: { text: string; color?: string; background?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/** A section heading with an optional action on the right ("See all"). */
export function SectionTitle({ title, action, href }: { title: string; action?: string; href?: Href }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && href && (
        <Pressable onPress={() => router.push(href)} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A tappable row: icon, title and detail, something on the right, and a chevron when it opens a page. */
export function ListItem({
  icon,
  iconColor = colors.accent,
  iconBackground = colors.accentSoft,
  title,
  detail,
  right,
  href,
  onPress,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBackground?: string;
  title: string;
  detail?: string | null;
  right?: ReactNode;
  href?: Href;
  onPress?: () => void;
}) {
  const press = onPress ?? (href ? () => router.push(href) : undefined);
  return (
    <Pressable style={({ pressed }) => [styles.item, pressed && press && { opacity: 0.7 }]} onPress={press} disabled={!press}>
      {icon && <IconCircle name={icon} color={iconColor} background={iconBackground} size={38} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text style={ui.mute} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
      {press && <Ionicons name="chevron-forward" size={18} color={colors.mute} />}
    </Pressable>
  );
}

/** An empty state: a big soft icon and a line of text. */
export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <IconCircle name={icon} color={colors.accent} background={colors.accentSoft} size={64} />
      <Text style={[ui.mute, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  sectionAction: { fontSize: 14, fontWeight: '700', color: colors.accent },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    ...shadow,
  },
  itemTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
});
