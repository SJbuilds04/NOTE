import React, { useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { PlayerProvider } from './src/hooks/usePlayer';
import { LibraryProvider } from './src/hooks/useLibrary';
import { COLORS } from './src/constants/theme';
import { getPlatformInfo, isNoteNativeAvailable } from './modules/note-native';

export default function App() {
  // Proof-of-connection for the Android native module. Dev-only, no UI impact.
  useEffect(() => {
    if (__DEV__) {
      console.log(
        '[NoteNative] available:',
        isNoteNativeAvailable(),
        'getPlatformInfo():',
        getPlatformInfo()
      );
    }
  }, []);

  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <PlayerProvider>
          <View style={styles.webWrapper}>
            <View style={styles.appContainer}>
              <RootNavigator />
              <StatusBar style="light" />
            </View>
          </View>
        </PlayerProvider>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: '#000000', // Darker background for the empty space on desktop
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
    maxHeight: Platform.OS === 'web' ? 900 : '100%',
    backgroundColor: COLORS.background,
    overflow: 'hidden',
    // Add subtle borders and rounded corners to look like a phone screen on Web
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Platform.OS === 'web' ? 40 : 0,
  }
});
