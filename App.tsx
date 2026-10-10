import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { DEFAULT_PROFILE, Profile } from './src/calc';
import { DayLog, dateKey, loadDay, loadProfile, LogEntry, saveDay, saveProfile } from './src/storage';
import { findExercise, loadCustomExercises } from './src/exercises';
import { themed, ThemeProvider, useC } from './src/theme';
import { PageGlow, Tap, ToastHost } from './src/ui';
import { handleNotificationAction, loadSession, Session, setupNotifications, subscribe } from './src/workout';
import { registerWorkoutTask } from './src/workoutTask';
import TodayScreen from './src/screens/TodayScreen';
import LogScreen from './src/screens/LogScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ProfileScreen from './src/screens/ProfileScreen';

type Tab = 'today' | 'log' | 'progress' | 'history' | 'profile';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'today', icon: '🔥', label: 'Today' },
  { key: 'log', icon: '➕', label: 'Log' },
  { key: 'progress', icon: '🎯', label: 'Progress' },
  { key: 'history', icon: '📊', label: 'History' },
  { key: 'profile', icon: '👤', label: 'Profile' },
];

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Main />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function Main() {
  const st = useSt();
  const C = useC();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(dateKey(new Date()));
  const [day, setDay] = useState<DayLog>({ entries: [], steps: 0, foodKcal: 0 });
  const [session, setSessionState] = useState<Session | null>(null);

  useEffect(() => {
    Promise.all([loadProfile(), loadSession(), loadCustomExercises()]).then(([p, s]) => {
      setProfile(p);
      setSessionState(s);
      if (s) setTab('log'); // resume a workout in progress
      setReady(true);
    });
    setupNotifications().catch(() => {});
    registerWorkoutTask();
    const unsub = subscribe(setSessionState);
    // Lock-screen button taps while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      if (resp.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) setTab('log');
      else handleNotificationAction(resp);
    });
    // Coming back from the lock screen: pick up changes made by the background task.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadSession().then(setSessionState);
    });
    return () => {
      unsub();
      sub.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    loadDay(date).then(setDay);
  }, [date]);

  const updateDay = useCallback(
    (fn: (d: DayLog) => DayLog) => {
      setDay((prev) => {
        const next = fn(prev);
        saveDay(date, next);
        return next;
      });
    },
    [date],
  );

  function handleSaveProfile(p: Profile) {
    setProfile(p);
    saveProfile(p);
  }

  function handleAddEntry(entry: LogEntry) {
    updateDay((d) => ({ ...d, entries: [...d.entries, entry] }));
    setTab('today');
  }

  if (!ready) {
    return (
      <View style={[st.fill, { justifyContent: 'center' }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={C.dark ? 'light' : 'dark'} />
      <SafeAreaView style={st.fill} edges={['top', 'bottom']}>
        <PageGlow />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {!profile ? (
            <ProfileScreen profile={DEFAULT_PROFILE} onSave={handleSaveProfile} firstRun />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                {tab === 'today' && (
                  <TodayScreen
                    profile={profile}
                    date={date}
                    setDate={setDate}
                    day={day}
                    updateDay={updateDay}
                    onAddExercise={() => setTab('log')}
                    workoutName={session ? findExercise(session.exerciseId)?.name : undefined}
                  />
                )}
                {tab === 'log' && <LogScreen profile={profile} session={session} date={date} onSave={handleAddEntry} />}
                {tab === 'progress' && <ProgressScreen profile={profile} onProfileChange={handleSaveProfile} />}
                {tab === 'history' && (
                  <HistoryScreen
                    profile={profile}
                    onOpenDay={(d) => {
                      setDate(d);
                      setTab('today');
                    }}
                  />
                )}
                {tab === 'profile' && (
                  <ProfileScreen
                    key={JSON.stringify(profile)}
                    profile={profile}
                    onSave={handleSaveProfile}
                    onRestored={() => {
                      // Reload everything from storage after a restore.
                      Promise.all([loadProfile(), loadDay(date), loadCustomExercises()]).then(([p, d]) => {
                        setProfile(p);
                        setDay(d);
                        setTab('today');
                      });
                    }}
                  />
                )}
              </View>
              <View style={st.tabBar}>
                {TABS.map((t) => {
                  const active = tab === t.key;
                  return (
                    <Tap key={t.key} style={st.tab} scaleTo={0.85} onPress={() => setTab(t.key)}>
                      <View style={[st.tabPill, active && { backgroundColor: C.primarySoft }]}>
                        <Text style={[st.tabIcon, !active && { opacity: 0.45 }]}>{t.key === 'log' && session ? '⏱' : t.icon}</Text>
                      </View>
                      <Text style={[st.tabLabel, active && { color: C.primary }]}>{t.label}</Text>
                    </Tap>
                  );
                })}
              </View>
            </>
          )}
        </KeyboardAvoidingView>
        <ToastHost />
      </SafeAreaView>
    </>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: C.bg },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderTopWidth: 1,
      borderTopColor: C.line,
      paddingVertical: 6,
    },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
    tabPill: { paddingHorizontal: 14, paddingVertical: 3, borderRadius: 14 },
    tabIcon: { fontSize: 19 },
    tabLabel: { fontSize: 11, color: C.sub, marginTop: 2, fontWeight: '600' },
  }),
);
