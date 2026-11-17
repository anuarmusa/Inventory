import { StyleSheet } from 'react-native';

export const colors = {
  ink: '#1d232b',
  mute: '#6b7480',
  line: '#dfe3e8',
  accent: '#0b7a5c',
  accentSoft: '#e3f3ec',
  warn: '#9a4a00',
  warnSoft: '#fff1dc',
  bad: '#b42318',
  badSoft: '#fdecea',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 20, gap: 14 },
  centered: { flex: 1, backgroundColor: '#fff', padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  mute: { fontSize: 14, color: colors.mute, lineHeight: 20 },
  label: { fontSize: 13, color: colors.mute, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 17, color: colors.ink },
  primary: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  secondaryText: { color: colors.ink, fontSize: 17 },
  note: { backgroundColor: colors.warnSoft, borderRadius: 10, padding: 12 },
  noteText: { color: colors.warn, fontSize: 15, lineHeight: 21 },
  error: { backgroundColor: colors.badSoft, borderRadius: 10, padding: 12 },
  errorText: { color: colors.bad, fontSize: 15, lineHeight: 21 },
});
