import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, Trash2 } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Pill } from '../components/common/Pill';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { Playlist, Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type LibraryStackParams = {
  Playlist: { playlistId: string };
  NowPlaying: undefined;
};

const FILTERS = ['Playlists', 'Artists', 'Albums', 'Downloaded'];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams>>();
  const [activeFilter, setActiveFilter] = useState('Playlists');
  const { playTrack, currentTrack, isPlaying, togglePlayPause, isLoading } = usePlayer();
  const {
    playlists,
    likedPlaylist,
    liked,
    recentlyPlayed,
    importPlaylist,
    importing,
    importError,
    clearImportError,
    deletePlaylist,
    touchPlaylist,
    createPlaylist,
  } = useLibrary();

  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  /** Playlists have their own page, so a tap navigates rather than expanding. */
  const openPlaylist = useCallback(
    (playlist: Playlist) => {
      touchPlaylist(playlist.id);
      navigation.navigate('Playlist', { playlistId: playlist.id });
    },
    [navigation, touchPlaylist]
  );

  // "Liked Songs" always leads, then the user's own and imported playlists.
  const allPlaylists = useMemo<Playlist[]>(
    () => [
      likedPlaylist,
      // Most recently opened or changed first, so recents read as playlists.
      ...[...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    ],
    [likedPlaylist, playlists]
  );

  /** Artists and albums are derived from what is actually in the library. */
  const derived = useMemo(() => {
    const tracks = [...liked, ...playlists.flatMap((p) => p.tracks), ...recentlyPlayed];

    const artists = new Map<string, { name: string; image: string; count: number }>();
    const albums = new Map<string, { name: string; artist: string; image: string; count: number }>();

    for (const t of tracks) {
      const a = artists.get(t.artist.name);
      if (a) a.count++;
      else artists.set(t.artist.name, { name: t.artist.name, image: t.albumImageUrl, count: 1 });

      if (t.album) {
        const al = albums.get(t.album);
        if (al) al.count++;
        else
          albums.set(t.album, {
            name: t.album,
            artist: t.artist.name,
            image: t.albumImageUrl,
            count: 1,
          });
      }
    }

    return {
      artists: [...artists.values()].sort((x, y) => y.count - x.count),
      albums: [...albums.values()].sort((x, y) => y.count - x.count),
    };
  }, [liked, playlists, recentlyPlayed]);


  const onPlayPlaylist = (playlist: Playlist) => {
    if (!playlist.tracks.length) return;
    playTrack(playlist.tracks[0], { tracks: playlist.tracks, label: playlist.name });
  };

  /** Create an empty playlist, then open its page so it can be filled. */
  const onCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    const playlist = createPlaylist(name);
    setNewPlaylistName('');
    setShowImport(false);
    Keyboard.dismiss();
    navigation.navigate('Playlist', { playlistId: playlist.id });
  };

  const onImport = async () => {
    const url = importUrl.trim();
    if (!url) return;

    try {
      await importPlaylist(url);
      setImportUrl('');
      setShowImport(false);
    } catch {
      // importError is rendered inline below.
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SIZES.lg, paddingBottom: SIZES.bottomInset }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Library</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setShowImport((v) => !v);
              clearImportError();
            }}
          >
            {showImport ? (
              <X color={COLORS.text.primary} size={24} />
            ) : (
              <Plus color={COLORS.text.primary} size={24} />
            )}
          </TouchableOpacity>
        </View>

        {showImport && (
          <GlassCard intensity={20} style={styles.importCard}>
            <Text style={styles.importTitle}>New playlist</Text>
            <View style={styles.importRow}>
              <TextInput
                style={styles.importInput}
                placeholder="Playlist name"
                placeholderTextColor={COLORS.text.muted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                onSubmitEditing={onCreatePlaylist}
                returnKeyType="done"
                maxLength={60}
              />
              <TouchableOpacity
                style={[
                  styles.importButton,
                  !newPlaylistName.trim() && styles.importButtonDisabled,
                ]}
                onPress={onCreatePlaylist}
                disabled={!newPlaylistName.trim()}
              >
                <Text style={styles.importButtonText}>Create</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panelDivider} />

            <Text style={styles.importTitle}>Import a public playlist</Text>
            <View style={styles.importRow}>
              <TextInput
                style={styles.importInput}
                placeholder="Paste a playlist or album link"
                placeholderTextColor={COLORS.text.muted}
                value={importUrl}
                onChangeText={setImportUrl}
                onSubmitEditing={onImport}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.importButton}
                onPress={onImport}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.importButtonText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
            {importError && <Text style={styles.importError}>{importError}</Text>}
          </GlassCard>
        )}

        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTERS.map(filter => (
              <Pill
                key={filter}
                label={filter}
                isActive={activeFilter === filter}
                onPress={() => setActiveFilter(filter)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.listContainer}>
          {activeFilter === 'Playlists' &&
            allPlaylists.map(playlist => (
              <View key={playlist.id}>
                <TouchableOpacity
                  style={styles.playlistRow}
                  activeOpacity={0.7}
                  onPress={() => openPlaylist(playlist)}
                  onLongPress={() => onPlayPlaylist(playlist)}
                >
                  {playlist.coverImageUrl && playlist.coverImageUrl !== 'liked_songs_gradient' ? (
                    <Image
                      source={{ uri: playlist.coverImageUrl }}
                      style={styles.playlistImage}
                    />
                  ) : (
                    <View style={[styles.playlistImage, styles.likedSongsGradient]} />
                  )}
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle}>{playlist.name}</Text>
                    <Text style={styles.playlistSubtitle}>
                      {playlist.id === 'liked'
                        ? `${playlist.tracks.length} songs`
                        : `Playlist • ${playlist.creator} • ${playlist.tracks.length}`}
                    </Text>
                  </View>
                  {playlist.id !== 'liked' && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deletePlaylist(playlist.id)}
                    >
                      <Trash2 color={COLORS.text.muted} size={18} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            ))}

          {activeFilter === 'Artists' &&
            (derived.artists.length ? (
              derived.artists.map(artist => (
                <View key={artist.name} style={styles.playlistRow}>
                  <Image source={{ uri: artist.image }} style={styles.artistImage} />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle}>{artist.name}</Text>
                    <Text style={styles.playlistSubtitle}>
                      Artist • {artist.count} {artist.count === 1 ? 'song' : 'songs'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyHint}>Artists appear here as you save music.</Text>
            ))}

          {activeFilter === 'Albums' &&
            (derived.albums.length ? (
              derived.albums.map(album => (
                <View key={album.name} style={styles.playlistRow}>
                  <Image source={{ uri: album.image }} style={styles.playlistImage} />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle}>{album.name}</Text>
                    <Text style={styles.playlistSubtitle}>
                      Album • {album.artist}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyHint}>Albums appear here as you save music.</Text>
            ))}

          {activeFilter === 'Downloaded' && (
            <Text style={styles.emptyHint}>
              NØTE streams on demand and doesn't store audio offline.
            </Text>
          )}
        </View>
      </ScrollView>

      <StatusBarScrim />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onPress={() => navigation.navigate('NowPlaying')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  headerTitle: {
    fontFamily: FONTS.medium,
    fontSize: 28,
    color: COLORS.text.primary,
  },
  addButton: {
    padding: SIZES.sm,
  },
  filtersContainer: {
    marginBottom: SIZES.xl,
  },
  listContainer: {
    flex: 1,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
    paddingVertical: SIZES.xs,
  },
  playlistImage: {
    width: 64,
    height: 64,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  artistImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceLight,
  },
  likedSongsGradient: {
    backgroundColor: '#8A2BE2', // Simple fallback for linear gradient
  },
  playlistInfo: {
    flex: 1,
    marginLeft: SIZES.md,
    justifyContent: 'center',
  },
  playlistTitle: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  playlistSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  deleteButton: {
    padding: SIZES.sm,
  },
  expandedTracks: {
    marginBottom: SIZES.md,
  },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.muted,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
  },
  importCard: {
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  importTitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  importInput: {
    flex: 1,
    height: 40,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.primary,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.sm,
  },
  importButton: {
    marginLeft: SIZES.sm,
    height: 40,
    minWidth: 56,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  panelDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginVertical: SIZES.md,
  },
  importButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.background,
  },
  importError: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.accent.red,
    marginTop: SIZES.sm,
  },
});
