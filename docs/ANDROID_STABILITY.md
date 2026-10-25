# Android stability notes (Back navigation and startup)

## Back button: who owns the event

Exactly one owner handles each hardware Back press, in this order:

1. **Native layers, before JS sees it**: the soft keyboard (hides first) and
   React Native `<Modal>` (calls its own `onRequestClose`; all 27 Modals in the
   repo define one). The call overlay's `onRequestClose` is a deliberate no-op:
   Back must never hang up or decline a call. Use the End/Decline buttons.
2. **Interceptors** (`src/core/backHandling.ts`, `useBackInterceptor`): nested
   views that keep local state register while active (open group chat, open
   community, Feed creator profile, Groups/Communities/Unread filter, New
   Message with an unsent draft). Topmost wins.
3. **Policy** (`resolveBack`, pure function, unit tested): chat/new/settings ->
   home; contact -> its chat; settings section -> settings; my posts -> profile
   section; Stories/Feed/Calls -> Chats tab; root -> Android default. Not ready,
   locked, or on login: Android default. Active call: consumed.

`App.tsx` has a single `BackHandler` subscription for the life of the app. It
reads current state through a ref, so it cannot act on stale state.

## Startup

`src/core/startup.ts` owns readiness. Essential stages (identity, vault, store
hydration, **local** transport state, identity/account/session reads) are each
time-bounded (20 s) and memoised: a retry re-awaits a still-pending operation
instead of starting a duplicate, and skips stages that already succeeded.
Retry is single-flight. Network start (relay, delivery worker, directory
registration) and scheduled backups run **after** readiness, are time-bounded,
and cannot block or fail startup. Recovery never deletes the vault; the
"Reset local vault" button remains a separate, explicitly confirmed action.

Native launch: `app.json` configures `expo-splash-screen` with a black
background and `backgroundColor: "#000000"` (applied by `expo-system-ui` as the
window background), so there is no white window between the native launch
screen and the in-app `BootSplash`. The native splash is held with
`preventAutoHideAsync()` and released after the first JS frame.

## Known limitations (not changed here)

- **Password storage** (`src/core/account.ts`) is local only: salted SHA-256
  iterated 12,000 times via async native calls. This is not a memory-hard KDF.
  Replacing it needs a native KDF module (Argon2/scrypt/PBKDF2) validated on a
  device. There is no server-backed account or cross-device recovery.
- **Document preview** loads pdf.js, docx-preview and pptx-viewer from jsDelivr
  inside a WebView, so it does not work offline. The npm packages `pdfjs-dist`,
  `docx-preview`, `pptx-viewer` and `xlsx` are never imported.
- **Apryse/PDFTron**: `src/core/pdftronDocumentView.ts` is imported nowhere, but
  the native module and `plugins/withApryse.ts` are still built; the licence key
  defaults to empty. Candidate for removal after a native build confirms.
- `react-native-pdf` needs `react-native-blob-util`, which is installed only as
  an auto-installed peer dependency and is not declared in `package.json`.
- The window background is black. If a screen ever renders transparent areas,
  black (not white) will show through.
- No lint configuration exists in this repo.
