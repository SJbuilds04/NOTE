import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { COLORS } from '../constants/theme';
import OnboardingScreen from '../screens/Onboarding';
import NowPlayingScreen from '../screens/NowPlaying';

const Stack = createNativeStackNavigator();

const NoteTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    text: COLORS.text.primary,
  },
};

export const RootNavigator = () => {
  return (
    <NavigationContainer theme={NoteTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Onboarding">
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen 
          name="NowPlaying" 
          component={NowPlayingScreen} 
          options={{ presentation: 'fullScreenModal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
