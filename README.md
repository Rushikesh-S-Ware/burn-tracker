# 🔥 Burn Tracker

**An offline workout, step and calorie tracker. No account, no ads, no internet — your data never leaves your phone.**

Log every set you lift, your daily steps and your body weight, and see how many calories you actually burned each day — resting, walking and lifting combined.

| | |
|---|---|
| 📱 **Android app** | [Download APK (v1.0.0)](https://github.com/Rushikesh-S-Ware/burn-tracker/releases/latest/download/burn-tracker-v1.0.0.apk) |
| 🌐 **Web app** (iPhone, desktop) | **https://rushikesh-s-ware.github.io/burn-tracker/** — open in Safari → Share → *Add to Home Screen* |
| 💻 **Source** | https://github.com/Rushikesh-S-Ware/burn-tracker |

> Android will warn that the app comes from an unknown developer. That's because it isn't on the Play Store yet — tap **More details → Install anyway**.

---

## Features

**Workout logging**
- Exercises grouped by body part (Chest, Back, Legs, Shoulders, Arms, Core, Cardio) — ~80 built in, plus your own
- Every set logged individually: weight, reps and the rest you actually took
- "Last time" hint when you open an exercise, so you know what to beat
- Rest timer that records real rest time, with +15s / +30s adjustments
- **Lock-screen controls** (Android): finish a set, start the next one and get an alarm when rest is over — without unlocking the phone

**Calories**
- Resting burn from the Mifflin-St Jeor equation
- Lifting burn from MET values *plus* the mechanical work of moving the weight (heavier = more calories)
- Walking burn from steps, using your height for stride length
- Optional "calories eaten" to see your daily surplus or deficit

**Progress & history**
- Daily step and active-calorie goals with progress rings, streaks and celebrations
- Weekly weigh-ins with a trend chart and goal-weight progress
- Custom goals for anything ("Bench 100 kg", "Run 5 km", "Water 3 L")
- Calendar view — coloured dots show which body parts you trained each day; tap a day for full details
- Weekly balance ("Chest 2×, Legs 1×, Back 0× — last trained 9 days ago")

**Everything else**
- Light / dark / system theme
- Backup & restore as a single file (save it to Google Drive, iCloud, anywhere)
- CSV export of every set for Google Sheets / Excel
- 100% offline — the app has no server and sends nothing anywhere

## How calories are estimated

| Part | Formula |
|---|---|
| Resting (BMR) | Mifflin-St Jeor: `10·kg + 6.25·cm − 5·age (+5 male / −161 female)` |
| Strength | `(MET − 1) · kg · hours` for the set-and-rest period + `load · g · range-of-motion · reps ÷ 4184 ÷ 20 % efficiency` |
| Cardio | `(MET − 1) · kg · hours` |
| Walking | `0.5 kcal · kg · km`, stride ≈ `0.415 · height` |

MET values come from the *Compendium of Physical Activities*. These are estimates — useful for trends, not lab-grade.

## Tech

- [Expo](https://expo.dev) SDK 57 / React Native / TypeScript
- `AsyncStorage` for all data (on-device only)
- `expo-notifications` + `expo-task-manager` for lock-screen controls
- `expo-sensors` pedometer for live step counting
- `react-native-svg` for charts and progress rings
- Web build is a PWA (manifest + service worker) deployed to GitHub Pages by GitHub Actions on every push

## Project structure

```
App.tsx                  tabs, startup, notification wiring
src/
  calc.ts                calorie maths
  exercises.ts           exercise library + user-added exercises
  storage.ts             everything saved on the device
  workout.ts             in-progress workout, rest timer, lock-screen notifications
  backup.ts              backup / restore / CSV export
  theme.tsx, ui.tsx      colours, dark mode, shared components
  screens/               Today, Log (+ ExercisePicker), Progress, History, Profile
scripts/build-web.mjs    builds the installable web version
.github/workflows/       deploys the web app to GitHub Pages
```

## Run it yourself

```bash
npm install
npx expo start          # scan the QR code with Expo Go (lock-screen buttons need a real build)
```

Build an Android APK in the cloud (free Expo account):

```bash
npx eas-cli@latest build -p android --profile preview
```

Build the web version:

```bash
# PowerShell:  $env:WEB_BASE_URL='/burn-tracker'; node scripts/build-web.mjs
WEB_BASE_URL=/burn-tracker node scripts/build-web.mjs
```

## Privacy

There is no server, no analytics and no account. All data is stored on your device and only leaves it when *you* tap Backup or Export. The Android build requests two permissions: **Physical activity** (step counting) and **Notifications** (rest timer).

## Roadmap / ideas

- Health Connect / Apple Health sync for automatic step counts
- Google Play release
- Exercise personal records and charts

---

Built for fun by [Rushikesh Ware](https://github.com/Rushikesh-S-Ware).
