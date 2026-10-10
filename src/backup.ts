// Backup / restore / CSV export. Files are written to the app's cache folder and handed to the
// Android share sheet, so the user picks where they go (Google Drive, email, etc.). Nothing is
// uploaded by the app itself.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { fromKg, Profile, Units } from './calc';
import { findExercise, groupInfo, groupOf } from './exercises';
import { dateKey, DayLog, loadProfile } from './storage';

const BACKUP_VERSION = 1;
const APP = 'burn-tracker';

type Backup = {
  app: typeof APP;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>; // every AsyncStorage key → parsed value
};

async function readAll(): Promise<Record<string, unknown>> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of pairs) {
    if (v === null || k === 'session') continue; // don't carry a half-finished workout across devices
    try {
      out[k] = JSON.parse(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

async function shareText(filename: string, content: string, mimeType: string) {
  if (Platform.OS === 'web') {
    // Browser: trigger a normal file download.
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json' });
}

/** Everything the app stores, as one JSON file. Returns the number of logged days included. */
export async function exportBackup(): Promise<number> {
  const data = await readAll();
  const backup: Backup = { app: APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  await shareText(`burn-tracker-backup-${dateKey(new Date())}.json`, JSON.stringify(backup, null, 2), 'application/json');
  return Object.keys(data).filter((k) => k.startsWith('day:')).length;
}

/** Pick a backup file and restore it. Returns the number of logged days restored, or null if cancelled. */
export async function importBackup(): Promise<number | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  let parsed: Backup;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid backup.');
  }
  if (parsed?.app !== APP || typeof parsed.data !== 'object') throw new Error('That file is not a Burn Tracker backup.');
  if (parsed.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Please update first.');
  const pairs: [string, string][] = Object.entries(parsed.data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
  await AsyncStorage.multiSet(pairs);
  return pairs.filter(([k]) => k.startsWith('day:')).length;
}

// ---------- CSV ----------

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per set (strength) or per entry (cardio), plus a daily summary file. Returns row count. */
export async function exportCsv(): Promise<number> {
  const data = await readAll();
  const profile: Profile | null = await loadProfile();
  const u: Units = profile?.units ?? 'kg';
  const w = (kg: number) => +fromKg(kg, u).toFixed(2);

  const rows: string[] = [['date', 'exercise', 'body_part', 'set', `weight_${u}`, 'reps', 'rest_sec', 'minutes', 'kcal'].join(',')];
  const summary: string[] = [['date', 'steps', 'workout_kcal', 'food_kcal', 'exercises'].join(',')];

  const dayKeys = Object.keys(data)
    .filter((k) => k.startsWith('day:'))
    .sort();
  for (const k of dayKeys) {
    const date = k.slice(4);
    const day = data[k] as DayLog;
    const workoutKcal = day.entries.reduce((s, e) => s + e.kcal, 0);
    summary.push([date, day.steps, workoutKcal, day.foodKcal ?? 0, day.entries.length].map(csvCell).join(','));
    for (const e of day.entries) {
      const name = findExercise(e.exerciseId)?.name ?? e.name;
      const part = groupInfo(groupOf(e.exerciseId)).name;
      if (e.setList?.length) {
        e.setList.forEach((s, i) => {
          // calories are per exercise, so put them on the first set only
          rows.push([date, name, part, i + 1, w(s.weightKg), s.reps, s.restSec ?? '', '', i === 0 ? e.kcal : ''].map(csvCell).join(','));
        });
      } else if (e.sets) {
        rows.push([date, name, part, `1-${e.sets}`, e.weightKg ? w(e.weightKg) : '', e.reps ?? '', '', '', e.kcal].map(csvCell).join(','));
      } else {
        rows.push([date, name, part, '', '', '', '', e.minutes ?? '', e.kcal].map(csvCell).join(','));
      }
    }
  }

  const weights = (data['weights'] as { date: string; kg: number }[] | undefined) ?? [];
  const weightRows = [['date', `weight_${u}`].join(','), ...weights.map((x) => `${x.date},${w(x.kg)}`)];

  const content = [
    '# Burn Tracker export — workouts',
    ...rows,
    '',
    '# Daily summary',
    ...summary,
    '',
    '# Body weight',
    ...weightRows,
  ].join('\n');
  await shareText(`burn-tracker-${dateKey(new Date())}.csv`, content, 'text/csv');
  return rows.length - 1;
}
