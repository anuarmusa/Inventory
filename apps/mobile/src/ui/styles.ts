import { Platform, StyleSheet } from 'react-native';

/**
 * The app's look: a fresh teal brand colour, warm accents for things that need attention, a soft
 * page background with white cards, rounded corners and gentle shadows.
 */
export const colors = {
  ink: '#16212e',
  mute: '#6b7686',
  line: '#e3e8ef',
  bg: '#f3f6fa',
  card: '#ffffff',
  accent: '#0e8a6a',
  accentDark: '#0a6b52',
  accentSoft: '#dff4ec',
  warn: '#b45309',
  warnSoft: '#fff3e0',
  bad: '#c2283a',
  badSoft: '#fde8eb',
  blue: '#2563eb',
  blueSoft: '#e3edff',
  purple: '#7c3aed',
  purpleSoft: '#efe7ff',
  amber: '#d97706',
  amberSoft: '#fff4db',
  rose: '#e11d48',
  roseSoft: '#ffe4ea',
};

/** The brand gradient for headers. */
export const brandGradient = ['#0e8a6a', '#14b08a'] as const;

/** A soft shadow that works on Android (elevation) and iOS. */
export const shadow = Platform.select({
  android: { elevation: 3 },
  default: { shadowColor: '#0b1b2b', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
});

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 14 },
  centered: { flex: 1, backgroundColor: colors.bg, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  mute: { fontSize: 14, color: colors.mute, lineHeight: 20 },
  label: { fontSize: 13, color: colors.mute, marginBottom: 4, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    fontSize: 17,
    color: colors.ink,
  },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', ...shadow },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, ...shadow },
  note: { backgroundColor: colors.warnSoft, borderRadius: 14, padding: 12 },
  noteText: { color: colors.warn, fontSize: 15, lineHeight: 21 },
  error: { backgroundColor: colors.badSoft, borderRadius: 14, padding: 12 },
  errorText: { color: colors.bad, fontSize: 15, lineHeight: 21 },
});
