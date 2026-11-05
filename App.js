/**
 * App.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook Mobile — Application entry point
 *
 * Responsibilities:
 *  1. Load all custom fonts (Literata + Nunito Sans) via expo-font
 *  2. Hold the native splash screen open until fonts are ready, then hide it
 *  3. Wrap the entire app in <AuthProvider> for global auth state
 *  4. Render <AppNavigator> which drives all routing
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ── Literata (heading font) ────────────────────────────────────────────────
import {
  Literata_600SemiBold,
  Literata_700Bold,
} from '@expo-google-fonts/literata';

// ── Nunito Sans (body font) ───────────────────────────────────────────────
import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';

// ── App-level providers & navigator ──────────────────────────────────────
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';

// Keep the native splash screen visible while fonts are fetched.
// It will be dismissed inside onLayoutRootView once fontsLoaded === true.
SplashScreen.preventAutoHideAsync();

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // Load all font variants used in theme.js
  const [fontsLoaded] = useFonts({
    Literata_600SemiBold,
    Literata_700Bold,
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  /**
   * Called once the root <View> has been laid out (i.e. React is ready to
   * paint). At that point we hide the native splash screen so the transition
   * feels seamless — the JS SplashScreen we built will be visible underneath.
   *
   * We pass this as the `onLayout` prop into AppNavigator, which forwards it
   * to NavigationContainer's `onReady` callback.
   */
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Don't render anything until fonts are available.
  // The native splash screen stays visible during this time.
  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          {/* Dark-content status bar to match the #FAF6F0 cream background */}
          <StatusBar style="dark" />
          <AppNavigator onLayout={onLayoutRootView} />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
