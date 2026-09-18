import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  Main: undefined;
  ProfileSetup: undefined;
};

export default function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      {/* Abstract Background Elements */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />
      
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />

      <LinearGradient
        colors={['transparent', COLORS.background]}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.subtitleTop}>MUSIC</Text>
          <Text style={styles.subtitleTop}>BEYOND</Text>
          <Text style={styles.subtitleTop}>NOISE</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.title}>N Ø T E</Text>
          <Text style={styles.tagline}>YOUR MUSIC. YOUR WAY.</Text>
        </View>

        <View style={styles.bottomContent}>
          <TouchableOpacity 
            style={styles.button}
            activeOpacity={0.8}
            onPress={() => navigation.replace('ProfileSetup')}
          >
            <Text style={styles.buttonText}>Get Started</Text>
            <View style={styles.iconCircle}>
              <ArrowRight color={COLORS.text.primary} size={20} />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.footerText}>LISTEN FREELY.</Text>
          <Text style={styles.footerText}>LIVE FULLY.</Text>
          <Text style={styles.madeBy}>MADE BY SJBUILDS</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  blob1: {
    position: 'absolute',
    top: height * 0.1,
    left: -width * 0.2,
    width: width,
    height: width,
    borderRadius: width / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  blob2: {
    position: 'absolute',
    top: height * 0.3,
    right: -width * 0.3,
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    flex: 1,
    padding: SIZES.xl,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'flex-start',
  },
  subtitleTop: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },
  centerContent: {
    alignItems: 'center',
  },
  title: {
    fontFamily: FONTS.regular,
    fontSize: 48,
    letterSpacing: 12,
    color: COLORS.text.primary,
    marginBottom: SIZES.md,
  },
  tagline: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 3,
    color: COLORS.text.secondary,
  },
  bottomContent: {
    alignItems: 'center',
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.pill,
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.xl,
    width: '100%',
    marginBottom: SIZES.xl,
  },
  buttonText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  madeBy: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 3,
    color: COLORS.text.muted,
    marginTop: SIZES.md,
    opacity: 0.8,
  },
  footerText: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    lineHeight: 16,
  }
});
