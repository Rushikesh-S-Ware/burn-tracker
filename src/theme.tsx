import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export type Palette = {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  sub: string;
  line: string;
  inputBg: string;
  chip: string;
  track: string;
  placeholder: string;
  primary: string;
  primarySoft: string;
  green: string;
  greenSoft: string;
  blue: string;
  purple: string;
  red: string;
};

export const LIGHT: Palette = {
  dark: false,
  bg: '#F4F6FA',
  card: '#FFFFFF',
  text: '#1B2330',
  sub: '#6B7585',
  line: '#E3E7EE',
  inputBg: '#FAFBFC',
  chip: '#EDEFF3',
  track: '#EEF1F5',
  placeholder: '#A0A8B5',
  primary: '#FF6B2C',
  primarySoft: '#FFE9DF',
  green: '#1FA971',
  greenSoft: '#DDF5EA',
  blue: '#2F7BF5',
  purple: '#8B5CF6',
  red: '#E5484D',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0F1115',
  card: '#1A1D23',
  text: '#ECEFF4',
  sub: '#9AA3B2',
  line: '#2A2F38',
  inputBg: '#22262E',
  chip: '#2A2F38',
  track: '#2A2F38',
  placeholder: '#6B7585',
  primary: '#FF7A3D',
  primarySoft: '#3A2418',
  green: '#2BC48A',
  greenSoft: '#173326',
  blue: '#4C8DF6',
  purple: '#A07CF8',
  red: '#F26D6D',
};

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'theme';

type Ctx = { C: Palette; mode: ThemeMode; setMode: (m: ThemeMode) => void };
const ThemeContext = createContext<Ctx>({ C: LIGHT, mode: 'system', setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((m) => {
      if (m === 'light' || m === 'dark' || m === 'system') setModeState(m);
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
    return {
      C: dark ? DARK : LIGHT,
      mode,
      setMode: (m) => {
        setModeState(m);
        AsyncStorage.setItem(KEY, m);
      },
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useC = () => useContext(ThemeContext).C;

/** Build a style hook whose styles follow the current theme: `const useSt = themed((C) => StyleSheet.create({...}))`. */
export function themed<T>(factory: (C: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useThemedStyles() {
    const C = useC();
    let styles = cache.get(C);
    if (!styles) {
      styles = factory(C);
      cache.set(C, styles);
    }
    return styles;
  };
}
