/**
 * dialogs.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-platform dialog helpers.
 *
 * react-native-web's Alert.alert() is a no-op, so confirmations such as
 * "Cancel appointment?" or "Log out?" would silently do nothing when the app
 * runs in a browser. These helpers use Alert on iOS/Android and the browser's
 * native dialogs on web.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Alert, Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/** Simple informational dialog. */
export const showAlert = (title, message) => {
  if (isWeb) {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
};

/** Two-button confirmation. Runs onConfirm only if the user accepts. */
export const confirmAction = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}) => {
  if (isWeb) {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm?.();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};

/** Pick one of several string options (keep to 2 options for Android's 3-button limit). */
export const chooseOption = ({ title, message, options, onSelect }) => {
  if (isWeb) {
    const list = options.map((o, i) => `${i + 1}) ${o}`).join('\n');
    const answer = window.prompt(`${title}\n${message ?? ''}\n\n${list}`, '1');
    const picked = options[Number(answer) - 1];
    if (picked) onSelect?.(picked);
    return;
  }
  Alert.alert(title, message, [
    ...options.map((o) => ({ text: o, onPress: () => onSelect?.(o) })),
    { text: 'Cancel', style: 'cancel' },
  ]);
};
