// Alert.alert does nothing in a browser, so the web build falls back to window.confirm/alert.
import { Alert as RNAlert, AlertButton, Platform } from 'react-native';

function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const actionable = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actionable.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const ok = window.confirm(`${text}\n\n[OK = ${actionable[actionable.length - 1].text ?? 'OK'}]`);
  const chosen = ok ? actionable[actionable.length - 1] : (buttons ?? []).find((b) => b.style === 'cancel');
  chosen?.onPress?.();
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS === 'web') return webAlert(title, message, buttons);
    RNAlert.alert(title, message, buttons);
  },
};
