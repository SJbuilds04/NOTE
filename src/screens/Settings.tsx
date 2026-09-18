import React, { useCallback, useState } from 'react';
import {
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink, User } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Gender } from '../services/LibraryService';
import { useLibrary } from '../hooks/useLibrary';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const REPO_URL = 'https://github.com/SJbuilds04/NOTE';
const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.en.html';
const NEWPIPE_URL = 'https://github.com/TeamNewPipe/NewPipeExtractor';

/**
 * Settings, profile and the legal notices.
 *
 * NØTE is GPL-3.0-or-later because it links the NewPipe Extractor, and that
 * licence expects the terms and the upstream attribution to be discoverable
 * from the app itself rather than only in the repository. This screen is where
 * they live.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { profile, saveProfile, history, playlists, liked } = useLibrary();

  const [name, setName] = useState(profile.name);

  const version =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';

  const commitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed !== profile.name) saveProfile({ name: trimmed });
    Keyboard.dismiss();
  }, [name, profile.name, saveProfile]);

  const open = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.sm }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Profile ---- */}
        <Text style={styles.sectionLabel}>PROFILE</Text>

        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <User color={COLORS.text.secondary} size={28} />
            </View>
            <View style={styles.avatarText}>
              <Text style={styles.avatarName} numberOfLines={1}>
                {profile.name || 'No name set'}
              </Text>
              <Text style={styles.avatarMeta}>
                {GENDERS.find((g) => g.value === profile.gender)?.label}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.muted}
            returnKeyType="done"
            maxLength={40}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>GENDER</Text>
          <View style={styles.pillRow}>
            {GENDERS.map((option) => {
              const active = profile.gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pill, active && styles.pillActive]}
                  activeOpacity={0.8}
                  onPress={() => saveProfile({ gender: option.value })}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ---- Library stats ---- */}
        <Text style={styles.sectionLabel}>YOUR LIBRARY</Text>
        <View style={styles.card}>
          <View style={styles.statsRow}>
            <Stat value={liked.length} label="Liked" />
            <Stat value={playlists.length} label="Playlists" />
            <Stat value={history.length} label="Listens" />
          </View>
        </View>

        {/* ---- About ---- */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Row label="Version" value={`${version}`} />
          <Divider />
          <Row label="Made by" value="SJBUILDS" />
          <Divider />
          <LinkRow label="Source code" onPress={() => open(REPO_URL)} />
        </View>

        {/* ---- Legal ---- */}
        <Text style={styles.sectionLabel}>LICENCE</Text>
        <View style={styles.card}>
          <Text style={styles.legalTitle}>NØTE</Text>
          <Text style={styles.legalBody}>
            Copyright © 2026 Sanyam Jain.{'\n\n'}
            This program is free software: you can redistribute it and/or modify it
            under the terms of the GNU General Public License as published by the
            Free Software Foundation, either version 3 of the License, or (at your
            option) any later version.{'\n\n'}
            This program is distributed in the hope that it will be useful, but
            WITHOUT ANY WARRANTY; without even the implied warranty of
            MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
          </Text>
          <LinkRow label="Read GPL-3.0" onPress={() => open(GPL_URL)} />
        </View>

        <Text style={styles.sectionLabel}>THIRD-PARTY</Text>
        <View style={styles.card}>
          <Text style={styles.legalTitle}>NewPipe Extractor</Text>
          <Text style={styles.legalBody}>
            Copyright © Team NewPipe and contributors, licensed GPL-3.0-or-later.
            {'\n\n'}
            NØTE uses it, unmodified, to resolve playable audio. No NewPipe source
            is included in this app, and linking it is why NØTE carries the same
            licence.
          </Text>
          <LinkRow label="NewPipeExtractor on GitHub" onPress={() => open(NEWPIPE_URL)} />
        </View>

        <Text style={styles.footer}>MADE BY SJBUILDS</Text>
      </ScrollView>
    </View>
  );
}

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const LinkRow: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
    <Text style={styles.rowLink}>{label}</Text>
    <ExternalLink color={COLORS.text.secondary} size={16} />
  </TouchableOpacity>
);

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    color: COLORS.text.primary,
  },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2.5,
    color: COLORS.text.muted,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
    marginHorizontal: SIZES.md,
  },
  card: {
    marginHorizontal: SIZES.md,
    padding: SIZES.md,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    marginBottom: SIZES.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  avatarText: {
    flex: 1,
  },
  avatarName: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
  },
  avatarMeta: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  fieldLabelSpaced: {
    marginTop: SIZES.lg,
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  pill: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceLight,
  },
  pillActive: {
    backgroundColor: COLORS.text.primary,
    borderColor: COLORS.text.primary,
  },
  pillText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  pillTextActive: {
    color: COLORS.background,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text.primary,
  },
  statLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SIZES.sm + 2,
  },
  rowLabel: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text.secondary,
  },
  rowValue: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  rowLink: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
  },
  legalTitle: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  legalBody: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text.secondary,
    marginBottom: SIZES.sm,
  },
  footer: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 3,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SIZES.xxl,
  },
});
