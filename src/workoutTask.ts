// Must be imported from index.ts: background tasks have to be defined at the top level.
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { handleNotificationAction } from './workout';

export const WORKOUT_TASK = 'workout-notification-actions';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(WORKOUT_TASK, async ({ data, error }) => {
  if (error || !data || !('actionIdentifier' in data)) return;
  await handleNotificationAction(data);
});

export async function registerWorkoutTask() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.registerTaskAsync(WORKOUT_TASK);
  } catch (e) {
    // Not available in some environments (e.g. Expo Go); taps are then handled when the app is running.
    console.warn('background task unavailable', e);
  }
}
