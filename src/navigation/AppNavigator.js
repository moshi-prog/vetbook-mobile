/**
 * AppNavigator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Root navigation controller
 *
 * Routing logic:
 *  1. auth.loading  → full-screen ActivityIndicator (fonts + session loading)
 *  2. isAuthenticated === true  → MainStack  (MainTabs + full-screen stack screens)
 *  3. isAuthenticated === false → AuthStack  (Splash → Login → Register)
 *
 * The two stacks are kept separate so React Navigation never shows the
 * back-arrow from Home into Login, and vice-versa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../contexts/AuthContext';
import { colors, fonts, fontSizes, spacing } from '../theme';
import { navigationRef } from './navigationRef';

// ── Screen imports ────────────────────────────────────────────────────────────
import SplashScreen   from '../screens/SplashScreen';
import LoginScreen    from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import AddPetScreen   from '../screens/AddPetScreen';
import PetDetailsScreen from '../screens/PetDetailsScreen';
import BookAppointmentScreen from '../screens/BookAppointmentScreen';
import AppointmentConfirmationScreen from '../screens/AppointmentConfirmationScreen';
import BottomTabs from './BottomTabs';

// ─── Stack instance ───────────────────────────────────────────────────────────
const Stack = createStackNavigator();

// ─────────────────────────────────────────────────────────────────────────────
// Auth Stack — unauthenticated users
// Splash auto-navigates to Login; Login can push Register.
// ─────────────────────────────────────────────────────────────────────────────
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Splash"    component={SplashScreen} />
    <Stack.Screen name="Login"     component={LoginScreen} />
    <Stack.Screen name="Register"  component={RegisterScreen} />
    <Stack.Screen name="Main"      component={BottomTabs} />
    <Stack.Screen name="MainTabs"  component={BottomTabs} />
  </Stack.Navigator>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Stack — authenticated users
// MainTabs hosts the 5 bottom-tab screens (Home, Pets, Bookings, Chat, Profile).
// The other screens sit on the stack ABOVE the tabs, so no tab bar is shown.
// ─────────────────────────────────────────────────────────────────────────────
const MainStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={BottomTabs} />
    <Stack.Screen name="Main"     component={BottomTabs} />
    <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
    <Stack.Screen name="AddPet" component={AddPetScreen} />
    <Stack.Screen name="PetDetails" component={PetDetailsScreen} />
    <Stack.Screen name="AppointmentConfirmation" component={AppointmentConfirmationScreen} />
  </Stack.Navigator>
);

// ─────────────────────────────────────────────────────────────────────────────
// AppNavigator — root component consumed by App.js
// ─────────────────────────────────────────────────────────────────────────────
const AppNavigator = ({ onLayout }) => {
  const { loading, isAuthenticated } = useAuth();

  // ── Loading guard: session restoration + font loading ─────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer} onLayout={onLayout}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={onLayout}>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Full-screen loading state ────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,   // #FAF6F0
  },
});

export default AppNavigator;
