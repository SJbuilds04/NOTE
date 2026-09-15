# Third-Party Notices

NØTE incorporates the following third-party components. Their copyright
holders and license terms are reproduced or referenced below. Nothing in this
file transfers ownership: each component remains the work of its authors.

---

## NewPipe Extractor

- **Project:** NewPipe Extractor
- **Upstream:** https://github.com/TeamNewPipe/NewPipeExtractor
- **Version used:** `v0.26.5`
- **Copyright:** © Team NewPipe and contributors
- **License:** GNU General Public License v3.0 **or later** (GPL-3.0-or-later)
- **License text:** https://www.gnu.org/licenses/gpl-3.0.en.html

### How it is used

NewPipe Extractor is consumed as an **unmodified binary dependency**, declared
in `modules/note-native/android/build.gradle` and fetched from JitPack:

```gradle
implementation 'com.github.TeamNewPipe:NewPipeExtractor:v0.26.5'
```

No NewPipe source code has been copied into this repository, and no NewPipe
source has been modified. The NewPipe *application* is not used or included —
only the extractor library.

`modules/note-native/android/src/main/java/expo/modules/notenative/NoteNativeDownloader.kt`
is original NØTE code written against the extractor's public `Downloader`
abstract class. It is not derived from NewPipe's own `DownloaderImpl`.

### ⚠️ Licensing consequence — unresolved

GPL-3.0-or-later is a copyleft license. Linking it into NØTE means that **the
combined work, when distributed, falls under GPL-3.0-or-later**. The MIT text
currently in this repository's root `LICENSE` file does not describe that
combined work.

This has **not** been resolved. The root `LICENSE` was deliberately left
untouched pending an explicit decision by the project owner. The options are:

1. Relicense NØTE as GPL-3.0-or-later (what distributing this combination
   requires).
2. Remove the NewPipe Extractor dependency and resolve streams another way.
3. Keep the integration local/private and never distribute the combined binary.

Until one of these is chosen, **do not publish or distribute builds of NØTE
that contain this dependency.**

### Transitive dependencies

NewPipe Extractor pulls in further libraries under their own licenses,
including `nanojson` (MIT), `jsoup` (MIT) and Mozilla `Rhino` (MPL-2.0).
Their terms apply independently and are unaffected by this file.
