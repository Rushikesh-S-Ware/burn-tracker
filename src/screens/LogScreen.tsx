import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { cardioKcal, fromKg, Profile, SetRec, setsKcal, setsMinutes, toKg, Units } from '../calc';
import { Exercise, findExercise } from '../exercises';
import ExercisePicker from './ExercisePicker';
import { bestBodyweightReps, bestE1rm, HistoryItem, loadExerciseHistory, LogEntry, pushRecent, topWeight } from '../storage';
import { LineChart } from '../charts';
import { Button, Card, Chip, Field, fmt, haptic, num, Tap, Title, toast } from '../ui';
import { themed, useC } from '../theme';
import {
  addRestTime,
  askNotificationPermission,
  mmss,
  newSession,
  nextSet,
  restElapsedSec,
  Row,
  Session,
  setSession,
  startRest,
  stopRest,
} from '../workout';

type Props = {
  profile: Profile;
  session: Session | null;
  date: string; // day the exercise will be saved to (normally today)
  onSave: (entry: LogEntry) => void;
};

function prettyDay(date: string) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date === todayKey) return null;
  const d = new Date(date + 'T00:00');
  const diff = Math.round((new Date(todayKey + 'T00:00').getTime() - d.getTime()) / 86400000);
  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return diff === 1 ? `Yesterday (${label})` : label;
}

function makeEntry(ex: Exercise, fields: Pick<LogEntry, 'setList' | 'minutes' | 'kcal'>): LogEntry {
  const time = Date.now();
  return { id: `${time}-${Math.random().toString(36).slice(2, 7)}`, exerciseId: ex.id, name: ex.name, time, ...fields };
}

export default function LogScreen({ profile, session, date, onSave }: Props) {
  const st = useSt();
  const [cardio, setCardio] = useState<Exercise | null>(null);
  const past = prettyDay(date);
  const banner = past ? (
    <View style={st.dateBanner}>
      <Text style={st.dateBannerText}>📅 Logging to {past} — go to Today and tap › to return to today</Text>
    </View>
  ) : null;

  if (session)
    return (
      <View style={{ flex: 1 }}>
        {banner}
        <StrengthForm profile={profile} session={session} onSave={onSave} />
      </View>
    );
  if (cardio)
    return (
      <View style={{ flex: 1 }}>
        {banner}
        <CardioForm ex={cardio} profile={profile} onBack={() => setCardio(null)} onSave={onSave} />
      </View>
    );

  function pick(e: Exercise) {
    pushRecent(e.id);
    if (e.kind === 'cardio') return setCardio(e);
    askNotificationPermission().catch(() => {});
    setSession(newSession(e.id, profile.restSeconds));
  }

  return (
    <View style={{ flex: 1 }}>
      {banner}
      <ExercisePicker onPick={pick} />
    </View>
  );
}

/** "Last time: 60 kg × 10/10/8 (Tue)" plus your PR and a button for the progress chart. */
function LastTime({ exerciseId, units, isStrength }: { exerciseId: string; units: Units; isStrength: boolean }) {
  const st = useSt();
  const C = useC();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [showChart, setShowChart] = useState(false);
  useEffect(() => {
    loadExerciseHistory(exerciseId).then(setHistory);
  }, [exerciseId]);
  if (!history) return <Text style={st.lastTime}> </Text>;
  if (history.length === 0) return <Text style={[st.lastTime, { marginBottom: 12 }]}>First time logging this — go get it! 🚀</Text>;
  const { entry, date } = history[history.length - 1];
  const when = new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  let detail = '';
  if (entry.setList?.length) {
    const reps = entry.setList.map((x) => x.reps).join('/');
    const ws = entry.setList.map((x) => +fromKg(x.weightKg, units).toFixed(1)).filter((w) => w > 0);
    detail = `${ws.length ? `${Math.max(...ws)} ${units} × ` : ''}${reps}`;
  } else if (entry.sets) detail = `${entry.weightKg ? +fromKg(entry.weightKg, units).toFixed(1) + ' ' + units + ' × ' : ''}${entry.sets}×${entry.reps}`;
  else detail = `${entry.minutes} min`;
  const prKg = Math.max(...history.map((h) => topWeight(h.entry)));
  const prReps = Math.max(...history.map((h) => bestBodyweightReps(h.entry)));
  const pr = prKg > 0 ? `${+fromKg(prKg, units).toFixed(1)} ${units}` : prReps > 0 ? `${prReps} reps` : null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={st.lastTime}>
        ⏮ Last time ({when}): <Text style={{ fontWeight: '700' }}>{detail}</Text> · {entry.kcal} kcal
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        {pr && (
          <Text style={st.lastTime}>
            🏆 PR: <Text style={{ fontWeight: '700', color: C.primary }}>{pr}</Text>
          </Text>
        )}
        {isStrength && history.length >= 2 && (
          <Tap onPress={() => setShowChart(true)} style={st.chartBtn}>
            <Text style={st.chartBtnText}>📈 Progress</Text>
          </Tap>
        )}
      </View>
      {showChart && <ExerciseChart history={history} units={units} onClose={() => setShowChart(false)} />}
    </View>
  );
}

function ExerciseChart({ history, units, onClose }: { history: HistoryItem[]; units: Units; onClose: () => void }) {
  const st = useSt();
  const C = useC();
  const [mode, setMode] = useState<'weight' | 'e1rm' | 'volume'>('weight');
  const recent = history.slice(-20);
  const fmtW = (kg: number) => +fromKg(kg, units).toFixed(1);
  const volume = (e: LogEntry) => (e.setList ?? []).reduce((t, x) => t + x.weightKg * x.reps, 0);
  const points = recent.map((h) => ({
    label: h.date.slice(5),
    value: mode === 'weight' ? fmtW(topWeight(h.entry)) : mode === 'e1rm' ? fmtW(bestE1rm(h.entry)) : Math.round(fmtW(volume(h.entry))),
  }));
  const best = Math.max(...points.map((pt) => pt.value));
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const change = Math.round((last - first) * 10) / 10;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />
        <Text style={st.sheetTitle}>📈 {history[0].entry.name}</Text>
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Chip text="Top weight" active={mode === 'weight'} onPress={() => setMode('weight')} />
          <Chip text="Est. 1RM" active={mode === 'e1rm'} onPress={() => setMode('e1rm')} />
          <Chip text="Volume" active={mode === 'volume'} onPress={() => setMode('volume')} />
        </View>
        <LineChart points={points} color={C.primary} reference={best} referenceLabel="best" />
        <View style={{ flexDirection: 'row', marginTop: 12, marginBottom: 14 }}>
          <Big label={`Best (${units})`} value={String(best)} />
          <Big label="Sessions" value={String(history.length)} />
          <Big label="Change" value={`${change > 0 ? '+' : ''}${change}`} color={change > 0 ? C.green : change < 0 ? C.red : C.text} />
        </View>
        <Text style={st.hintSmall}>
          {mode === 'e1rm' ? 'Estimated one-rep max (Epley) from your best set each session.' : mode === 'volume' ? `Total weight × reps per session (${units}).` : 'Heaviest set each session.'}
        </Text>
        <Button title="Close" kind="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

function Big({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useC();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: color ?? C.text }}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

// ---------------- strength: set by set, with rest timer ----------------

function toSets(rows: Row[], profile: Profile): SetRec[] {
  return rows
    .map((r) => ({
      reps: Math.round(num(r.reps)),
      weightKg: toKg(num(r.weight), profile.units),
      restSec: r.rest.trim() === '' ? undefined : Math.round(num(r.rest)),
    }))
    .filter((s) => s.reps > 0);
}

function StrengthForm({ profile, session, onSave }: { profile: Profile; session: Session; onSave: (e: LogEntry) => void }) {
  const st = useSt();
  const ex = findExercise(session.exerciseId)!;
  const resting = session.restStartedAt !== null;

  const sets = toSets(session.rows, profile);
  const kcal = setsKcal(ex, profile, sets);
  const minutes = setsMinutes(sets, profile.restSeconds);
  const tooHeavy = sets.some((s) => s.weightKg > 600);
  const problem = sets.length === 0 ? 'Enter reps for at least one set' : tooHeavy ? 'Weight looks too high' : sets.some((s) => s.reps > 500) ? 'Reps look too high' : null;

  const update = (fn: (s: Session) => Session) => setSession(fn(session));
  const editRow = (i: number, patch: Partial<Row>) =>
    update((s) => ({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const removeRow = (i: number) => update((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }));
  const addRow = () =>
    update((s) => {
      const last = s.rows[s.rows.length - 1];
      return { ...s, rows: [...s.rows, { weight: last?.weight ?? '', reps: last?.reps ?? '10', rest: '' }] };
    });

  function save() {
    if (problem) return;
    const done = stopRest(session); // rest after the final set isn't counted
    const finalSets = toSets(done.rows, profile);
    const kcalSaved = Math.round(setsKcal(ex, profile, finalSets));
    const entry = makeEntry(ex, { setList: finalSets, kcal: kcalSaved });
    onSave(entry);
    setSession(null);
    haptic.success();
    // Personal record? Compare against every earlier session.
    loadExerciseHistory(ex.id).then((hist) => {
      const prev = hist.filter((h) => h.entry.id !== entry.id);
      const oldKg = Math.max(0, ...prev.map((h) => topWeight(h.entry)));
      const oldReps = Math.max(0, ...prev.map((h) => bestBodyweightReps(h.entry)));
      const newKg = topWeight(entry);
      const newReps = bestBodyweightReps(entry);
      if (prev.length > 0 && newKg > 0 && newKg > oldKg) {
        haptic.success();
        toast(`🏆 New PR! ${ex.name} ${+fromKg(newKg, profile.units).toFixed(1)} ${profile.units}`, { duration: 4000 });
      } else if (prev.length > 0 && newKg === 0 && newReps > oldReps) {
        haptic.success();
        toast(`🏆 New PR! ${ex.name} ${newReps} reps`, { duration: 4000 });
      } else {
        toast(`💪 ${ex.name} saved · +${kcalSaved} kcal`);
      }
    });
  }

  function discard() {
    const hasData = session.rows.some((r) => r.weight || r.rest) || session.rows.length > 1;
    if (!hasData) return setSession(null);
    Alert.alert('Discard this exercise?', 'The sets you entered will be lost.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setSession(null) },
    ]);
  }

  const u = profile.units;
  const lastIdx = session.rows.length - 1;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={discard} hitSlop={10}>
        <Text style={st.back}>‹ Choose another exercise</Text>
      </Pressable>

      <Card>
        <Title style={{ marginBottom: 2 }}>{ex.name}</Title>
        <LastTime exerciseId={ex.id} units={u} isStrength />
        <View style={st.headRow}>
          <Text style={[st.head, { width: 34 }]}>Set</Text>
          <Text style={[st.head, st.col]}>{ex.kind === 'strength' && ex.bodyFraction ? `+${u}` : u}</Text>
          <Text style={[st.head, st.col]}>Reps</Text>
          <Text style={[st.head, st.col]}>Rest (s)</Text>
          <View style={{ width: 24 }} />
        </View>
        {session.rows.map((r, i) => (
          <View key={i} style={st.setRow}>
            <Text style={st.setNo}>{i + 1}</Text>
            <SmallInput value={r.weight} onChangeText={(t) => editRow(i, { weight: t })} placeholder="0" />
            <SmallInput value={r.reps} onChangeText={(t) => editRow(i, { reps: t })} placeholder="0" numberPad />
            {i === lastIdx ? (
              <Text style={[st.col, st.restCell]}>{resting ? '⏱' : '—'}</Text>
            ) : (
              <SmallInput
                value={r.rest}
                onChangeText={(t) => editRow(i, { rest: t })}
                placeholder={String(profile.restSeconds)}
                numberPad
              />
            )}
            <Pressable onPress={() => removeRow(i)} hitSlop={8} disabled={session.rows.length === 1} style={{ width: 24 }}>
              <Text style={[st.x, session.rows.length === 1 && { opacity: 0 }]}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Pressable onPress={addRow} style={st.addSet} disabled={resting}>
          <Text style={[st.addSetText, resting && { opacity: 0.4 }]}>+ Add set</Text>
        </Pressable>
      </Card>

      <RestTimer session={session} profile={profile} update={update} />

      <Card>
        <View style={st.preview}>
          <Text style={st.previewLabel}>
            {sets.length} {sets.length === 1 ? 'set' : 'sets'} · {sets.reduce((t, s) => t + s.reps, 0)} reps · ~{Math.round(minutes)} min
          </Text>
          <Text style={st.previewVal}>{fmt(kcal)} kcal</Text>
        </View>
        {problem ? <Text style={st.problem}>{problem}</Text> : null}
        <Button title="✓ Finish & save exercise" onPress={save} disabled={!!problem} />
      </Card>
      <Text style={st.tip}>
        Tip: you can lock your phone between sets. Use the notification buttons on the lock screen — an alarm rings
        when rest is over.
      </Text>
    </ScrollView>
  );
}

function RestTimer({
  session,
  profile,
  update,
}: {
  session: Session;
  profile: Profile;
  update: (fn: (s: Session) => Session) => void;
}) {
  const st = useSt();
  const C = useC();
  const setNo = session.rows.length;
  const resting = session.restStartedAt !== null;
  const [now, setNow] = useState(() => Date.now());

  // Tick twice a second while the rest timer runs.
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [resting]);

  const elapsed = restElapsedSec(session, Math.max(now, session.restStartedAt ?? 0));
  const left = session.restTargetSec - elapsed;
  const over = left < 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (resting && left <= 0 && !buzzed.current) {
      buzzed.current = true;
      haptic.warn();
    }
    if (left > 0) buzzed.current = false;
  }, [left, resting]);

  if (!resting) {
    return (
      <Card>
        <Button title={`✓ Set ${setNo} done – start rest (${mmss(profile.restSeconds)})`} onPress={() => update((s) => startRest(s, profile.restSeconds))} />
        <Text style={st.timerHint}>The timer records how long you actually rest.</Text>
      </Card>
    );
  }
  const pct = session.restTargetSec > 0 ? Math.min(1, elapsed / session.restTargetSec) : 1;
  return (
    <Card style={{ alignItems: 'center' }}>
      <Text style={st.timerLabel}>{over ? 'Rest over — time to lift!' : `Resting after set ${setNo}`}</Text>
      <Text style={[st.timer, over && { color: C.red }]}>{over ? `+${mmss(-left)}` : mmss(left)}</Text>
      <View style={st.track}>
        <View style={[st.fill, { width: `${pct * 100}%` }, over && { backgroundColor: C.red }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
        <Chip text="−15s" active={false} onPress={() => update((s) => addRestTime(s, -15))} />
        <Chip text="+15s" active={false} onPress={() => update((s) => addRestTime(s, 15))} />
        <Chip text="+30s" active={false} onPress={() => update((s) => addRestTime(s, 30))} />
      </View>
      <View style={{ alignSelf: 'stretch' }}>
        <Button title={`▶ Start set ${setNo + 1}`} onPress={() => update(nextSet)} />
        <Pressable onPress={() => update(stopRest)} style={{ marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: C.sub }}>Stop timer (no more sets)</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function SmallInput({
  value,
  onChangeText,
  placeholder,
  numberPad,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  numberPad?: boolean;
}) {
  const st = useSt();
  const C = useC();
  return (
    <View style={st.col}>
      <TextInput
        style={st.small}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        keyboardType={numberPad ? 'number-pad' : 'decimal-pad'}
        selectTextOnFocus
      />
    </View>
  );
}

// ---------------- cardio: just minutes ----------------

function CardioForm({
  ex,
  profile,
  onBack,
  onSave,
}: {
  ex: Exercise;
  profile: Profile;
  onBack: () => void;
  onSave: (e: LogEntry) => void;
}) {
  const st = useSt();
  const [minutes, setMinutes] = useState('');
  const m = num(minutes);
  const problem = m > 0 && m <= 600 ? null : 'Duration must be 1–600 min';
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={st.back}>‹ Choose another exercise</Text>
      </Pressable>
      <Card>
        <Title style={{ marginBottom: 2 }}>{ex.name}</Title>
        <LastTime exerciseId={ex.id} units={profile.units} isStrength={false} />
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Field label="Duration" suffix="min" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} placeholder="30" autoFocus />
        </View>
        <View style={st.preview}>
          <Text style={st.previewLabel}>Estimated burn</Text>
          <Text style={st.previewVal}>{fmt(cardioKcal(ex, profile, m))} kcal</Text>
        </View>
        {minutes && problem ? <Text style={st.problem}>{problem}</Text> : null}
        <Button
          title="Save exercise"
          disabled={!!problem}
          onPress={() => {
            const kcalSaved = Math.round(cardioKcal(ex, profile, m));
            onSave(makeEntry(ex, { minutes: m, kcal: kcalSaved }));
            haptic.success();
            toast(`🏃 ${ex.name} saved · +${kcalSaved} kcal`);
            onBack();
          }}
        />
      </Card>
    </ScrollView>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    back: { color: C.primary, fontSize: 16, fontWeight: '600', marginBottom: 12 },
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
    head: { color: C.sub, fontSize: 12, fontWeight: '600' },
    col: { flex: 1 },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    setNo: { width: 34, fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    small: {
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 10,
      backgroundColor: C.inputBg,
      paddingVertical: 9,
      paddingHorizontal: 8,
      fontSize: 16,
      textAlign: 'center',
      color: C.text,
    },
    restCell: { textAlign: 'center', color: C.sub, fontSize: 16 },
    x: { color: C.sub, fontSize: 15, textAlign: 'center' },
    addSet: { paddingVertical: 8, alignItems: 'center' },
    addSetText: { color: C.primary, fontWeight: '700', fontSize: 15 },
    timerHint: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 8 },
    timerLabel: { color: C.sub, fontWeight: '600' },
    timer: { fontSize: 56, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
    track: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: C.track, overflow: 'hidden' },
    fill: { height: 8, backgroundColor: C.primary },
    preview: { backgroundColor: C.primarySoft, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
    previewLabel: { color: C.sub },
    previewVal: { fontSize: 28, fontWeight: '800', color: C.primary },
    problem: { color: C.red, textAlign: 'center', marginBottom: 10 },
    tip: { color: C.sub, fontSize: 12, textAlign: 'center' },
    dateBanner: { backgroundColor: C.primarySoft, marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    dateBannerText: { color: C.primary, fontWeight: '600', fontSize: 13 },
    lastTime: { color: C.sub, fontSize: 13 },
    chartBtn: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    chartBtnText: { color: C.primary, fontWeight: '700', fontSize: 12 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { fontSize: 19, fontWeight: '800', color: C.text, marginBottom: 12 },
    hintSmall: { color: C.sub, fontSize: 12, marginBottom: 12 },
  }),
);
