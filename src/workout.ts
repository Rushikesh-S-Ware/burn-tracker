// The workout in progress (one strength exercise, set by set) + its rest timer.
//
// The session is stored on the device so it survives the screen locking or the app being closed.
// While a session is active we show a lock-screen notification with buttons
// ("Set done – rest", "Next set", "+30s") and schedule an alarm for when rest is over.
// Button taps are handled either by the running app or, on Android, by a background task.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { findExercise, loadCustomExercises } from './exercises';
import { loadProfile } from './storage';
import { DEFAULT_PROFILE } from './calc';

export type Row = { weight: string; reps: string; rest: string }; // rest = seconds AFTER this set

export type Session = {
  exerciseId: string;
  rows: Row[];
  restStartedAt: number | null; // epoch ms, resting after the last row
  restTargetSec: number;
  lastActionKey?: string; // de-duplicates a lock-screen tap handled twice
};

const KEY = 'session';
const STATUS_ID = 'workout_status';
const ALARM_ID = 'rest_alarm';
const CAT_LIFTING = 'workout_lifting';
const CAT_RESTING = 'workout_resting';
export const ACTION_REST = 'rest';
export const ACTION_NEXT = 'next';
export const ACTION_PLUS = 'plus30';

// ---------- pure session updates ----------

export function newSession(exerciseId: string, restTargetSec: number): Session {
  return { exerciseId, rows: [{ weight: '', reps: '10', rest: '' }], restStartedAt: null, restTargetSec };
}

export const restElapsedSec = (s: Session, now = Date.now()) =>
  s.restStartedAt ? Math.max(0, Math.round((now - s.restStartedAt) / 1000)) : 0;

export function startRest(s: Session, defaultRest: number): Session {
  if (s.restStartedAt) return s;
  return { ...s, restStartedAt: Date.now(), restTargetSec: defaultRest };
}

/** Stop the timer and write the measured rest into the last set. */
export function stopRest(s: Session): Session {
  if (!s.restStartedAt) return s;
  const rows = [...s.rows];
  const last = rows[rows.length - 1];
  rows[rows.length - 1] = { ...last, rest: String(restElapsedSec(s)) };
  return { ...s, rows, restStartedAt: null };
}

/** Rest is over: record it and add the next set (pre-filled with the previous set's numbers). */
export function nextSet(s: Session): Session {
  const stopped = stopRest(s);
  const last = stopped.rows[stopped.rows.length - 1];
  return { ...stopped, rows: [...stopped.rows, { weight: last.weight, reps: last.reps, rest: '' }] };
}

export function addRestTime(s: Session, sec: number): Session {
  return { ...s, restTargetSec: Math.max(0, s.restTargetSec + sec) };
}

// ---------- storage + change listeners ----------

let current: Session | null = null;
let loaded = false;
const listeners = new Set<(s: Session | null) => void>();

export function subscribe(fn: (s: Session | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEY);
  current = raw ? JSON.parse(raw) : null;
  loaded = true;
  return current;
}

export async function setSession(s: Session | null) {
  current = s;
  loaded = true;
  listeners.forEach((fn) => fn(s));
  if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(KEY);
  await syncNotifications(s);
}

/** Apply an update to the latest stored session. */
export async function updateSession(fn: (s: Session) => Session) {
  const s = loaded ? current : await loadSession();
  if (s) await setSession(fn(s));
}

// ---------- notifications ----------

let setupDone = false;

export async function setupNotifications() {
  if (setupDone) return;
  setupDone = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const isAlarm = n.request.identifier === ALARM_ID;
      return { shouldShowBanner: isAlarm, shouldShowList: true, shouldPlaySound: isAlarm, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('workout', {
      name: 'Workout in progress',
      importance: Notifications.AndroidImportance.LOW, // silent, but visible on the lock screen
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync('rest_alarm', {
      name: 'Rest finished alarm',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
    });
  }
  const bg = { opensAppToForeground: false };
  await Notifications.setNotificationCategoryAsync(CAT_LIFTING, [
    { identifier: ACTION_REST, buttonTitle: '✓ Set done – rest', options: bg },
  ]);
  await Notifications.setNotificationCategoryAsync(CAT_RESTING, [
    { identifier: ACTION_NEXT, buttonTitle: '▶ Next set', options: bg },
    { identifier: ACTION_PLUS, buttonTitle: '+30s', options: bg },
  ]);
}

export async function askNotificationPermission() {
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) await Notifications.requestPermissionsAsync();
}

let lastSignature = '';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`;

async function syncNotifications(s: Session | null) {
  // Only touch notifications when something they show changed (not on every keystroke).
  const sig = s ? `${s.exerciseId}|${s.rows.length}|${s.restStartedAt}|${s.restTargetSec}` : '';
  if (sig === lastSignature) return;
  lastSignature = sig;
  try {
    await Notifications.cancelScheduledNotificationAsync(ALARM_ID);
    await Notifications.dismissNotificationAsync(ALARM_ID);
    if (!s) {
      await Notifications.dismissNotificationAsync(STATUS_ID);
      return;
    }
    await setupNotifications();
    const name = findExercise(s.exerciseId)?.name ?? 'Workout';
    const setNo = s.rows.length;
    if (s.restStartedAt) {
      const endsAt = s.restStartedAt + s.restTargetSec * 1000;
      await Notifications.scheduleNotificationAsync({
        identifier: STATUS_ID,
        content: {
          title: `${name} · resting after set ${setNo}`,
          body: `Next set at ${clock(endsAt)} (${mmss(s.restTargetSec)} rest)`,
          categoryIdentifier: CAT_RESTING,
          sticky: true,
          autoDismiss: false,
        },
        trigger: Platform.OS === 'android' ? { channelId: 'workout' } : null,
      });
      if (endsAt > Date.now() + 1000) {
        await Notifications.scheduleNotificationAsync({
          identifier: ALARM_ID,
          content: {
            title: `Rest over! Set ${setNo + 1} of ${name} 💪`,
            body: 'Tap "Next set" when you start.',
            categoryIdentifier: CAT_RESTING,
            sound: 'default',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: 'rest_alarm' },
        });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: STATUS_ID,
        content: {
          title: `${name} · set ${setNo}`,
          body: 'Finish your set, then tap "Set done – rest".',
          categoryIdentifier: CAT_LIFTING,
          sticky: true,
          autoDismiss: false,
        },
        trigger: Platform.OS === 'android' ? { channelId: 'workout' } : null,
      });
    }
  } catch (e) {
    // Notifications are a convenience; the in-app timer works without them.
    console.warn('notification sync failed', e);
  }
}

/** Handle a lock-screen button tap (from the running app or the background task). */
export async function handleNotificationAction(resp: Notifications.NotificationResponse) {
  const action = resp.actionIdentifier;
  if (![ACTION_REST, ACTION_NEXT, ACTION_PLUS].includes(action)) return;
  const key = `${resp.notification.request.identifier}|${resp.notification.date}|${action}`;
  const profile = (await loadProfile()) ?? DEFAULT_PROFILE;
  await loadCustomExercises(); // so the notification can name a user-added exercise
  const s = await loadSession();
  if (!s || s.lastActionKey === key) return;
  let next = s;
  if (action === ACTION_REST) next = startRest(s, profile.restSeconds);
  if (action === ACTION_NEXT) next = nextSet(s);
  if (action === ACTION_PLUS) next = s.restStartedAt ? addRestTime(s, 30) : s;
  await setSession({ ...next, lastActionKey: key });
}
