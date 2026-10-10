import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cardioKcal, fromKg, Profile, SetRec, setsKcal, toKg } from '../calc';
import { findExercise } from '../exercises';
import { LogEntry } from '../storage';
import { themed, useC } from '../theme';
import { Button, fmt, num } from '../ui';

type Row = { weight: string; reps: string; rest: string };

type Props = { entry: LogEntry | null; profile: Profile; onSave: (e: LogEntry) => void; onClose: () => void };

/** Fix a logged exercise: change weights, reps, rest or minutes; add or remove sets. */
export default function EditEntryModal({ entry, profile, onSave, onClose }: Props) {
  if (!entry) return null;
  return <Editor key={entry.id} entry={entry} profile={profile} onSave={onSave} onClose={onClose} />;
}

function Editor({ entry, profile, onSave, onClose }: Props & { entry: LogEntry }) {
  const st = useSt();
  const C = useC();
  const u = profile.units;
  const ex = findExercise(entry.exerciseId);
  const isCardio = ex ? ex.kind === 'cardio' : entry.minutes !== undefined && !entry.setList && !entry.sets;
  const show = (kg: number) => (kg > 0 ? String(+fromKg(kg, u).toFixed(1)) : '');

  // Old-style entries (sets × reps) are expanded into individual sets when edited.
  const initialRows: Row[] = entry.setList?.length
    ? entry.setList.map((s) => ({ weight: show(s.weightKg), reps: String(s.reps), rest: s.restSec !== undefined ? String(s.restSec) : '' }))
    : entry.sets
      ? Array.from({ length: entry.sets }, () => ({ weight: show(entry.weightKg ?? 0), reps: String(entry.reps ?? 0), rest: '' }))
      : [{ weight: '', reps: '10', rest: '' }];
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [minutes, setMinutes] = useState(String(entry.minutes ?? ''));

  const sets: SetRec[] = rows
    .map((r) => ({ reps: Math.round(num(r.reps)), weightKg: toKg(num(r.weight), u), restSec: r.rest.trim() === '' ? undefined : Math.round(num(r.rest)) }))
    .filter((s) => s.reps > 0);
  const m = num(minutes);
  const kcal = isCardio ? (ex ? cardioKcal(ex, profile, m) : entry.kcal) : ex ? setsKcal(ex, profile, sets) : entry.kcal;
  const valid = isCardio ? m > 0 && m <= 600 : sets.length > 0 && !sets.some((s) => s.weightKg > 600 || s.reps > 500);

  const edit = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    if (!valid) return;
    const next: LogEntry = isCardio
      ? { ...entry, minutes: m, kcal: Math.round(kcal), setList: undefined, sets: undefined, reps: undefined, weightKg: undefined }
      : { ...entry, setList: sets, kcal: Math.round(kcal), sets: undefined, reps: undefined, weightKg: undefined, minutes: undefined };
    onSave(next);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />
        <Text style={st.title}>Edit · {entry.name}</Text>
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {isCardio ? (
            <View style={st.row}>
              <Text style={st.cellLabel}>Minutes</Text>
              <TextInput style={st.input} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" selectTextOnFocus autoFocus />
            </View>
          ) : (
            <>
              <View style={st.headRow}>
                <Text style={[st.head, { width: 34 }]}>Set</Text>
                <Text style={[st.head, st.col]}>{u}</Text>
                <Text style={[st.head, st.col]}>Reps</Text>
                <Text style={[st.head, st.col]}>Rest (s)</Text>
                <View style={{ width: 24 }} />
              </View>
              {rows.map((r, i) => (
                <View key={i} style={st.setRow}>
                  <Text style={st.setNo}>{i + 1}</Text>
                  <TextInput style={[st.input, st.col]} value={r.weight} onChangeText={(t) => edit(i, { weight: t })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.placeholder} selectTextOnFocus />
                  <TextInput style={[st.input, st.col]} value={r.reps} onChangeText={(t) => edit(i, { reps: t })} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.placeholder} selectTextOnFocus />
                  <TextInput style={[st.input, st.col]} value={r.rest} onChangeText={(t) => edit(i, { rest: t })} keyboardType="number-pad" placeholder={String(profile.restSeconds)} placeholderTextColor={C.placeholder} selectTextOnFocus />
                  <Pressable onPress={() => setRows((rs) => rs.filter((_, j) => j !== i))} hitSlop={8} disabled={rows.length === 1} style={{ width: 24 }}>
                    <Text style={[st.x, rows.length === 1 && { opacity: 0 }]}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => setRows((rs) => [...rs, { ...rs[rs.length - 1], rest: '' }])} style={st.addSet}>
                <Text style={st.addSetText}>+ Add set</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
        <View style={st.preview}>
          <Text style={st.previewLabel}>Estimated burn</Text>
          <Text style={st.previewVal}>{fmt(kcal)} kcal</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" kind="ghost" onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Save changes" onPress={save} disabled={!valid} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 },
    title: { fontSize: 19, fontWeight: '800', color: C.text, marginBottom: 12 },
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
    head: { color: C.sub, fontSize: 12, fontWeight: '600' },
    col: { flex: 1 },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    setNo: { width: 34, fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cellLabel: { color: C.sub, fontSize: 14 },
    input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: C.inputBg, paddingVertical: 9, paddingHorizontal: 8, fontSize: 16, textAlign: 'center', color: C.text, minWidth: 0 },
    x: { color: C.sub, fontSize: 15, textAlign: 'center' },
    addSet: { paddingVertical: 8, alignItems: 'center' },
    addSetText: { color: C.primary, fontWeight: '700', fontSize: 15 },
    preview: { backgroundColor: C.primarySoft, borderRadius: 12, padding: 12, alignItems: 'center', marginVertical: 12 },
    previewLabel: { color: C.sub, fontSize: 12 },
    previewVal: { fontSize: 24, fontWeight: '800', color: C.primary },
  }),
);
