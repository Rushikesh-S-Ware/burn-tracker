import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../alert';
import { Pedometer } from 'expo-sensors';
import { bmr, fromKg, Profile, stepsToKm, Units, walkingKcal } from '../calc';
import { LinearGradient } from 'expo-linear-gradient';
import { DayLog, dateKey, loadDay, loadStreak, LogEntry, saveDay } from '../storage';
import { themed, useC } from '../theme';
import { AnimatedNumber, BRAND_GRADIENT, Button, Card, FadeIn, Field, fmt, haptic, num, ProgressRing, Tap, Title, toast } from '../ui';
import EditEntryModal from './EditEntryModal';

type Props = {
  profile: Profile;
  date: string;
  setDate: (d: string) => void;
  day: DayLog;
  updateDay: (fn: (d: DayLog) => DayLog) => void;
  onAddExercise: () => void;
  workoutName?: string; // exercise in progress on the Log tab
};

function entryDetail(e: LogEntry, u: Units): string {
  const w = (kg: number) => +fromKg(kg, u).toFixed(1);
  if (e.setList?.length) {
    const reps = e.setList.map((s) => s.reps).join('/');
    const weights = e.setList.map((s) => w(s.weightKg)).filter((x) => x > 0);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const wt = weights.length === 0 ? '' : min === max ? ` @ ${max} ${u}` : ` @ ${min}–${max} ${u}`;
    return `${e.setList.length} sets · ${reps} reps${wt}`;
  }
  if (e.sets) return `${e.sets} × ${e.reps}${e.weightKg ? ` @ ${w(e.weightKg)} ${u}` : ''}`;
  return `${e.minutes} min`;
}

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

function prettyDate(date: string) {
  const today = dateKey(new Date());
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function TodayScreen({ profile, date, setDate, day, updateDay, onAddExercise, workoutName }: Props) {
  const st = useSt();
  const C = useC();
  const isToday = date === dateKey(new Date());
  const [trackingOn, setTracking] = useState(false);
  const tracking = trackingOn && isToday; // live counting only applies to today
  const baseSteps = useRef(0);
  const [streak, setStreak] = useState(0);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [yesterday, setYesterday] = useState<{ date: string; log: DayLog } | null>(null);
  const [ySteps, setYSteps] = useState('');

  // "Forgot yesterday's steps?" — only on today, only if yesterday has no steps logged.
  useEffect(() => {
    if (!isToday) return;
    const yd = shiftDate(date, -1);
    loadDay(yd).then((log) => setYesterday(log.steps === 0 && !log.rest ? { date: yd, log } : null));
  }, [date, isToday]);

  // Live step counting while the app is open (Android can't read past step history).
  useEffect(() => {
    if (!tracking) return;
    baseSteps.current = day.steps;
    const sub = Pedometer.watchStepCount((r) => {
      updateDay((d) => ({ ...d, steps: baseSteps.current + r.steps }));
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking]);

  const stepGoalMet = day.steps >= profile.stepGoal;
  useEffect(() => {
    loadStreak(profile.stepGoal).then(setStreak);
  }, [profile.stepGoal, day.entries.length, stepGoalMet, day.rest]);

  async function toggleTracking() {
    if (tracking) return setTracking(false);
    const available = await Pedometer.isAvailableAsync().catch(() => false);
    if (!available) {
      return Alert.alert('Step sensor not available', 'Your phone has no step sensor. Type your steps in instead.');
    }
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permission needed', 'Allow "Physical activity" permission to count steps.');
    }
    setTracking(true);
  }

  const rest = bmr(profile);
  const workout = day.entries.reduce((sum, e) => sum + e.kcal, 0);
  const walk = walkingKcal(day.steps, profile);
  const total = rest + workout + walk;
  const active = workout + walk;
  const net = day.foodKcal - total;
  const stepPct = profile.stepGoal > 0 ? day.steps / profile.stepGoal : 0;
  const activePct = profile.activeGoal > 0 ? active / profile.activeGoal : 0;

  // Celebrate (once per day) when a daily goal is reached.
  const celebrated = useRef({ steps: stepPct >= 1, active: activePct >= 1, date });
  useEffect(() => {
    const c = celebrated.current;
    if (c.date !== date) {
      celebrated.current = { steps: stepPct >= 1, active: activePct >= 1, date };
      return;
    }
    if (stepPct >= 1 && !c.steps) {
      c.steps = true;
      haptic.success();
      toast('🎉 Step goal reached!');
    }
    if (activePct >= 1 && !c.active) {
      c.active = true;
      haptic.success();
      toast('🔥 Active calorie goal crushed!');
    }
  }, [stepPct, activePct, date]);

  function removeEntry(id: string, name: string) {
    const index = day.entries.findIndex((e) => e.id === id);
    const removed = day.entries[index];
    if (!removed) return;
    updateDay((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
    haptic.tap();
    toast(`Deleted ${name}`, {
      action: 'Undo',
      onAction: () =>
        updateDay((d) => {
          const entries = [...d.entries];
          entries.splice(Math.min(index, entries.length), 0, removed);
          return { ...d, entries };
        }),
    });
  }

  function saveEdit(next: LogEntry) {
    updateDay((d) => ({ ...d, entries: d.entries.map((e) => (e.id === next.id ? next : e)) }));
    setEditing(null);
    haptic.success();
    toast(`✓ ${next.name} updated`);
  }

  function toggleRest() {
    const nowRest = !day.rest;
    updateDay((d) => ({ ...d, rest: nowRest || undefined }));
    haptic.tap();
    if (nowRest) toast('😴 Rest day — streak stays alive');
  }

  async function saveYesterdaySteps() {
    if (!yesterday) return;
    const steps = Math.min(200000, Math.round(num(ySteps)));
    if (steps <= 0) return;
    await saveDay(yesterday.date, { ...yesterday.log, steps });
    setYesterday(null);
    haptic.success();
    toast(`✓ Saved ${fmt(steps)} steps for yesterday`);
    loadStreak(profile.stepGoal).then(setStreak);
  }

  const u = profile.units;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={st.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.hello}>
            {greeting()}
            {profile.name ? `, ${profile.name}` : ''} 👋
          </Text>
          <View style={st.dateRow}>
            <Pressable onPress={() => setDate(shiftDate(date, -1))} hitSlop={12}>
              <Text style={st.arrow}>‹</Text>
            </Pressable>
            <Text style={st.date}>{prettyDate(date)}</Text>
            <Pressable onPress={() => !isToday && setDate(shiftDate(date, 1))} hitSlop={12}>
              <Text style={[st.arrow, isToday && { opacity: 0.2 }]}>›</Text>
            </Pressable>
          </View>
        </View>
        {streak > 0 && (
          <View style={st.streak}>
            <Text style={st.streakNum}>🔥 {streak}</Text>
            <Text style={st.streakLabel}>day streak</Text>
          </View>
        )}
      </View>

      {workoutName && (
        <Tap onPress={onAddExercise}>
          <Card style={{ backgroundColor: C.dark ? C.primarySoft : C.text }}>
            <Text style={{ color: C.dark ? C.primary : '#fff', fontWeight: '700' }}>⏱ {workoutName} in progress — tap to continue</Text>
          </Card>
        </Tap>
      )}

      <FadeIn>
        <LinearGradient colors={[...BRAND_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
          <Text style={st.bigLabel}>Total calories burned</Text>
          <AnimatedNumber value={total} suffix=" kcal" style={st.big} />
          <View style={st.breakdown}>
            <Stat label="Resting" value={rest} />
            <Stat label="Workout" value={workout} />
            <Stat label="Walking" value={walk} />
          </View>
        </LinearGradient>
      </FadeIn>

      {isToday && yesterday && (
        <FadeIn>
          <Card style={{ borderColor: C.primary, borderWidth: 1 }}>
            <Title style={{ marginBottom: 4 }}>Forgot yesterday&apos;s steps?</Title>
            <Text style={st.hint}>Yesterday has no steps logged. Add them so your week stays accurate.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
              <Field label="Yesterday's steps" keyboardType="number-pad" value={ySteps} onChangeText={setYSteps} placeholder="e.g. 7500" />
              <View style={{ width: 96 }}>
                <Button title="Save" onPress={saveYesterdaySteps} disabled={num(ySteps) <= 0} />
              </View>
            </View>
            <Pressable onPress={() => setYesterday(null)} style={{ alignSelf: 'center', marginTop: 10 }}>
              <Text style={{ color: C.sub, fontSize: 13 }}>Skip</Text>
            </Pressable>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={80}>
        <Card>
          <View style={st.rings}>
            <View style={st.ringBox}>
              <ProgressRing pct={stepPct} color={C.blue}>
                <Text style={st.ringVal}>{stepPct >= 1 ? '✓' : `${Math.round(stepPct * 100)}%`}</Text>
              </ProgressRing>
              <Text style={st.ringLabel}>Steps</Text>
              <Text style={st.ringSub}>
                {fmt(day.steps)} / {fmt(profile.stepGoal)}
              </Text>
            </View>
            <View style={st.ringBox}>
              <ProgressRing pct={activePct} color={C.primary}>
                <Text style={st.ringVal}>{activePct >= 1 ? '✓' : `${Math.round(activePct * 100)}%`}</Text>
              </ProgressRing>
              <Text style={st.ringLabel}>Active kcal</Text>
              <Text style={st.ringSub}>
                {fmt(active)} / {fmt(profile.activeGoal)}
              </Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={160}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title style={{ marginBottom: 0 }}>Workout ({fmt(workout)} kcal)</Title>
            {day.entries.length === 0 && (
              <Tap onPress={toggleRest} style={[st.restChip, day.rest && { backgroundColor: C.primarySoft }]}>
                <Text style={[st.restChipText, day.rest && { color: C.primary }]}>{day.rest ? '😴 Rest day ✓' : '😴 Rest day?'}</Text>
              </Tap>
            )}
          </View>
          {day.entries.length === 0 ? (
            <Text style={[st.empty, { marginTop: 10 }]}>
              {day.rest ? 'Planned rest — recovery is part of training. 💤' : 'No exercises yet — let\u2019s get moving! 💪'}
            </Text>
          ) : (
            <>
              <View style={{ height: 6 }} />
              {day.entries.map((e) => (
                <Pressable key={e.id} onPress={() => setEditing(e)} onLongPress={() => removeEntry(e.id, e.name)} style={st.entry}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.entryName}>{e.name}</Text>
                    <Text style={st.entryDetail}>{entryDetail(e, u)}</Text>
                  </View>
                  <Text style={st.entryKcal}>{fmt(e.kcal)} kcal</Text>
                  <Pressable onPress={() => removeEntry(e.id, e.name)} hitSlop={10}>
                    <Text style={st.x}>✕</Text>
                  </Pressable>
                </Pressable>
              ))}
              <Text style={st.hint}>Tap an exercise to edit it · ✕ deletes (with undo)</Text>
            </>
          )}
          <View style={{ marginTop: 10 }}>
            <Button title="+ Add exercise" kind="ghost" onPress={onAddExercise} />
          </View>
        </Card>
      </FadeIn>

      <Card>
        <Title>Walking</Title>
        <Text style={st.walkLine}>
          {fmt(day.steps)} steps · {stepsToKm(day.steps, profile).toFixed(2)} km · {fmt(walk)} kcal
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <Field
            label="Total steps today"
            keyboardType="number-pad"
            value={day.steps ? String(day.steps) : ''}
            onChangeText={(t) => updateDay((d) => ({ ...d, steps: Math.min(200000, Math.round(num(t))) }))}
            placeholder="e.g. 8000"
            editable={!tracking}
          />
        </View>
        <Text style={st.hint}>Tip: copy the step count from your phone&apos;s health app at the end of the day.</Text>
        {isToday && (
          <View style={{ marginTop: 10 }}>
            <Button
              title={tracking ? '■ Stop counting steps' : '▶ Count steps live (app open)'}
              kind={tracking ? 'danger' : 'ghost'}
              onPress={toggleTracking}
            />
          </View>
        )}
      </Card>

      <Card>
        <Title>Food (optional)</Title>
        <Field
          label="Calories eaten"
          suffix="kcal"
          keyboardType="number-pad"
          value={day.foodKcal ? String(day.foodKcal) : ''}
          onChangeText={(t) => updateDay((d) => ({ ...d, foodKcal: Math.min(20000, Math.round(num(t))) }))}
          placeholder="e.g. 2200"
        />
        {day.foodKcal > 0 && (
          <Text style={[st.net, { color: net > 0 ? C.red : C.green }]}>
            {net > 0 ? `Surplus +${fmt(net)} kcal` : `Deficit ${fmt(net)} kcal`}
          </Text>
        )}
      </Card>

      <Text style={st.disclaimer}>
        Estimates only. Resting = Mifflin-St Jeor BMR. Workouts use MET values plus the work of lifting the weight.
      </Text>
      <EditEntryModal entry={editing} profile={profile} onSave={saveEdit} onClose={() => setEditing(null)} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const st = useSt();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <AnimatedNumber value={value} style={st.statVal} />
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    hello: { fontSize: 22, fontWeight: '800', color: C.text },
    dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    arrow: { fontSize: 26, color: C.primary, paddingHorizontal: 6, lineHeight: 28 },
    date: { fontSize: 15, fontWeight: '600', color: C.sub, minWidth: 90, textAlign: 'center' },
    streak: { backgroundColor: C.primarySoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
    streakNum: { fontSize: 18, fontWeight: '800', color: C.primary },
    streakLabel: { fontSize: 11, color: C.primary, fontWeight: '600' },
    hero: { borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#E5484D', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    restChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: C.chip },
    restChipText: { fontSize: 12, fontWeight: '700', color: C.sub },
    bigLabel: { color: '#FFE3D6', fontSize: 14, fontWeight: '600' },
    big: { color: '#fff', fontSize: 40, fontWeight: '800', marginVertical: 4 },
    breakdown: { flexDirection: 'row', marginTop: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 10 },
    statVal: { color: '#fff', fontSize: 18, fontWeight: '700' },
    statLabel: { color: '#FFE3D6', fontSize: 12 },
    rings: { flexDirection: 'row', justifyContent: 'space-around' },
    ringBox: { alignItems: 'center' },
    ringVal: { fontSize: 20, fontWeight: '800', color: C.text },
    ringLabel: { marginTop: 8, fontWeight: '700', color: C.text },
    ringSub: { color: C.sub, fontSize: 12, marginTop: 2 },
    empty: { color: C.sub },
    entry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
    entryName: { fontSize: 16, fontWeight: '600', color: C.text },
    entryDetail: { color: C.sub, marginTop: 2 },
    entryKcal: { fontWeight: '700', color: C.primary, marginHorizontal: 10 },
    x: { color: C.sub, fontSize: 16 },
    walkLine: { fontSize: 16, color: C.text, fontWeight: '600' },
    hint: { color: C.sub, fontSize: 12, marginTop: 6 },
    net: { marginTop: 10, fontSize: 16, fontWeight: '700' },
    disclaimer: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 4 },
  }),
);
