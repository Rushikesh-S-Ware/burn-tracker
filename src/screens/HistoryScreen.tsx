import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bmr, fromKg, Profile, stepsToKm, Units, walkingKcal } from '../calc';
import { Group, groupInfo, groupOf, GROUPS } from '../exercises';
import { DayLog, dateKey, loadDays, loadWeights, LogEntry, WeightEntry } from '../storage';
import { themed, useC } from '../theme';
import { Button, Card, FadeIn, fmt, Tap, Title } from '../ui';

type Props = { profile: Profile; onOpenDay: (date: string) => void };

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** All dates in a month, padded with nulls so the first falls under the right weekday (Monday first). */
function monthGrid(y: number, m: number): (string | null)[] {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= count; d++) cells.push(dateKey(new Date(y, m, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const daysAgo = (date: string) =>
  Math.round((new Date(dateKey(new Date()) + 'T00:00').getTime() - new Date(date + 'T00:00').getTime()) / 86400000);

export default function HistoryScreen({ profile, onOpenDay }: Props) {
  const st = useSt();
  const C = useC();
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [days, setDays] = useState<Record<string, DayLog>>({});
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const monthDates = cells.filter((c): c is string => !!c);

  // Load this month plus the last 60 days (weekly stats and "last trained" may cross a month boundary).
  useEffect(() => {
    const recent = Array.from({ length: 60 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return dateKey(d);
    });
    const want = Array.from(new Set([...monthDates, ...recent]));
    loadDays(want).then((loaded) => setDays((prev) => ({ ...prev, ...loaded })));
    loadWeights().then(setWeights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const todayKey = dateKey(today);
  const isCurrentMonth = ym.y === today.getFullYear() && ym.m === today.getMonth();
  const groupsOn = (date: string): Group[] => {
    const d = days[date];
    if (!d) return [];
    return Array.from(new Set(d.entries.map((e) => groupOf(e.exerciseId))));
  };

  // ----- weekly stats + balance -----
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const week = last7.map((date) => days[date]).filter(Boolean);
  const weekActive = week.reduce((s, d) => s + d.entries.reduce((t, e) => t + e.kcal, 0) + walkingKcal(d.steps, profile), 0);
  const weekSteps = week.reduce((s, d) => s + d.steps, 0);
  const weekWorkouts = week.filter((d) => d.entries.length > 0).length;
  const weekRest = week.filter((d) => d.entries.length === 0 && d.rest).length;
  const weekMissed = Math.max(0, 7 - weekWorkouts - weekRest);
  const groupCounts = GROUPS.map((g) => ({ ...g, count: last7.filter((date) => groupsOn(date).includes(g.key)).length }));
  const lastTrained = (g: Group) => {
    const dates = Object.keys(days)
      .filter((date) => date <= todayKey && groupsOn(date).includes(g))
      .sort()
      .reverse();
    return dates[0] ? daysAgo(dates[0]) : null;
  };
  const anyWorkout = Object.values(days).some((d) => d.entries.length > 0);
  const neglected = anyWorkout
    ? GROUPS.filter((g) => g.key !== 'cardio' && g.key !== 'core')
        .map((g) => ({ ...g, ago: lastTrained(g.key) }))
        .filter((g) => g.ago === null || g.ago >= 7)
        .sort((a, b) => (b.ago ?? 999) - (a.ago ?? 999))[0]
    : undefined;

  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prevMonth = () => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextMonth = () => !isCurrentMonth && setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));
  const monthWorkouts = monthDates.filter((d) => (days[d]?.entries.length ?? 0) > 0).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <FadeIn>
        <Card>
          <Title>Last 7 days</Title>
          <View style={{ flexDirection: 'row' }}>
            <Big label="Workouts" value={String(weekWorkouts)} />
            <Big label="Active kcal" value={fmt(weekActive)} />
            <Big label="Steps" value={fmt(weekSteps)} />
          </View>
          <Text style={st.weekLine}>
            {weekWorkouts} {weekWorkouts === 1 ? 'workout' : 'workouts'} · {weekRest} rest {weekRest === 1 ? 'day' : 'days'} · {weekMissed} {weekMissed === 1 ? 'day' : 'days'} without
          </Text>
          <View style={st.balanceRow}>
            {groupCounts.map((g) => (
              <View key={g.key} style={[st.balancePill, g.count === 0 && { opacity: 0.4 }]}>
                <View style={[st.dot, { backgroundColor: g.color }]} />
                <Text style={st.balanceText}>
                  {g.name} {g.count}×
                </Text>
              </View>
            ))}
          </View>
          {neglected && (
            <Text style={st.nudge}>
              {neglected.emoji} {neglected.name}{' '}
              {neglected.ago === null ? 'not trained in the last 2 months' : `last trained ${neglected.ago} days ago`} — time to hit it?
            </Text>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={80}>
        <Card>
          <View style={st.monthRow}>
            <Pressable onPress={prevMonth} hitSlop={12}>
              <Text style={st.arrow}>‹</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={st.monthTitle}>{monthLabel}</Text>
              <Text style={st.monthSub}>
                {monthWorkouts} workout {monthWorkouts === 1 ? 'day' : 'days'}
              </Text>
            </View>
            <Pressable onPress={nextMonth} hitSlop={12}>
              <Text style={[st.arrow, isCurrentMonth && { opacity: 0.2 }]}>›</Text>
            </Pressable>
          </View>
          <View style={st.dowRow}>
            {DOW.map((d) => (
              <Text key={d} style={st.dow}>
                {d}
              </Text>
            ))}
          </View>
          <View style={st.grid}>
            {cells.map((date, i) => {
              if (!date) return <View key={`e${i}`} style={st.cell} />;
              const d = days[date];
              const gs = groupsOn(date);
              const hasSteps = !!d && profile.stepGoal > 0 && d.steps >= profile.stepGoal;
              const future = date > todayKey;
              const isToday = date === todayKey;
              return (
                <Tap key={date} onPress={() => setSelected(date)} disabled={future} style={st.cell} scaleTo={0.85}>
                  <View style={[st.dayCircle, isToday && { borderColor: C.primary, borderWidth: 2 }, gs.length > 0 && { backgroundColor: C.primarySoft }]}>
                    <Text style={[st.dayNum, future && { opacity: 0.3 }, gs.length > 0 && { color: C.primary, fontWeight: '800' }]}>
                      {Number(date.slice(8))}
                    </Text>
                  </View>
                  <View style={st.dots}>
                    {gs.slice(0, 4).map((g) => (
                      <View key={g} style={[st.dot, { backgroundColor: groupInfo(g).color }]} />
                    ))}
                    {hasSteps && gs.length === 0 && <View style={[st.dot, { backgroundColor: C.blue, opacity: 0.5 }]} />}
                    {d?.rest && gs.length === 0 && <Text style={st.restGlyph}>💤</Text>}
                  </View>
                </Tap>
              );
            })}
          </View>
          <View style={st.legend}>
            {GROUPS.map((g) => (
              <View key={g.key} style={st.legendItem}>
                <View style={[st.dot, { backgroundColor: g.color }]} />
                <Text style={st.legendText}>{g.name}</Text>
              </View>
            ))}
            <View style={st.legendItem}>
              <View style={[st.dot, { backgroundColor: C.blue, opacity: 0.5 }]} />
              <Text style={st.legendText}>step goal</Text>
            </View>
            <View style={st.legendItem}>
              <Text style={{ fontSize: 9 }}>💤</Text>
              <Text style={st.legendText}>rest day</Text>
            </View>
          </View>
          <Text style={st.hintText}>Tap a day to see what you did.</Text>
        </Card>
      </FadeIn>

      <DayModal
        date={selected}
        day={selected ? days[selected] : undefined}
        weight={selected ? weights.find((w) => w.date === selected) : undefined}
        profile={profile}
        onClose={() => setSelected(null)}
        onEdit={() => {
          if (selected) onOpenDay(selected);
          setSelected(null);
        }}
      />
    </ScrollView>
  );
}

// ---------------- day detail pop-up ----------------

function setLine(e: LogEntry, u: Units) {
  const w = (kg: number) => +fromKg(kg, u).toFixed(1);
  if (e.setList?.length) return e.setList.map((s) => `${s.weightKg > 0 ? `${w(s.weightKg)}×` : ''}${s.reps}`).join('  ·  ');
  if (e.sets) return `${e.sets} × ${e.reps}${e.weightKg ? ` @ ${w(e.weightKg)} ${u}` : ''}`;
  return `${e.minutes} min`;
}

function DayModal({
  date,
  day,
  weight,
  profile,
  onClose,
  onEdit,
}: {
  date: string | null;
  day?: DayLog;
  weight?: WeightEntry;
  profile: Profile;
  onClose: () => void;
  onEdit: () => void;
}) {
  const st = useSt();
  const C = useC();
  if (!date) return null;
  const entries = day?.entries ?? [];
  const steps = day?.steps ?? 0;
  const food = day?.foodKcal ?? 0;
  const workout = entries.reduce((s, e) => s + e.kcal, 0);
  const walk = walkingKcal(steps, profile);
  const total = bmr(profile) + workout + walk;
  const net = food - total;
  const title = new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const groups = Array.from(new Set(entries.map((e) => groupOf(e.exerciseId))));
  const u = profile.units;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />
        <Text style={st.sheetTitle}>{title}</Text>
        {groups.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {groups.map((g) => (
              <View key={g} style={[st.groupTag, { backgroundColor: groupInfo(g).color }]}>
                <Text style={st.groupTagText}>
                  {groupInfo(g).emoji} {groupInfo(g).name}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View style={st.sheetStats}>
          <Big label="Total burn" value={fmt(total)} />
          <Big label="Workout" value={fmt(workout)} />
          <Big label="Steps" value={fmt(steps)} />
        </View>
        <ScrollView style={{ maxHeight: 320 }}>
          {entries.length === 0 ? (
            <Text style={st.empty}>
              {day?.rest ? '😴 Planned rest day' : steps > 0 ? 'No workout' : 'Nothing logged this day.'}
              {steps > 0 ? ` · ${stepsToKm(steps, profile).toFixed(1)} km walked` : ''}
            </Text>
          ) : (
            entries.map((e) => (
              <View key={e.id} style={st.entry}>
                <View style={[st.dot, { backgroundColor: groupInfo(groupOf(e.exerciseId)).color, marginTop: 6 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.entryName}>{e.name}</Text>
                  <Text style={st.entrySets}>{setLine(e, u)}</Text>
                </View>
                <Text style={st.entryKcal}>{e.kcal} kcal</Text>
              </View>
            ))
          )}
          {weight && (
            <Text style={st.extraLine}>
              ⚖️ Weighed in: {+fromKg(weight.kg, u).toFixed(1)} {u}
            </Text>
          )}
          {food > 0 && (
            <Text style={st.extraLine}>
              🍽 Ate {fmt(food)} kcal ·{' '}
              <Text style={{ color: net > 0 ? C.red : C.green, fontWeight: '700' }}>{net > 0 ? `+${fmt(net)} surplus` : `${fmt(net)} deficit`}</Text>
            </Text>
          )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Button title="Close" kind="ghost" onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Edit this day" onPress={onEdit} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  const C = useC();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    weekLine: { color: C.sub, fontSize: 13, marginTop: 10 },
    restGlyph: { fontSize: 7, lineHeight: 8 },
    balanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    balancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.chip, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 5 },
    balanceText: { fontSize: 12, color: C.text, fontWeight: '600' },
    nudge: { color: C.primary, fontWeight: '600', marginTop: 10, fontSize: 13 },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    arrow: { fontSize: 32, color: C.primary, paddingHorizontal: 10, lineHeight: 34 },
    monthTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    monthSub: { fontSize: 12, color: C.sub },
    dowRow: { flexDirection: 'row', marginBottom: 4 },
    dow: { flex: 1, textAlign: 'center', fontSize: 11, color: C.sub, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.28%', alignItems: 'center', paddingVertical: 4 },
    dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dayNum: { fontSize: 14, color: C.text, fontWeight: '500' },
    dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendText: { fontSize: 11, color: C.sub },
    hintText: { color: C.sub, fontSize: 12, marginTop: 10, textAlign: 'center' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { fontSize: 19, fontWeight: '800', color: C.text, marginBottom: 8 },
    groupTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    groupTagText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    sheetStats: { flexDirection: 'row', marginBottom: 12, backgroundColor: C.bg, borderRadius: 12, padding: 12 },
    empty: { color: C.sub, textAlign: 'center', paddingVertical: 16 },
    entry: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
    entryName: { fontSize: 15, fontWeight: '700', color: C.text },
    entrySets: { color: C.sub, fontSize: 13, marginTop: 2 },
    entryKcal: { color: C.primary, fontWeight: '700' },
    extraLine: { color: C.text, marginTop: 10 },
  }),
);
