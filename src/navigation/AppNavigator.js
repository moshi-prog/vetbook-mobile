/**
 * AppNavigator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Root navigation controller (conditional authentication)
 *
 * A single root stack renders EITHER the authenticated group OR the
 * unauthenticated group based on `isAuthenticated` (token AND user).
 * BottomTabs exists ONLY in the authenticated group, so a logged-out or
 * corrupt session can never display tab screens (e.g. "VetBook User").
 *
 * The splash is shown once on cold launch (local timer + session loading
 * guard). AppNavigator is never remounted on logout, so the splash does not
 * delay the transition to Login.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';
import { navigationRef } from './navigationRef';

// ── Screen imports ────────────────────────────────────────────────────────────
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import AddPetScreen from '../screens/AddPetScreen';
import PetDetailsScreen from '../screens/PetDetailsScreen';
import BookAppointmentScreen from '../screens/BookAppointmentScreen';
import AppointmentConfirmationScreen from '../screens/AppointmentConfirmationScreen';
import BottomTabs from './BottomTabs';

const Stack = createStackNavigator();

const SPLASH_MS = 2000;

const AppNavigator = ({ onLayout }) => {
  const { loading, isAuthenticated } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  // Cold-launch splash only
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (loading || showSplash) {
    return (
      <View style={styles.loadingContainer} onLayout={onLayout}>
        <SplashScreen />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="MainTabs" component={BottomTabs} />
            <Stack.Screen name="Main" component={BottomTabs} />
            <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
            <Stack.Screen name="AddPet" component={AddPetScreen} />
            <Stack.Screen name="PetDetails" component={PetDetailsScreen} />
            <Stack.Screen name="AppointmentConfirmation" component={AppointmentConfirmationScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

export default AppNavigator;
