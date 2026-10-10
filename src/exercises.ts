// Exercise library.
//
// Strength exercises: calories = (MET - 1) * bodyKg * hours  +  mechanical work / muscle efficiency.
//   - met: metabolic equivalent for the whole set+rest period (Compendium of Physical Activities ranges 3.0–6.0)
//   - rom: approximate distance the load travels per rep, in meters
//   - bodyFraction: for bodyweight moves, share of body weight lifted each rep
// Cardio exercises: calories = (MET - 1) * bodyKg * hours.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Group = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';

export const GROUPS: { key: Group; name: string; emoji: string; color: string }[] = [
  { key: 'chest', name: 'Chest', emoji: '🫁', color: '#E5484D' },
  { key: 'back', name: 'Back', emoji: '🔙', color: '#2F7BF5' },
  { key: 'legs', name: 'Legs', emoji: '🦵', color: '#1FA971' },
  { key: 'shoulders', name: 'Shoulders', emoji: '🤷', color: '#F5A623' },
  { key: 'arms', name: 'Arms', emoji: '💪', color: '#8B5CF6' },
  { key: 'core', name: 'Core', emoji: '🧱', color: '#14B8A6' },
  { key: 'cardio', name: 'Cardio', emoji: '🏃', color: '#FF6B2C' },
];

export const groupInfo = (g: Group) => GROUPS.find((x) => x.key === g)!;

export type StrengthExercise = {
  id: string;
  name: string;
  kind: 'strength';
  group: Group;
  met: number;
  rom: number;
  bodyFraction?: number; // set for bodyweight exercises (extra weight is added on top)
  custom?: boolean;
};

export type CardioExercise = {
  id: string;
  name: string;
  kind: 'cardio';
  group: 'cardio';
  met: number;
  custom?: boolean;
};

export type Exercise = StrengthExercise | CardioExercise;

const S = (id: string, name: string, group: Group, met: number, rom: number, bodyFraction?: number): StrengthExercise => ({
  id,
  name,
  kind: 'strength',
  group,
  met,
  rom,
  ...(bodyFraction !== undefined ? { bodyFraction } : {}),
});
const Cd = (id: string, name: string, met: number): CardioExercise => ({ id, name, kind: 'cardio', group: 'cardio', met });

export const EXERCISES: Exercise[] = [
  // Chest
  S('bench', 'Bench Press', 'chest', 4.0, 0.4),
  S('incline_bench', 'Incline Bench Press', 'chest', 4.0, 0.4),
  S('decline_bench', 'Decline Bench Press', 'chest', 4.0, 0.35),
  S('db_press', 'Dumbbell Chest Press', 'chest', 4.0, 0.4),
  S('incline_db_press', 'Incline Dumbbell Press', 'chest', 4.0, 0.4),
  S('chestfly', 'Chest Fly (dumbbell)', 'chest', 3.0, 0.4),
  S('cable_fly', 'Cable Fly / Crossover', 'chest', 3.0, 0.5),
  S('pec_deck', 'Pec Deck Machine', 'chest', 3.0, 0.4),
  S('chest_press_machine', 'Chest Press Machine', 'chest', 3.5, 0.4),
  S('pushup', 'Push-up', 'chest', 4.0, 0.35, 0.65),
  S('dips', 'Dips', 'chest', 4.5, 0.4, 0.9),

  // Back
  S('deadlift', 'Deadlift', 'back', 5.0, 0.55),
  S('rdl', 'Romanian Deadlift', 'back', 4.5, 0.45),
  S('row', 'Barbell Row', 'back', 4.0, 0.4),
  S('db_row', 'Dumbbell Row', 'back', 4.0, 0.4),
  S('cable_row', 'Seated Cable Row', 'back', 3.5, 0.5),
  S('tbar_row', 'T-Bar Row', 'back', 4.0, 0.4),
  S('pulldown', 'Lat Pulldown', 'back', 3.5, 0.5),
  S('pullup', 'Pull-up', 'back', 5.0, 0.5, 1.0),
  S('chinup', 'Chin-up', 'back', 5.0, 0.5, 1.0),
  S('straight_arm_pulldown', 'Straight-Arm Pulldown', 'back', 3.0, 0.6),
  S('back_ext', 'Back Extension', 'back', 3.0, 0.4, 0.5),
  S('shrug', 'Shrugs', 'back', 3.0, 0.1),

  // Legs
  S('squat', 'Squat', 'legs', 5.0, 0.6),
  S('front_squat', 'Front Squat', 'legs', 5.0, 0.6),
  S('goblet_squat', 'Goblet Squat', 'legs', 4.5, 0.55),
  S('legpress', 'Leg Press', 'legs', 4.5, 0.5),
  S('hack_squat', 'Hack Squat', 'legs', 4.5, 0.5),
  S('lunge', 'Lunges', 'legs', 4.5, 0.4, 0.7),
  S('bulgarian', 'Bulgarian Split Squat', 'legs', 4.5, 0.45, 0.7),
  S('step_up', 'Step-ups', 'legs', 4.5, 0.4, 0.8),
  S('legext', 'Leg Extension', 'legs', 3.0, 0.35),
  S('legcurl', 'Leg Curl', 'legs', 3.0, 0.35),
  S('hip_thrust', 'Hip Thrust', 'legs', 4.0, 0.35),
  S('glute_bridge', 'Glute Bridge', 'legs', 3.0, 0.3, 0.5),
  S('calf', 'Calf Raise', 'legs', 3.0, 0.1),
  S('seated_calf', 'Seated Calf Raise', 'legs', 3.0, 0.1),
  S('adductor', 'Hip Adductor / Abductor', 'legs', 3.0, 0.4),

  // Shoulders
  S('ohp', 'Overhead Press (barbell)', 'shoulders', 4.0, 0.5),
  S('db_shoulder_press', 'Dumbbell Shoulder Press', 'shoulders', 4.0, 0.45),
  S('arnold', 'Arnold Press', 'shoulders', 4.0, 0.45),
  S('shoulder_press_machine', 'Shoulder Press Machine', 'shoulders', 3.5, 0.45),
  S('lateral', 'Lateral Raise', 'shoulders', 3.0, 0.4),
  S('front_raise', 'Front Raise', 'shoulders', 3.0, 0.5),
  S('rear_delt', 'Rear Delt Fly', 'shoulders', 3.0, 0.4),
  S('face_pull', 'Face Pull', 'shoulders', 3.0, 0.5),
  S('upright_row', 'Upright Row', 'shoulders', 3.5, 0.4),

  // Arms
  S('curl', 'Barbell Curl', 'arms', 3.0, 0.35),
  S('db_curl', 'Dumbbell Curl', 'arms', 3.0, 0.35),
  S('hammer_curl', 'Hammer Curl', 'arms', 3.0, 0.35),
  S('preacher_curl', 'Preacher Curl', 'arms', 3.0, 0.3),
  S('cable_curl', 'Cable Curl', 'arms', 3.0, 0.4),
  S('triceps_pushdown', 'Triceps Pushdown', 'arms', 3.0, 0.4),
  S('skullcrusher', 'Skull Crusher', 'arms', 3.0, 0.35),
  S('overhead_triceps', 'Overhead Triceps Extension', 'arms', 3.0, 0.4),
  S('close_grip_bench', 'Close-Grip Bench Press', 'arms', 4.0, 0.4),
  S('triceps_dips', 'Bench Dips', 'arms', 3.5, 0.3, 0.6),
  S('wrist_curl', 'Wrist Curl', 'arms', 2.5, 0.1),

  // Core
  S('plank', 'Plank (hold)', 'core', 3.0, 0.0, 0.0),
  S('crunch', 'Crunches', 'core', 3.0, 0.2, 0.4),
  S('situp', 'Sit-ups', 'core', 3.5, 0.3, 0.5),
  S('leg_raise', 'Hanging Leg Raise', 'core', 4.0, 0.5, 0.35),
  S('lying_leg_raise', 'Lying Leg Raise', 'core', 3.0, 0.4, 0.35),
  S('russian_twist', 'Russian Twist', 'core', 3.0, 0.3),
  S('cable_crunch', 'Cable Crunch', 'core', 3.0, 0.3),
  S('ab_wheel', 'Ab Wheel Rollout', 'core', 4.0, 0.4, 0.5),
  S('mountain_climber', 'Mountain Climbers', 'core', 5.0, 0.2, 0.3),

  // Cardio
  Cd('run', 'Running (~10 km/h)', 9.8),
  Cd('jog', 'Jogging (~8 km/h)', 8.0),
  Cd('sprint', 'Sprints / Intervals', 12.0),
  Cd('treadmill_walk', 'Treadmill Walk (incline)', 5.0),
  Cd('cycle', 'Cycling (outdoor)', 7.5),
  Cd('bike_stat', 'Stationary Bike', 6.8),
  Cd('elliptical', 'Elliptical', 5.0),
  Cd('rowing', 'Rowing Machine', 7.0),
  Cd('stairs', 'Stair Climber', 9.0),
  Cd('swim', 'Swimming', 7.0),
  Cd('jumprope', 'Jump Rope', 11.0),
  Cd('hiit', 'HIIT / Circuit', 8.0),
  Cd('burpees', 'Burpees', 8.0),
  Cd('sports', 'Sports (basketball, soccer…)', 7.0),
  Cd('hike', 'Hiking', 6.0),
  Cd('yoga', 'Yoga / Stretching', 2.5),
];

// ---------- user-added exercises ----------

const CUSTOM_KEY = 'custom_exercises';
let customCache: Exercise[] = [];

export async function loadCustomExercises(): Promise<Exercise[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_KEY);
  customCache = raw ? JSON.parse(raw) : [];
  return customCache;
}

export async function addCustomExercise(name: string, group: Group): Promise<Exercise> {
  const id = `custom_${Date.now()}`;
  const ex: Exercise =
    group === 'cardio'
      ? { id, name, kind: 'cardio', group, met: 6.0, custom: true }
      : { id, name, kind: 'strength', group, met: 3.5, rom: 0.4, custom: true };
  customCache = [...customCache, ex];
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(customCache));
  return ex;
}

export async function removeCustomExercise(id: string): Promise<void> {
  customCache = customCache.filter((e) => e.id !== id);
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(customCache));
}

export const allExercises = (): Exercise[] => [...EXERCISES, ...customCache];

export function findExercise(id: string): Exercise | undefined {
  return allExercises().find((e) => e.id === id);
}

/** Body-part group for a logged entry (falls back by exercise id, then to 'chest' for unknown legacy ids). */
export function groupOf(exerciseId: string): Group {
  return findExercise(exerciseId)?.group ?? (exerciseId === 'other_strength' ? 'arms' : 'cardio');
}
