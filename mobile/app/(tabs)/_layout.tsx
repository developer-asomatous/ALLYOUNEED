import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { Colors, Shadows } from '../../constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabBarIcon({ name, color, focused }: { name: IoniconsName; color: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconActive]}>
      <Ionicons name={name} size={21} color={focused ? Colors.accent.primary : color} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.dock,
        tabBarBackground: () => (
          <View style={styles.dockBg}>
            <View style={styles.dockInner} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'folder' : 'folder-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="farm"
        options={{
          title: 'Earn',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'leaf' : 'leaf-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'cog' : 'cog-outline'} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 22,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    ...Shadows.dock,
  },
  dockBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: 'hidden',
  },
  dockInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg.glass,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border.glass,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
    marginBottom: Platform.OS === 'ios' ? 0 : 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 30,
    marginTop: Platform.OS === 'ios' ? 6 : 4,
  },
  iconActive: {
    // Subtle scale handled by icon color change
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
    marginTop: 2,
  },
});
