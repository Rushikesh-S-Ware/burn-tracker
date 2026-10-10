import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { themed, useC } from './theme';

// ---------- haptics (no-op where unsupported) ----------

export const haptic = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

// ---------- pressable that shrinks a little and buzzes when tapped ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Tap({
  children,
  style,
  scaleTo = 0.96,
  onPress,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  // Layout styles (flex, width) must sit on the Pressable itself: a flex child inside a
  // plain Pressable gets zero width on Android, which made the tab bar vanish.
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      onPress={(e) => {
        haptic.tap();
        onPress?.(e);
      }}
      style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ---------- basic building blocks ----------

const useSt = themed((C) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: C.dark ? 0 : 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: C.dark ? 0 : 1,
      borderWidth: C.dark ? 1 : 0,
      borderColor: C.line,
    },
    title: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 10 },
    label: { fontSize: 13, color: C.sub, marginBottom: 4 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 12,
      backgroundColor: C.inputBg,
      paddingHorizontal: 10,
    },
    input: { flex: 1, minWidth: 0, fontSize: 17, paddingVertical: 10, color: C.text },
    suffix: { color: C.sub, fontSize: 14, marginLeft: 4 },
    btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    btnInner: { paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.chip, marginRight: 8 },
    chipText: { color: C.text, fontWeight: '600' },
    track: { height: 10, borderRadius: 5, backgroundColor: C.track, overflow: 'hidden' },
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      bottom: 80,
      backgroundColor: C.dark ? '#ECEFF4' : '#1B2330',
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 24,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    toastText: { color: C.dark ? '#1B2330' : '#fff', fontWeight: '700', fontSize: 15 },
  }),
);

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSt();
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const s = useSt();
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const s = useSt();
  return <Text style={s.label}>{children}</Text>;
}

export function Field({ label, suffix, ...props }: TextInputProps & { label: string; suffix?: string }) {
  const s = useSt();
  const C = useC();
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <View style={s.inputRow}>
        <TextInput style={s.input} keyboardType="decimal-pad" placeholderTextColor={C.placeholder} selectTextOnFocus {...props} />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export const BRAND_GRADIENT = ['#FF8A4C', '#FF6B2C', '#E5484D'] as const;

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'success';
  disabled?: boolean;
}) {
  const s = useSt();
  const C = useC();
  const bg = { primary: C.primary, ghost: C.primarySoft, danger: C.red, success: C.green }[kind];
  const label = <Text style={[s.btnText, kind === 'ghost' && { color: C.primary }]}>{title}</Text>;
  if (kind === 'primary') {
    return (
      <Tap onPress={onPress} disabled={disabled} style={[s.btn, { padding: 0, overflow: 'hidden' }]}>
        <LinearGradient colors={[...BRAND_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnInner}>
          {label}
        </LinearGradient>
      </Tap>
    );
  }
  return (
    <Tap onPress={onPress} disabled={disabled} style={[s.btn, { backgroundColor: bg }]}>
      {label}
    </Tap>
  );
}

/** Soft brand-coloured glow behind the top of a screen, so pages don't feel flat. */
export function PageGlow() {
  const C = useC();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={C.dark ? ['rgba(255,107,44,0.16)', 'rgba(255,107,44,0)'] : ['rgba(255,138,76,0.28)', 'rgba(255,138,76,0)']}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 260 }}
    />
  );
}

export function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  const s = useSt();
  const C = useC();
  return (
    <Tap onPress={onPress} style={[s.chip, active && { backgroundColor: C.primary }]}>
      <Text style={[s.chipText, active && { color: '#fff' }]}>{text}</Text>
    </Tap>
  );
}

// ---------- animated pieces ----------

/** A number that counts up/down smoothly when it changes. */
export function AnimatedNumber({ value, style, suffix = '' }: { value: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const anim = useState(() => new Animated.Value(value))[0];
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    Animated.timing(anim, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value, anim]);
  return (
    <Text style={style}>
      {fmt(shown)}
      {suffix}
    </Text>
  );
}

/** Horizontal progress bar that animates to `pct` (0–1). */
export function ProgressBar({ pct, color, height = 10 }: { pct: number; color?: string; height?: number }) {
  const s = useSt();
  const C = useC();
  const anim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0, Math.min(1, pct)), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, anim]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: color ?? C.primary }} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular progress ring (0–1) with content in the middle. */
export function ProgressRing({
  pct,
  size = 110,
  stroke = 11,
  color,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color: string;
  children?: ReactNode;
}) {
  const C = useC();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const anim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0, Math.min(1, pct)), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, anim]);
  const offset = anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Fades + slides its children in when first shown. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const anim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 350, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, delay]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={[style, { opacity: anim, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ---------- toast: toast('Saved!') from anywhere; optional action button, e.g. Undo ----------

type ToastOpts = { action?: string; onAction?: () => void; duration?: number };
let showToast: ((msg: string, opts?: ToastOpts) => void) | null = null;
export const toast = (msg: string, opts?: ToastOpts) => showToast?.(msg, opts);

export function ToastHost() {
  const s = useSt();
  const C = useC();
  const [msg, setMsg] = useState('');
  const [opts, setOpts] = useState<ToastOpts>({});
  const anim = useState(() => new Animated.Value(0))[0];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = () => Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  useEffect(() => {
    showToast = (m, o = {}) => {
      setMsg(m);
      setOpts(o);
      if (timer.current) clearTimeout(timer.current);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
      timer.current = setTimeout(hide, o.duration ?? (o.action ? 5000 : 2200));
    };
    return () => {
      showToast = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
  return (
    <Animated.View pointerEvents={opts.action ? 'box-none' : 'none'} style={[s.toast, { opacity: anim, transform: [{ translateY }] }]}>
      <Text style={s.toastText}>{msg}</Text>
      {opts.action ? (
        <Pressable
          onPress={() => {
            opts.onAction?.();
            if (timer.current) clearTimeout(timer.current);
            hide();
          }}
          hitSlop={10}
          style={{ marginLeft: 14 }}
        >
          <Text style={[s.toastText, { color: C.primary }]}>{opts.action}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// ---------- helpers ----------

export const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n: number) => Math.round(n).toLocaleString();
