import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { Gender } from '../services/LibraryService';
import { useLibrary } from '../hooks/useLibrary';

type RootStackParamList = { Main: undefined };

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

/**
 * One-time profile capture, shown after Get Started.
 *
 * Deliberately minimal and entirely local: a name to personalise the greeting
 * and an optional gender. Neither is required -- an empty name simply falls
 * back to the generic greeting, and gender defaults to 'Prefer not to say'.
 */
export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { saveProfile } = useLibrary();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');

  const finish = () => {
    Keyboard.dismiss();
    saveProfile({ name: name.trim(), gender, completed: true });
    navigation.replace('Main');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { paddingTop: insets.top + SIZES.xxl }]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>ONE LAST THING</Text>
          <Text style={styles.title}>Who's listening?</Text>
          <Text style={styles.subtitle}>
            Stays on this device. You can leave anything blank.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.muted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={finish}
            maxLength={40}
          />

          <Text style={[styles.label, styles.labelSpaced]}>GENDER</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((option) => {
              const active = gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.genderPill, active && styles.genderPillActive]}
                  activeOpacity={0.8}
                  onPress={() => setGender(option.value)}
                >
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + SIZES.xl }]}>
          <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={finish}>
            <Text style={styles.buttonText}>
              {name.trim() ? `Continue as ${name.trim()}` : 'Continue'}
            </Text>
            <View style={styles.iconCircle}>
              <ArrowRight color={COLORS.text.primary} size={20} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SIZES.lg,
  },
  header: {
    marginBottom: SIZES.xxl,
  },
  kicker: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 3,
    color: COLORS.text.muted,
    marginBottom: SIZES.md,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 34,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
  form: {
    flex: 1,
  },
  label: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  labelSpaced: {
    marginTop: SIZES.xl,
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.md,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  genderPill: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
    borderRadius: SIZES.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceRaised,
  },
  genderPillActive: {
    backgroundColor: COLORS.text.primary,
    borderColor: COLORS.text.primary,
  },
  genderText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  genderTextActive: {
    color: COLORS.background,
  },
  footer: {
    paddingTop: SIZES.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.pill,
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.lg,
  },
  buttonText: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
