import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { bmr, fromKg, Profile, Sex, toKg, Units } from '../calc';
import { ThemeMode, themed, useC, useTheme } from '../theme';
import { Button, Card, Chip, FadeIn, Field, fmt, haptic, num, Title, toast } from '../ui';
import { exportBackup, exportCsv, importBackup } from '../backup';

type Props = { profile: Profile; onSave: (p: Profile) => void; firstRun?: boolean; onRestored?: () => void };

export default function ProfileScreen({ profile, onSave, firstRun, onRestored }: Props) {
  const st = useSt();
  const C = useC();
  const { mode, setMode } = useTheme();
  const [name, setName] = useState(profile.name);
  const [units, setUnits] = useState<Units>(profile.units);
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [weight, setWeight] = useState(String(+fromKg(profile.bodyKg, profile.units).toFixed(1)));
  const [goalWeight, setGoalWeight] = useState(
    profile.goalWeightKg !== undefined ? String(+fromKg(profile.goalWeightKg, profile.units).toFixed(1)) : '',
  );
  const [height, setHeight] = useState(String(profile.heightCm));
  const [age, setAge] = useState(String(profile.age));
  const [rest, setRest] = useState(String(profile.restSeconds));
  const [stepGoal, setStepGoal] = useState(String(profile.stepGoal));
  const [activeGoal, setActiveGoal] = useState(String(profile.activeGoal));

  function changeUnits(u: Units) {
    if (u === units) return;
    const conv = (s: string) => (s.trim() === '' ? '' : String(+fromKg(toKg(num(s), units), u).toFixed(1)));
    setWeight(conv(weight));
    setGoalWeight(conv(goalWeight));
    setUnits(u);
  }

  const draft: Profile = {
    name: name.trim(),
    units,
    sex,
    bodyKg: toKg(num(weight), units),
    goalWeightKg: goalWeight.trim() === '' ? undefined : toKg(num(goalWeight), units),
    heightCm: num(height),
    age: Math.round(num(age)),
    restSeconds: Math.round(num(rest)),
    stepGoal: Math.round(num(stepGoal)),
    activeGoal: Math.round(num(activeGoal)),
  };

  function save() {
    const bad = (msg: string) => {
      haptic.warn();
      Alert.alert(msg);
    };
    if (draft.bodyKg < 25 || draft.bodyKg > 350) return bad('Check your weight');
    if (draft.goalWeightKg !== undefined && (draft.goalWeightKg < 25 || draft.goalWeightKg > 350)) return bad('Check your goal weight');
    if (draft.heightCm < 100 || draft.heightCm > 250) return bad('Height should be in cm (100–250)');
    if (draft.age < 10 || draft.age > 110) return bad('Check your age');
    if (draft.stepGoal < 0 || draft.activeGoal < 0) return bad('Goals cannot be negative');
    onSave(draft);
    haptic.success();
    if (!firstRun) toast('✓ Profile saved');
  }

  const initial = (name.trim()[0] ?? '🙂').toUpperCase();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <FadeIn>
        <View style={st.header}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.hello}>{firstRun ? 'Welcome! 👋' : name.trim() || 'Your profile'}</Text>
            <Text style={st.sub}>
              {firstRun ? 'Set up once — everything stays on this phone.' : `Resting burn ${fmt(bmr(draft))} kcal/day`}
            </Text>
          </View>
        </View>
      </FadeIn>

      <Card>
        <Title>About you</Title>
        <Text style={st.label}>Name</Text>
        <TextInput style={st.textInput} value={name} onChangeText={setName} placeholder="What should we call you?" placeholderTextColor={C.placeholder} />
        <View style={[st.chips, { marginTop: 14 }]}>
          <Chip text="kg" active={units === 'kg'} onPress={() => changeUnits('kg')} />
          <Chip text="lb" active={units === 'lb'} onPress={() => changeUnits('lb')} />
          <View style={{ width: 16 }} />
          <Chip text="Male" active={sex === 'male'} onPress={() => setSex('male')} />
          <Chip text="Female" active={sex === 'female'} onPress={() => setSex('female')} />
        </View>
        <View style={st.row}>
          <Field label="Body weight" suffix={units} value={weight} onChangeText={setWeight} />
          <Field label="Goal weight" suffix={units} value={goalWeight} onChangeText={setGoalWeight} placeholder="optional" />
        </View>
        <View style={st.row}>
          <Field label="Height" suffix="cm" value={height} onChangeText={setHeight} />
          <Field label="Age" keyboardType="number-pad" value={age} onChangeText={setAge} />
        </View>
      </Card>

      <Card>
        <Title>Daily goals</Title>
        <View style={st.row}>
          <Field label="Steps" keyboardType="number-pad" value={stepGoal} onChangeText={setStepGoal} />
          <Field label="Active calories" suffix="kcal" keyboardType="number-pad" value={activeGoal} onChangeText={setActiveGoal} />
        </View>
        <View style={[st.row, { marginBottom: 0 }]}>
          <Field label="Rest between sets" suffix="sec" keyboardType="number-pad" value={rest} onChangeText={setRest} />
          <View style={{ flex: 1 }} />
        </View>
      </Card>

      <Card>
        <Title>Appearance</Title>
        <View style={st.chips}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <Chip key={m} text={{ system: '📱 System', light: '☀️ Light', dark: '🌙 Dark' }[m]} active={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
      </Card>

      {!firstRun && (
        <Card>
          <Title>Backup & export</Title>
          <Text style={[st.sub, { marginBottom: 12, marginTop: 0 }]}>
            Your data lives only on this phone. Save a backup to Google Drive (or anywhere) so you can restore it on a new phone.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="☁️ Backup"
                onPress={() =>
                  exportBackup()
                    .then((n) => toast(`✓ Backup ready · ${n} days`))
                    .catch((e) => Alert.alert('Backup failed', String(e.message ?? e)))
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="📥 Restore"
                kind="ghost"
                onPress={() =>
                  Alert.alert('Restore backup?', 'This replaces the data on this phone with the backup file you pick.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Choose file',
                      onPress: () =>
                        importBackup()
                          .then((n) => {
                            if (n === null) return;
                            haptic.success();
                            toast(`✓ Restored ${n} days`);
                            onRestored?.();
                          })
                          .catch((e) => Alert.alert('Restore failed', String(e.message ?? e))),
                    },
                  ])
                }
              />
            </View>
          </View>
          <Button
            title="📊 Export spreadsheet (CSV)"
            kind="ghost"
            onPress={() =>
              exportCsv()
                .then((n) => toast(`✓ ${n} sets exported`))
                .catch((e) => Alert.alert('Export failed', String(e.message ?? e)))
            }
          />
        </Card>
      )}

      <Button title={firstRun ? "Let's go 🚀" : 'Save profile'} onPress={save} />
      <Text style={st.note}>Works fully offline. No account, no ads, no internet.</Text>
    </ScrollView>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
    hello: { fontSize: 22, fontWeight: '800', color: C.text },
    sub: { color: C.sub, marginTop: 2 },
    label: { fontSize: 13, color: C.sub, marginBottom: 4 },
    textInput: {
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 12,
      backgroundColor: C.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 17,
      color: C.text,
    },
    chips: { flexDirection: 'row', marginBottom: 14 },
    row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    note: { textAlign: 'center', color: C.sub, fontSize: 12, marginTop: 12 },
  }),
);
