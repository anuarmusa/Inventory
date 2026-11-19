import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './styles';

export interface ToastMessage {
  text: string;
  /** E.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** How long it shows. */
  ms?: number;
}

const Context = createContext<((toast: ToastMessage) => void) | null>(null);

/** Shows short messages at the bottom of every screen, such as the Undo toast after Save. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((next: ToastMessage) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), next.ms ?? 4_000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const value = useMemo(() => show, [show]);
  return (
    <Context.Provider value={value}>
      {children}
      {toast && (
        <View style={[styles.toast, { bottom: 32 + insets.bottom }]} accessibilityLiveRegion="polite">
          <Text style={styles.text}>{toast.text}</Text>
          {toast.actionLabel && (
            <Pressable
              onPress={() => {
                setToast(null);
                toast.onAction?.();
              }}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.action}>{toast.actionLabel}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Context.Provider>
  );
}

export function useToast(): (toast: ToastMessage) => void {
  const value = useContext(Context);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: { color: '#fff', fontSize: 15, flex: 1 },
  action: { color: '#7ee2c0', fontSize: 15, fontWeight: '700' },
});
