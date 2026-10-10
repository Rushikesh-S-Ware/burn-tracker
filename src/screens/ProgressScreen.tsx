import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { fromKg, Profile, toKg } from '../calc';
import { dateKey, Goal, loadGoals, loadWeights, saveGoals, saveWeights, WeightEntry } from '../storage';
import { themed, useC } from '../theme';
import { Button, Card, Chip, FadeIn, Field, haptic, num, ProgressBar, Tap, Title, toast } from '../ui';

type Props = { profile: Profile; onProfileChange: (p: Profile) => void };

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const round1 = (n: number) => Math.round(n * 10) / 10;

export default function ProgressScreen({ profile, onProfileChange }: Props) {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    loadWeights().then(setWeights);
    loadGoals().then(setGoals);
  }, []);

  function updateWeights(list: WeightEntry[]) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    setWeights(sorted);
    saveWeights(sorted);
    // Calories use your latest weight.
    const latest = sorted[sorted.length - 1];
    if (latest && Math.abs(latest.kg - profile.bodyKg) > 0.01) onProfileChange({ ...profile, bodyKg: latest.kg });
  }

  function updateGoals(list: Goal[]) {
    setGoals(list);
    saveGoals(list);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <FadeIn>
        <WeightCard profile={profile} weights={weights} onChange={updateWeights} />
      </FadeIn>
      <FadeIn delay={100}>
        <GoalsCard goals={goals} onChange={updateGoals} />
      </FadeIn>
    </ScrollView>
  );
}

// ---------------- body weight ----------------

function WeightCard({ profile, weights, onChange }: { profile: Profile; weights: WeightEntry[]; onChange: (w: WeightEntry[]) => void }) {
  const st = useSt();
  const C = useC();
  const u = profile.units;
  const [input, setInput] = useState('');
  const today = dateKey(new Date());
  const show = (kg: number) => round1(fromKg(kg, u));

  const first = weights[0];
  const last = weights[weights.length - 1];
  const current = last?.kg ?? profile.bodyKg;
  const goal = profile.goalWeightKg;
  const sinceLast = last ? daysBetween(last.date, today) : null;

  // Progress from starting weight toward the goal (works for losing or gaining).
  const start = first?.kg ?? profile.bodyKg;
  const totalChange = goal !== undefined ? goal - start : 0;
  const goalPct = goal !== undefined && totalChange !== 0 ? (current - start) / totalChange : 0;
  const toGo = goal !== undefined ? goal - current : 0;

  function log() {
    const v = num(input);
    if (v <= 0) return;
    const kg = toKg(v, u);
    if (kg < 25 || kg > 350) return Alert.alert('Check the weight');
    onChange([...weights.filter((w) => w.date !== today), { date: today, kg }]);
    setInput('');
    haptic.success();
    const diff = last && last.date !== today ? round1(fromKg(kg - last.kg, u)) : 0;
    toast(diff === 0 ? '⚖️ Weight saved' : `⚖️ Saved (${diff > 0 ? '+' : ''}${diff} ${u})`);
  }

  function remove(w: WeightEntry) {
    Alert.alert('Delete weigh-in?', `${w.date}: ${show(w.kg)} ${u}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onChange(weights.filter((x) => x.date !== w.date)) },
    ]);
  }

  return (
    <Card>
      <Title>⚖️ Body weight</Title>
      <View style={st.statsRow}>
        <BigStat label="Current" value={`${show(current)}`} unit={u} />
        <BigStat label="Goal" value={goal !== undefined ? `${show(goal)}` : '—'} unit={goal !== undefined ? u : ''} />
        <BigStat
          label="Change"
          value={first && last ? `${last.kg - first.kg > 0 ? '+' : ''}${show(last.kg - first.kg)}` : '—'}
          unit={first && last ? u : ''}
        />
      </View>

      {goal !== undefined && weights.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <ProgressBar pct={goalPct} color={C.green} />
          <Text style={st.sub}>
            {Math.abs(toGo) < 0.05 ? '🎉 You reached your goal weight!' : `${Math.abs(show(toGo))} ${u} to ${toGo < 0 ? 'lose' : 'gain'} · ${Math.round(Math.max(0, Math.min(1, goalPct)) * 100)}% there`}
          </Text>
        </View>
      )}
      {goal === undefined && <Text style={[st.sub, { marginBottom: 12 }]}>Set a goal weight in Profile to track progress.</Text>}

      {sinceLast !== null && sinceLast >= 7 && (
        <View style={st.nudge}>
          <Text style={st.nudgeText}>📅 It&apos;s been {sinceLast} days — time for your weekly weigh-in!</Text>
        </View>
      )}
      {weights.length === 0 && (
        <View style={st.nudge}>
          <Text style={st.nudgeText}>Log your weight once a week to see your trend here.</Text>
        </View>
      )}

      {weights.length >= 2 && <WeightChart weights={weights} goal={goal} units={u} />}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 6 }}>
        <Field label="Today's weight" suffix={u} value={input} onChangeText={setInput} placeholder={String(show(current))} />
        <View style={{ width: 110 }}>
          <Button title="Log" onPress={log} disabled={num(input) <= 0} />
        </View>
      </View>

      {weights.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={st.listHead}>Recent weigh-ins (hold to delete)</Text>
          {[...weights]
            .reverse()
            .slice(0, 6)
            .map((w, i, arr) => {
              const prev = arr[i + 1];
              const d = prev ? round1(fromKg(w.kg - prev.kg, u)) : 0;
              return (
                <Pressable key={w.date} onLongPress={() => remove(w)} style={st.weighRow}>
                  <Text style={st.weighDate}>
                    {new Date(w.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={st.weighVal}>
                    {show(w.kg)} {u}
                  </Text>
                  <Text style={[st.weighDiff, { color: d === 0 ? C.sub : d < 0 ? C.green : C.primary }]}>
                    {prev ? `${d > 0 ? '+' : ''}${d}` : ''}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      )}
    </Card>
  );
}

function BigStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  const st = useSt();
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.bigVal}>
        {value}
        <Text style={st.bigUnit}> {unit}</Text>
      </Text>
      <Text style={st.sub}>{label}</Text>
    </View>
  );
}

function WeightChart({ weights, goal, units }: { weights: WeightEntry[]; goal?: number; units: 'kg' | 'lb' }) {
  const C = useC();
  const [width, setWidth] = useState(0);
  const H = 150;
  const PAD = { l: 34, r: 10, t: 10, b: 18 };
  const pts = weights.slice(-16);
  const vals = pts.map((w) => fromKg(w.kg, units));
  const goalV = goal !== undefined ? fromKg(goal, units) : undefined;
  const all = goalV !== undefined ? [...vals, goalV] : vals;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => PAD.l + (i / Math.max(1, pts.length - 1)) * (width - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H, marginBottom: 8 }}>
      {width > 0 && (
        <Svg width={width} height={H}>
          {[hi, (hi + lo) / 2, lo].map((v) => (
            <SvgText key={v} x={PAD.l - 6} y={y(v) + 4} fontSize={10} fill={C.sub} textAnchor="end">
              {round1(v)}
            </SvgText>
          ))}
          {goalV !== undefined && (
            <>
              <Line x1={PAD.l} x2={width - PAD.r} y1={y(goalV)} y2={y(goalV)} stroke={C.green} strokeDasharray="5 4" strokeWidth={1.5} />
              <SvgText x={width - PAD.r} y={y(goalV) - 4} fontSize={10} fill={C.green} textAnchor="end">
                goal
              </SvgText>
            </>
          )}
          <Polyline
            points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={C.blue}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {vals.map((v, i) => (
            <Circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 5 : 3} fill={C.blue} />
          ))}
          <SvgText x={PAD.l} y={H - 3} fontSize={10} fill={C.sub}>
            {pts[0].date.slice(5)}
          </SvgText>
          <SvgText x={width - PAD.r} y={H - 3} fontSize={10} fill={C.sub} textAnchor="end">
            {pts[pts.length - 1].date.slice(5)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

// ---------------- custom goals ----------------

const PRESETS: { emoji: string; title: string; unit: string; target: number }[] = [
  { emoji: '🏋️', title: 'Bench press', unit: 'kg', target: 100 },
  { emoji: '🏃', title: 'Run distance', unit: 'km', target: 5 },
  { emoji: '📅', title: 'Workouts this month', unit: 'workouts', target: 12 },
  { emoji: '💧', title: 'Water per day', unit: 'L', target: 3 },
  { emoji: '🤸', title: 'Pull-ups in a row', unit: 'reps', target: 10 },
];
const EMOJIS = ['🎯', '🏋️', '🏃', '💪', '🔥', '💧', '🥗', '😴', '🚴', '🧘'];

/** Add or update a goal, stamping its id and completion time. */
function upsertGoal(goals: Goal[], input: Goal) {
  const now = Date.now();
  const g = input.id ? input : { ...input, id: String(now) };
  const reachedNow = g.current >= g.target && !g.doneAt;
  const next = { ...g, doneAt: g.current >= g.target ? (g.doneAt ?? now) : undefined };
  const exists = goals.some((x) => x.id === g.id);
  return { g, reachedNow, list: exists ? goals.map((x) => (x.id === g.id ? next : x)) : [...goals, next] };
}

function GoalsCard({ goals, onChange }: { goals: Goal[]; onChange: (g: Goal[]) => void }) {
  const st = useSt();
  const C = useC();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  function save(input: Goal) {
    const { list, g, reachedNow } = upsertGoal(goals, input);
    onChange(list);
    if (reachedNow) {
      haptic.success();
      toast(`🏆 Goal complete: ${g.title}!`);
    }
  }

  function bump(g: Goal, dir: 1 | -1) {
    const step = g.target >= 20 ? 1 : g.target >= 5 ? 0.5 : 0.1;
    save({ ...g, current: Math.max(0, round1(g.current + dir * step)) });
  }

  function remove(g: Goal) {
    Alert.alert('Delete goal?', g.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onChange(goals.filter((x) => x.id !== g.id)) },
    ]);
  }

  return (
    <Card>
      <View style={st.goalsHead}>
        <Title style={{ marginBottom: 0 }}>🎯 My goals</Title>
        {!adding && !editing && (
          <Tap onPress={() => setAdding(true)} style={st.addBtn}>
            <Text style={st.addBtnText}>+ New</Text>
          </Tap>
        )}
      </View>

      {goals.length === 0 && !adding && (
        <Text style={st.sub}>Add anything you want to work toward — a lift, a distance, a habit.</Text>
      )}

      {goals.map((g) =>
        editing?.id === g.id ? (
          <GoalForm key={g.id} initial={g} onCancel={() => setEditing(null)} onSave={(x) => (save(x), setEditing(null))} onDelete={() => (remove(g), setEditing(null))} />
        ) : (
          <Pressable key={g.id} onPress={() => setEditing(g)} onLongPress={() => remove(g)} style={st.goal}>
            <View style={st.goalTop}>
              <Text style={st.goalTitle}>
                {g.emoji} {g.title}
              </Text>
              {g.current >= g.target ? <Text style={st.doneBadge}>✓ Done</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ProgressBar pct={g.target > 0 ? g.current / g.target : 0} color={g.current >= g.target ? C.green : C.primary} />
              </View>
              <Tap onPress={() => bump(g, -1)} style={st.bump}>
                <Text style={st.bumpText}>−</Text>
              </Tap>
              <Tap onPress={() => bump(g, 1)} style={st.bump}>
                <Text style={st.bumpText}>+</Text>
              </Tap>
            </View>
            <Text style={st.sub}>
              {g.current} / {g.target} {g.unit} · {Math.min(100, Math.round((g.current / (g.target || 1)) * 100))}%
            </Text>
          </Pressable>
        ),
      )}

      {adding && <GoalForm onCancel={() => setAdding(false)} onSave={(g) => (save(g), setAdding(false))} />}
      {goals.length > 0 && !adding && <Text style={[st.sub, { marginTop: 6 }]}>Tap a goal to edit · use − / + to update progress</Text>}
    </Card>
  );
}

function GoalForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Goal;
  onSave: (g: Goal) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const st = useSt();
  const C = useC();
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🎯');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [current, setCurrent] = useState(initial ? String(initial.current) : '');
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const valid = title.trim().length > 0 && num(target) > 0;

  return (
    <View style={st.form}>
      {!initial && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <Chip
              key={p.title}
              text={`${p.emoji} ${p.title}`}
              active={title === p.title}
              onPress={() => {
                setEmoji(p.emoji);
                setTitle(p.title);
                setUnit(p.unit);
                setTarget(String(p.target));
              }}
            />
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EMOJIS.map((e) => (
          <Tap key={e} onPress={() => setEmoji(e)} style={[st.emoji, emoji === e && { borderColor: C.primary, backgroundColor: C.primarySoft }]}>
            <Text style={{ fontSize: 18 }}>{e}</Text>
          </Tap>
        ))}
      </View>
      <Text style={st.formLabel}>Goal</Text>
      <TextInput style={st.textInput} value={title} onChangeText={setTitle} placeholder="e.g. Squat 120 kg" placeholderTextColor={C.placeholder} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Field label="Now" value={current} onChangeText={setCurrent} placeholder="0" />
        <Field label="Target" value={target} onChangeText={setTarget} placeholder="100" />
        <View style={{ flex: 1 }}>
          <Text style={st.formLabel}>Unit</Text>
          <TextInput style={st.textInput} value={unit} onChangeText={setUnit} placeholder="kg" placeholderTextColor={C.placeholder} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" kind="ghost" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Save goal"
            disabled={!valid}
            onPress={() =>
              onSave({
                id: initial?.id ?? '',
                emoji,
                title: title.trim(),
                current: num(current),
                target: num(target),
                unit: unit.trim(),
                doneAt: initial?.doneAt,
              })
            }
          />
        </View>
      </View>
      {onDelete && (
        <Pressable onPress={onDelete} style={{ alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: C.red, fontWeight: '600' }}>Delete goal</Text>
        </Pressable>
      )}
    </View>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    statsRow: { flexDirection: 'row', marginBottom: 14 },
    bigVal: { fontSize: 24, fontWeight: '800', color: C.text },
    bigUnit: { fontSize: 13, fontWeight: '600', color: C.sub },
    sub: { color: C.sub, fontSize: 12, marginTop: 4 },
    nudge: { backgroundColor: C.primarySoft, borderRadius: 12, padding: 12, marginBottom: 12 },
    nudgeText: { color: C.primary, fontWeight: '600' },
    listHead: { color: C.sub, fontSize: 12, fontWeight: '600', marginBottom: 4 },
    weighRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
    weighDate: { flex: 1, color: C.text },
    weighVal: { color: C.text, fontWeight: '700', width: 80, textAlign: 'right' },
    weighDiff: { width: 50, textAlign: 'right', fontWeight: '600' },
    goalsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    addBtn: { backgroundColor: C.primarySoft, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
    addBtnText: { color: C.primary, fontWeight: '700' },
    goal: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
    goalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    goalTitle: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
    doneBadge: { color: C.green, fontWeight: '800' },
    bump: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
    bumpText: { fontSize: 20, fontWeight: '700', color: C.text, lineHeight: 22 },
    form: { backgroundColor: C.bg, borderRadius: 14, padding: 12, marginTop: 6 },
    formLabel: { fontSize: 13, color: C.sub, marginBottom: 4 },
    textInput: {
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 12,
      backgroundColor: C.inputBg,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 16,
      color: C.text,
    },
    emoji: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  }),
);
