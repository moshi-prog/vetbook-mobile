/**
 * BottomTabs.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Main bottom tab navigator
 *
 * Tabs: Home | Pets | Bookings | Chat | Profile
 *
 * Uses a custom tab bar so the active tab renders as a green pill with a white
 * icon + label, while inactive tabs are gray. Stack-only screens (BookAppointment,
 * AddPet, PetDetails, AppointmentConfirmation) live in MainStack, outside these
 * tabs, so the bar is hidden on them.
 *
 * The bar hides itself while the keyboard is open (matters for the Chat input).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Keyboard } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import MyPetsScreen from '../screens/MyPetsScreen';
import MyAppointmentsScreen from '../screens/MyAppointmentsScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const BAR_HEIGHT = 60;

const TAB_CONFIG = {
  Home:     { label: 'Home',     icon: 'home',                  iconOutline: 'home-outline' },
  Pets:     { label: 'Pets',     icon: 'paw',                   iconOutline: 'paw-outline' },
  Bookings: { label: 'Bookings', icon: 'calendar',              iconOutline: 'calendar-outline' },
  Chat:     { label: 'Chat',     icon: 'chatbubble-ellipses',   iconOutline: 'chatbubble-ellipses-outline' },
  Profile:  { label: 'Profile',  icon: 'person',                iconOutline: 'person-outline' },
};

// ─── Custom tab bar ──────────────────────────────────────────────────────────

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  const bottomPad = Math.max(insets.bottom, spacing.sm);

  return (
    <View style={[styles.bar, { height: BAR_HEIGHT + bottomPad, paddingBottom: bottomPad }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const cfg = TAB_CONFIG[route.name] ?? TAB_CONFIG.Home;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? cfg.label}
          >
            <View style={[styles.pill, focused && styles.pillActive]}>
              <Ionicons
                name={focused ? cfg.icon : cfg.iconOutline}
                size={20}
                color={focused ? colors.white : colors.textMuted}
              />
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {cfg.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ─── Navigator ───────────────────────────────────────────────────────────────

const BottomTabs = () => (
  <Tab.Navigator
    initialRouteName="Home"
    tabBar={(props) => <CustomTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="Home"     component={HomeScreen} />
    <Tab.Screen name="Pets"     component={MyPetsScreen} />
    <Tab.Screen name="Bookings" component={MyAppointmentsScreen} />
    <Tab.Screen name="Chat"     component={ChatbotScreen} />
    <Tab.Screen name="Profile"  component={ProfileScreen} />
  </Tab.Navigator>
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.navBackground, // white
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.lg,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  labelActive: {
    color: colors.white,
  },
});

export default BottomTabs;
