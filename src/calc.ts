import { Exercise } from './exercises';

export type Sex = 'male' | 'female';
export type Units = 'kg' | 'lb';

export type Profile = {
  name: string;
  bodyKg: number;
  goalWeightKg?: number;
  stepGoal: number; // steps per day
  activeGoal: number; // active kcal per day (workouts + walking)
  heightCm: number;
  age: number;
  sex: Sex;
  units: Units;
  restSeconds: number; // rest between sets
};

export const DEFAULT_PROFILE: Profile = {
  name: '',
  bodyKg: 75,
  stepGoal: 8000,
  activeGoal: 400,
  heightCm: 175,
  age: 25,
  sex: 'male',
  units: 'kg',
  restSeconds: 90,
};

export const LB_PER_KG = 2.20462;
export const toKg = (v: number, units: Units) => (units === 'lb' ? v / LB_PER_KG : v);
export const fromKg = (kg: number, units: Units) => (units === 'lb' ? kg * LB_PER_KG : kg);

const SECONDS_PER_REP = 3;
const MUSCLE_EFFICIENCY = 0.2; // ~20% of energy becomes mechanical work
const JOULES_PER_KCAL = 4184;
const G = 9.81;

/** Resting calories for the whole day (Mifflin-St Jeor). */
export function bmr(p: Profile): number {
  const base = 10 * p.bodyKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

/** One performed set. restSec = rest taken AFTER this set (undefined = profile default). */
export type SetRec = { reps: number; weightKg: number; restSec?: number };

/** Minutes a list of sets took: rep time + rest between sets (rest after the last set is ignored). */
export function setsMinutes(sets: SetRec[], defaultRest: number): number {
  const work = sets.reduce((t, s) => t + s.reps * SECONDS_PER_REP, 0);
  const rest = sets.slice(0, -1).reduce((t, s) => t + (s.restSec ?? defaultRest), 0);
  return (work + rest) / 60;
}

/** Active calories (on top of resting) for a strength exercise done as individual sets. */
export function setsKcal(ex: Exercise, p: Profile, sets: SetRec[], minutesOverride?: number): number {
  if (ex.kind !== 'strength' || sets.length === 0) return 0;
  const minutes = minutesOverride && minutesOverride > 0 ? minutesOverride : setsMinutes(sets, p.restSeconds);
  const metabolic = (ex.met - 1) * p.bodyKg * (minutes / 60);
  const joules = sets.reduce(
    (t, s) => t + (s.weightKg + (ex.bodyFraction ?? 0) * p.bodyKg) * G * ex.rom * s.reps,
    0,
  );
  return Math.max(0, metabolic + joules / JOULES_PER_KCAL / MUSCLE_EFFICIENCY);
}

/** Active calories (on top of resting) for a cardio exercise. */
export function cardioKcal(ex: Exercise, p: Profile, minutes: number): number {
  return Math.max(0, (ex.met - 1) * p.bodyKg * (minutes / 60));
}

/** Step length estimate from height (meters). */
export const stepLengthM = (p: Profile) => (p.heightCm * 0.415) / 100;

export const stepsToKm = (steps: number, p: Profile) => (steps * stepLengthM(p)) / 1000;

/** Net walking cost ≈ 0.5 kcal per kg per km (ACSM walking equation, ~5 km/h). */
export function walkingKcal(steps: number, p: Profile): number {
  return 0.5 * p.bodyKg * stepsToKm(steps, p);
}
