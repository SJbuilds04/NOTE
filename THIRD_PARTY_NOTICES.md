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

### Licensing consequence — resolved

GPL-3.0-or-later is a copyleft license, so the combined work is also
GPL-3.0-or-later. NØTE is therefore licensed GPL-3.0-or-later; see the root
`LICENSE` file. The MIT text that previously sat there came from the Expo
project template and did not describe this combined work.

### Transitive dependencies

NewPipe Extractor pulls in further libraries under their own licenses,
including `nanojson` (MIT), `jsoup` (MIT) and Mozilla `Rhino` (MPL-2.0).
Their terms apply independently and are unaffected by this file.

---

## Expo module template

`modules/note-native/` was scaffolded with `npx create-expo-module --local`. The
generated directory structure and boilerplate come from a template distributed
by Expo (© 650 Industries, Inc.) under the **MIT License**.

That MIT notice is reproduced in `modules/note-native/LICENSE` in acknowledgement
of the scaffold's origin. It covers the generated boilerplate only. The original
NØTE code in that directory — including `NoteNativeModule.kt` and
`NoteNativeDownloader.kt` — is the work of Sanyam Jain and is licensed
GPL-3.0-or-later along with the rest of this project.

---

## Application framework

Expo, React Native, React Navigation, `lucide-react-native`, and the other
JavaScript dependencies declared in `package.json` are used unmodified under
their own licenses, predominantly **MIT**. Their terms apply independently.
Run `npm ls --all` for the resolved dependency tree, or consult each package's
own `LICENSE` file under `node_modules/`.
