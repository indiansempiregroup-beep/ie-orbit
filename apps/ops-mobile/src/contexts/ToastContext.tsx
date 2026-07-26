import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

type ToastTone = 'info' | 'success' | 'warning' | 'error';

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextState = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextState | undefined>(undefined);

function ToastBanner({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const icon =
    item.tone === 'success'
      ? 'check-circle'
      : item.tone === 'warning'
        ? 'alert-triangle'
        : item.tone === 'error'
          ? 'alert-circle'
          : 'info';

  const palette =
    item.tone === 'success'
      ? { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', icon: colors.success }
      : item.tone === 'warning'
        ? { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E', icon: colors.warning }
        : item.tone === 'error'
          ? { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: colors.destructive }
          : { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E3A8A', icon: '#2563EB' };

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
    >
      <Feather name={icon} size={18} color={palette.icon} style={styles.toastIcon} />
      <Text style={[styles.toastText, { color: palette.text }]}>{item.message}</Text>
      <Pressable
        onPress={() => onDismiss(item.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
      >
        <Feather name="x" size={16} color={palette.text} />
      </Pressable>
    </Animated.View>
  );
}

function ToastHost({ items, dismiss }: { items: ToastItem[]; dismiss: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  if (items.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      {items.map((item) => (
        <ToastBanner key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), 5600);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root} pointerEvents="box-none">
        {children}
        <ToastHost items={items} dismiss={dismiss} />
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 99999,
    elevation: 99999,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastIcon: { marginTop: 1 },
  toastText: {
    ...typography.body,
    fontFamily: fonts.bodyMedium,
    flex: 1,
    lineHeight: 20,
  },
});
