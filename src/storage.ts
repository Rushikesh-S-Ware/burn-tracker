import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PROFILE, Profile, SetRec } from './calc';

// Everything is stored on the device. No network is ever used.

export type LogEntry = {
  id: string;
  exerciseId: string;
  name: string;
  setList?: SetRec[]; // strength: every set with its own reps/weight/rest
  weightKg?: number; // legacy (v1 entries)
  sets?: number; // legacy (v1 entries)
  reps?: number; // legacy (v1 entries)
  minutes?: number;
  kcal: number;
  time: number; // epoch ms
};

export type DayLog = {
  entries: LogEntry[];
  steps: number; // manually entered + live counted
  foodKcal: number; // optional calories eaten
  rest?: boolean; // marked as a planned rest day (keeps the streak alive)
};

const EMPTY_DAY: DayLog = { entries: [], steps: 0, foodKcal: 0 };
const PROFILE_KEY = 'profile';
const dayKey = (date: string) => `day:${date}`;

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function loadProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : null;
}

export async function saveProfile(p: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

export async function loadDay(date: string): Promise<DayLog> {
  const raw = await AsyncStorage.getItem(dayKey(date));
  return raw ? { ...EMPTY_DAY, ...JSON.parse(raw) } : { ...EMPTY_DAY, entries: [] };
}

export async function saveDay(date: string, log: DayLog): Promise<void> {
  await AsyncStorage.setItem(dayKey(date), JSON.stringify(log));
}

export async function loadDays(dates: string[]): Promise<Record<string, DayLog>> {
  const pairs = await AsyncStorage.multiGet(dates.map(dayKey));
  const out: Record<string, DayLog> = {};
  pairs.forEach(([, raw], i) => {
    out[dates[i]] = raw ? { ...EMPTY_DAY, ...JSON.parse(raw) } : { ...EMPTY_DAY, entries: [] };
  });
  return out;
}

// ---------- body weight log ----------

export type WeightEntry = { date: string; kg: number };
const WEIGHTS_KEY = 'weights';

export async function loadWeights(): Promise<WeightEntry[]> {
  const raw = await AsyncStorage.getItem(WEIGHTS_KEY);
  const list: WeightEntry[] = raw ? JSON.parse(raw) : [];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveWeights(list: WeightEntry[]): Promise<void> {
  await AsyncStorage.setItem(WEIGHTS_KEY, JSON.stringify(list));
}

// ---------- custom goals ----------

export type Goal = {
  id: string;
  emoji: string;
  title: string;
  current: number;
  target: number;
  unit: string;
  doneAt?: number; // epoch ms when first reached
};
const GOALS_KEY = 'goals';

export async function loadGoals(): Promise<Goal[]> {
  const raw = await AsyncStorage.getItem(GOALS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveGoals(list: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(list));
}

/** Days in a row (ending today, or yesterday if today has nothing yet) with a workout or the step goal met. */
export async function loadStreak(stepGoal: number): Promise<number> {
  const dates = Array.from({ length: 120 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const days = await loadDays(dates);
  const active = (d: DayLog) => d.entries.length > 0 || (stepGoal > 0 && d.steps >= stepGoal) || !!d.rest;
  let i = active(days[dates[0]]) ? 0 : 1;
  let streak = 0;
  while (i < dates.length && active(days[dates[i]])) {
    streak++;
    i++;
  }
  return streak;
}

// ---------- recently used exercises ----------

const RECENT_KEY = 'recent_exercises';

export async function loadRecent(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(RECENT_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function pushRecent(exerciseId: string): Promise<void> {
  const list = [exerciseId, ...(await loadRecent()).filter((id) => id !== exerciseId)].slice(0, 8);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/** Most recent logged entry for an exercise (looking back up to 90 days), with its date. */
export async function loadLastEntry(exerciseId: string): Promise<{ date: string; entry: LogEntry } | null> {
  const dates = Array.from({ length: 90 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const days = await loadDays(dates);
  for (const date of dates) {
    const entries = days[date].entries.filter((e) => e.exerciseId === exerciseId);
    if (entries.length) return { date, entry: entries[entries.length - 1] };
  }
  return null;
}

// ---------- exercise history & personal records ----------

export type HistoryItem = { date: string; entry: LogEntry };

/** Every logged entry for an exercise in the last `days` days, oldest first. */
export async function loadExerciseHistory(exerciseId: string, days = 365): Promise<HistoryItem[]> {
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const all = await loadDays(dates);
  const out: HistoryItem[] = [];
  for (const date of [...dates].reverse()) {
    for (const entry of all[date].entries) if (entry.exerciseId === exerciseId) out.push({ date, entry });
  }
  return out;
}

/** Heaviest weight lifted in an entry (kg), or 0 for bodyweight/cardio. */
export const topWeight = (e: LogEntry) => (e.setList?.length ? Math.max(...e.setList.map((s) => s.weightKg)) : (e.weightKg ?? 0));

/** Best estimated one-rep max in an entry (Epley: w × (1 + reps/30)). */
export const bestE1rm = (e: LogEntry) => {
  const sets = e.setList?.length ? e.setList : e.sets && e.weightKg ? [{ weightKg: e.weightKg, reps: e.reps ?? 1 }] : [];
  return sets.reduce((m, s) => Math.max(m, s.weightKg * (1 + Math.min(s.reps, 12) / 30)), 0);
};

/** Most reps done in a single set with no external weight (push-ups, pull-ups…). */
export const bestBodyweightReps = (e: LogEntry) =>
  e.setList?.length ? e.setList.filter((s) => s.weightKg === 0).reduce((m, s) => Math.max(m, s.reps), 0) : 0;
