import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useShareIntentHandler } from '../services/shareIntent';
import { preloadRewardedAd } from '../services/admob';
import { clearAllPollers } from '../services/downloadQueue';
import { AppState } from 'react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Handle incoming share intents (auto-download when URL shared from other apps)
  useShareIntentHandler();

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      // Preload first rewarded ad so it's ready when needed
      preloadRewardedAd();
    }
  }, [loaded]);

  // Clean up all pollers when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        clearAllPollers();
      }
    });
    return () => subscription.remove();
  }, []);

  if (!loaded) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0F' },
          animation: 'slide_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}
