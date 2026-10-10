import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { addCustomExercise, allExercises, Exercise, Group, groupInfo, GROUPS, loadCustomExercises, removeCustomExercise } from '../exercises';
import { loadRecent } from '../storage';
import { themed, useC } from '../theme';
import { Button, Card, Chip, FadeIn, haptic, Tap, toast } from '../ui';

type Props = { onPick: (e: Exercise) => void };

export default function ExercisePicker({ onPick }: Props) {
  const st = useSt();
  const C = useC();
  const [group, setGroup] = useState<Group | null>(null);
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [all, setAll] = useState<Exercise[]>(() => allExercises());
  const refreshAll = () => setAll(allExercises());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadRecent().then(setRecentIds);
    loadCustomExercises().then(refreshAll);
  }, []);

  const recent = recentIds.map((id) => all.find((e) => e.id === id)).filter((e): e is Exercise => !!e);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = searching ? all.filter((e) => e.name.toLowerCase().includes(q)) : group ? all.filter((e) => e.group === group) : [];
  const countIn = (g: Group) => all.filter((e) => e.group === g).length;

  async function deleteCustom(e: Exercise) {
    Alert.alert('Delete exercise?', `${e.name} will be removed from your list. Past workouts keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeCustomExercise(e.id);
          refreshAll();
        },
      },
    ]);
  }

  const header = (
    <View style={st.searchRow}>
      {(group || searching) && !adding ? (
        <Pressable
          onPress={() => {
            setGroup(null);
            setQuery('');
          }}
          hitSlop={10}
          style={st.backBtn}
        >
          <Text style={st.backText}>‹</Text>
        </Pressable>
      ) : null}
      <TextInput
        style={st.search}
        placeholder="Search all exercises…"
        placeholderTextColor={C.placeholder}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
    </View>
  );

  if (adding) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <AddExerciseForm
          defaultGroup={group ?? 'chest'}
          onCancel={() => setAdding(false)}
          onAdded={(e) => {
            setAdding(false);
            refreshAll();
            onPick(e);
          }}
        />
      </View>
    );
  }

  // ----- group grid (home) -----
  if (!group && !searching) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {header}
        {recent.length > 0 && (
          <FadeIn>
            <Text style={st.sectionLabel}>Recent</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} keyboardShouldPersistTaps="handled">
              {recent.map((e) => (
                <Chip key={e.id} text={`${groupInfo(e.group).emoji} ${e.name}`} active={false} onPress={() => onPick(e)} />
              ))}
            </ScrollView>
          </FadeIn>
        )}
        <Text style={st.sectionLabel}>Body part</Text>
        <View style={st.grid}>
          {GROUPS.map((g, i) => (
            <FadeIn key={g.key} delay={i * 40} style={st.tileWrap}>
              <Tap onPress={() => setGroup(g.key)} style={[st.tile, { borderLeftColor: g.color }]}>
                <Text style={st.tileEmoji}>{g.emoji}</Text>
                <Text style={st.tileName}>{g.name}</Text>
                <Text style={st.tileCount}>{countIn(g.key)} exercises</Text>
              </Tap>
            </FadeIn>
          ))}
        </View>
        <Pressable onPress={() => setAdding(true)} style={st.addLink}>
          <Text style={st.addLinkText}>+ Add your own exercise</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ----- list within a group, or search results -----
  const g = group ? groupInfo(group) : null;
  return (
    <View style={{ flex: 1, padding: 16 }}>
      {header}
      {g && !searching && (
        <Text style={st.groupTitle}>
          {g.emoji} {g.name}
        </Text>
      )}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {results.length === 0 && <Text style={st.empty}>No match. Add it below 👇</Text>}
        {results.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => onPick(e)}
            onLongPress={() => e.custom && deleteCustom(e)}
            style={({ pressed }) => [st.item, pressed && { opacity: 0.6 }]}
          >
            <View style={[st.dot, { backgroundColor: groupInfo(e.group).color }]} />
            <Text style={st.itemText}>{e.name}</Text>
            {e.custom && <Text style={st.customTag}>yours</Text>}
            <Text style={st.chev}>›</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setAdding(true)} style={st.addLink}>
          <Text style={st.addLinkText}>+ Add your own exercise</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function AddExerciseForm({ defaultGroup, onCancel, onAdded }: { defaultGroup: Group; onCancel: () => void; onAdded: (e: Exercise) => void }) {
  const st = useSt();
  const C = useC();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>(defaultGroup);
  const valid = name.trim().length >= 2;

  async function save() {
    if (!valid) return;
    const e = await addCustomExercise(name.trim(), group);
    haptic.success();
    toast(`✓ Added ${e.name}`);
    onAdded(e);
  }

  return (
    <Card>
      <Text style={st.groupTitle}>Add your own exercise</Text>
      <Text style={st.sectionLabel}>Name</Text>
      <TextInput style={st.search} value={name} onChangeText={setName} placeholder="e.g. Landmine Press" placeholderTextColor={C.placeholder} autoFocus />
      <Text style={[st.sectionLabel, { marginTop: 12 }]}>Body part</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
        {GROUPS.map((g) => (
          <Chip key={g.key} text={`${g.emoji} ${g.name}`} active={group === g.key} onPress={() => setGroup(g.key)} />
        ))}
      </View>
      <Text style={st.hint}>
        {group === 'cardio' ? 'Logged by minutes, moderate intensity.' : 'Logged set by set. Calories use an average weight-training intensity.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" kind="ghost" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Add & log" onPress={save} disabled={!valid} />
        </View>
      </View>
    </Card>
  );
}

const useSt = themed((C) =>
  StyleSheet.create({
    searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    backBtn: { width: 40, height: 44, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
    backText: { fontSize: 26, color: C.primary, lineHeight: 28 },
    search: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 16,
      borderWidth: 1,
      borderColor: C.line,
      color: C.text,
    },
    sectionLabel: { color: C.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
    tileWrap: { width: '33.33%', padding: 5 },
    tile: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 12,
      minHeight: 96,
      borderLeftWidth: 4,
      borderWidth: C.dark ? 1 : 0,
      borderColor: C.line,
      shadowColor: '#000',
      shadowOpacity: C.dark ? 0 : 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: C.dark ? 0 : 1,
    },
    tileEmoji: { fontSize: 26 },
    tileName: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 6 },
    tileCount: { fontSize: 11, color: C.sub, marginTop: 2 },
    groupTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 10 },
    item: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: C.dark ? 1 : 0, borderColor: C.line },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
    itemText: { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
    customTag: { fontSize: 11, color: C.primary, fontWeight: '700', backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
    chev: { fontSize: 20, color: C.sub },
    empty: { color: C.sub, textAlign: 'center', marginVertical: 20 },
    addLink: { alignItems: 'center', paddingVertical: 16 },
    addLinkText: { color: C.primary, fontWeight: '700', fontSize: 15 },
    hint: { color: C.sub, fontSize: 12, marginTop: 10 },
  }),
);
