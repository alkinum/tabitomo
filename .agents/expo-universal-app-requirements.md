# tabitomo Expo Universal App Requirements

Status: Implementation in progress
Branch: `expo-universal-parity`
Primary target: iOS
Secondary targets: Expo web and Android only when they do not slow iOS parity
Source of truth for parity: current React/Vite web app on this branch

## Objective

Build an Expo universal version of tabitomo that preserves the existing web app's user-facing capabilities while targeting a native-quality iOS experience.

The Expo app must not be a WebView wrapper. It should use React Native UI and native device APIs where practical, while sharing portable TypeScript business logic with the web app.

## Current Verification Snapshot

Last updated: 2026-07-09

Passing automated checks on this branch:

- `pnpm test:core`
- `pnpm --dir packages/tabitomo-core exec tsc --noEmit`
- `pnpm --dir apps/mobile typecheck`
- `pnpm test:mobile:parity-audit`
- `pnpm test:mobile:release-readiness`
- `pnpm test:mobile:device-qa-report` against the checked-in sample fixture; real-device release evidence must pass the same command with the exported iPhone report path, and strict release evidence rejects the checked-in sample fixture
- `pnpm test:mobile:release-evidence` in development mode; release-candidate mode must use `--strict --device-report /path/to/report.json`
- `pnpm test:mobile:web-smoke`
- `pnpm test:provider-smoke` dry-run without provider credentials; real-provider mode requires env vars below
- `pnpm build`
- `pnpm test:mobile:ios-smoke` on iPhone 16 / iOS 26.5 simulator after adding the model-pack metadata/storage UI, manifest URL installer, installed-pack compatibility status, model-pack activation selection, synthetic compatibility preview, tiny local HTTP model-pack first-install/same-version-replacement/delete smoke, redacted Device QA report export UI with per-check outcome/timing records, Device QA Settings storage check, encrypted settings config round-trip smoke, settings QR import callback-chain smoke, Settings Hunyuan-MT output-mode parity smoke, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, native image lightbox scene, and first-run setup choice/manual/import scenes; the latest full run passed 23 scene screenshots, and the current scene matrix has expanded to 24 with focused `config-guidance` coverage
- `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` focused Release simulator smoke; the hidden Device QA surface renders with Settings storage, Provider text, Provider image, Provider speech, and Model pack storage checks available
- `IOS_SMOKE_SCENES=settings-model-pack-install pnpm test:mobile:ios-smoke` focused Release simulator smoke; the tiny installed pack is selected by the shared activation selector as the active ASR candidate after verified install/replacement
- `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke` focused Release simulator smoke; the main native workspace renders the inline Open Settings guidance card when General AI or provider-specific config is missing

- Release iOS Simulator app builds, installs, launches, grants camera permission, captures light/dark first-screen screenshots, and drives 23 deterministic native parity/QA preview scenes through a simulator-only sandbox file, with the matrix now extended to 24 scenes via focused `config-guidance`: main translator, markdown assistant result, long-text Q&A, OCR overlay image result, native image lightbox, furigana result, language picker, QR scanner camera surface, iOS Device QA surface, settings sheet, settings QR export preview, settings QR import callback-chain, settings encrypted config round-trip, Settings Hunyuan-MT output-mode parity, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, settings local-runtime preview, settings model-pack compatibility preview, model-pack first-install/replacement/delete smoke, first-run setup choice/manual/import, and config guidance.
- The smoke verifies native module linking, bundled Hermes startup, app sandbox read path, camera permission grant, representative native UI rendering for key parity surfaces, encrypted settings export/import parity, Hunyuan-MT output-mode parity, Device QA redacted report controls, and model-pack download/install/delete mechanics against a local HTTP manifest and tiny binary. The config round-trip smoke exports encrypted settings through shared core, imports the prefixed payload, validates General AI, translation override, speech, OCR, VLM, and API-key field parity, attempts native settings save/load, and writes only a redacted JSON result. The QR import smoke generates a real encrypted `.ttconfig` payload inside the Release/Hermes app, routes it through `QRScannerSheet`'s `onScanned` callback with the smoke password, calls shared-core `importConfigPayload`, validates imported General AI, translation override, speech, OCR, VLM, and API-key presence, attempts the native save path, and writes only a redacted `tabitomo-qr-import-smoke-result.json`. The Hunyuan output smoke opens Settings with the Hunyuan-MT translation model and an initial structured-output draft, verifies the mobile Settings sheet normalizes to plain output, disables Structured mode for that model, writes `tabitomo-hunyuan-output-smoke-result.json`, and must not leak the `ios-smoke-hunyuan-key` marker. In unsigned Release simulator builds, `expo-secure-store` can fail with "A required entitlement isn't present"; this is recorded as `skipped-secure-store-entitlement` or `save-skipped-secure-store-entitlement` only after encrypted import parity passes, but signed real-device/TestFlight SecureStore persistence is still required for release. The QR import result must not leak the smoke password, API-key markers, or encrypted payload. The native text-provider smoke starts a local mock OpenAI-compatible `/v1/chat/completions` endpoint and runs shared-core `translateText`, `explainTextStream`, and `answerQuestionStream` inside the Release/Hermes app; it verifies one non-streaming translation request and two streaming assistant requests, writes `tabitomo-text-provider-smoke-result.json`, and must not leak the `ios-smoke-provider-key` marker. The native image-provider smoke uses the same local mock endpoint and runs shared-core `streamTranslateImageWithVLM`, `performOCR`, and OCR-line `translateText` inside the Release/Hermes app; it verifies one streaming VLM request, one OCR request with image payload, one OCR-line translation request, geometry parsing, writes `tabitomo-image-provider-smoke-result.json`, and must not leak the `ios-smoke-image-provider-key` marker or image data URL. The native speech-provider smoke starts a local mock `/v1/audio/transcriptions` endpoint and runs shared-core `transcribeAudioFile` inside the Release/Hermes app with an `expo-file-system` FileBlob upload; it verifies one multipart ASR request with the configured model, writes `tabitomo-speech-provider-smoke-result.json`, and must not leak the `ios-smoke-speech-provider-key` marker or local audio file URI/name. These are Release iOS simulator mock-provider evidence only, not real-provider QA. The model-pack smoke now installs the same tiny pack twice to cover the same-version replacement path, verifies installed file metadata points to real files, asserts no `.staging-*` or `.previous-*` artifacts remain after replacement or delete, and asserts the newly installed tiny pack is selected as the active ASR candidate by shared-core activation selection. It also renders the hidden `tabitomo://smoke?scene=device-qa` surface. When run manually on device, that surface can perform a Settings storage SecureStore round-trip with synthetic provider settings, run real Provider text, Provider image, and Provider speech checks using current saved settings, run a Model pack storage tiny install/delete check through the same staging/activation/metadata path as URL installs, restore the previous installed-pack metadata, call TTS, mic permission, Apple Speech availability, camera/photo permission, Vision OCR, share sheet, and document-picker APIs, then copy/share a redacted JSON QA report that omits provider credentials, imported config payloads, provider response bodies, and local image/file URIs. Each Device QA check report includes `outcome`, `result`, `startedAt`, `finishedAt`, and `durationMs` so release evidence can distinguish failure states from slow/native-permission paths. The simulator render smoke still does not itself exercise real microphone capture, Apple Speech recognition, Vision OCR with a real camera/photo, file picker/share sheet completion, signed SecureStore kill/relaunch persistence, real camera QR decoding, the Device QA Provider text action, the Device QA Provider image action, the Device QA Provider speech action, the Device QA Model pack storage action, or real provider requests.

Latest Expo web smoke coverage:

- Expo web export passes and Playwright covers first-run setup, real encrypted `.ttconfig` import, imported settings persistence, manual setup, import setup, skip flow, core text-mode switching, source input, primary action controls, image-mode controls, language picker, settings sections including Local models, settings save/reload persistence, Settings export payload, QR preview generation, Settings import restore, mock-provider Translation, mock-provider streaming Explanation, mock-provider streaming Quick Q&A, album file selection, mock-provider streaming VLM image translation, mock-provider OCR overlay plus per-line translation, and runtime console/page errors.

Latest native QR import coverage:

- The iOS Release simulator `settings-qr-import` scene generates a real encrypted `.ttconfig` payload in-app, feeds it through the native QR scanner sheet callback, imports it with the same shared-core config decrypt/migration path used by file and clipboard import, validates all provider fields and API-key presence, attempts native settings persistence, and writes a redacted result. The latest smoke recorded `payloadLength=1784`. This proves the callback/import/save wiring but does not replace real camera QR decoding on an iPhone.

Latest native Hunyuan-MT output-mode coverage:

- The iOS Release simulator `settings-hunyuan-output` scene opens mobile Settings with the Hunyuan-MT translation model and an initial structured-output draft, then verifies the Settings UI forces plain output, disables Structured mode for Hunyuan-MT, writes a redacted result, and does not leak the smoke API-key marker. The latest focused and full smokes recorded `model=tencent/Hunyuan-MT-7B` and `outputMode=plain`.

Latest native text-provider coverage:

- The iOS Release simulator `text-provider-smoke` scene runs the actual mobile shared-core text flows against a local mock OpenAI-compatible endpoint: `translateText`, streaming `explainTextStream`, and streaming `answerQuestionStream`. The latest smoke recorded `requests=3`, covering one translation request and two streaming assistant requests. The mobile main text surface now also mirrors the web input semantics more closely: typed text is auto-run after a short debounce, repeated translations can hit the same 10-minute in-memory cache policy used by the web app, and newer text actions abort older in-flight translation/explanation/Q&A requests so stale provider results cannot overwrite newer input. Auto-run is disabled for simulator smoke scenes, setup/settings modals, active native speech, and image-result states so deterministic QA surfaces remain stable. This verifies native wiring and Hermes/runtime behavior, but it does not replace the credential-gated real-provider smoke.

Latest native result-copy feedback coverage:

- The mobile result Copy button now mirrors the web result copy feedback. After a successful `expo-clipboard` write, `resultCopied` switches the button to `Copied` with the Check icon for 2 seconds, while `targetText` changes clear the timer and reset the button so a fresh result never inherits an old copied state. `pnpm --dir apps/mobile typecheck`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:parity-audit` with 270 checks, `pnpm test:mobile:release-readiness` with 125 checks, `git diff --check`, and focused `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke` with 1 scene pass.

Latest native image-provider coverage:

- The iOS Release simulator `image-provider-smoke` scene runs the actual mobile shared-core image flows against a local mock OpenAI-compatible endpoint: streaming `streamTranslateImageWithVLM`, cloud `performOCR`, and OCR-line `translateText`. The latest smoke recorded `requests=3`, covering one streaming VLM request, one OCR request with `image_url`, and one OCR-line translation request. It verifies native wiring, Hermes/runtime behavior, OCR geometry parsing, and redacted result handling, but it does not replace real VLM/OCR provider QA or real-photo iPhone QA.

Latest Device QA provider image coverage:

- The hidden Device QA surface now exposes a real-device-oriented `Provider image` check. It uses a generated PNG containing the word "CAFE" and current saved settings to run streaming VLM image translation, cloud OCR, and OCR-line translation through shared core with per-step timeouts. The redacted report records only pass/fail metadata, timing, output lengths, OCR counts, and translated-line counts; provider credentials, endpoints, response bodies, imported config payloads, image data URLs, and local file/image URIs must stay omitted. Focused Release simulator smoke verifies the button renders, but real VLM/OCR credentials still need to be executed on device or an equivalent signed build.

Latest native image lightbox coverage:

- The mobile OCR/VLM image preview is now pressable and opens a native full-screen translated-image lightbox that preserves image aspect ratio and reuses the translated overlay labels. Full `pnpm test:mobile:ios-smoke` passed on iPhone 16 / iOS 26.5 simulator with the `image-lightbox` scene included, proving the Release/Hermes scene can inject image/OCR overlay data, open the modal, render the translated preview, and capture a nonblank screenshot. This is simulator visual evidence only; real-photo overlay comparison against the web Canvas output remains pending.

Latest native image language-direction coverage:

- Mobile Camera/Album entry now mirrors the web `text -> image` input-method behavior by entering an image language context only after a photo/library asset is selected. The current source/target languages are swapped for OCR/VLM processing, so the default text-first `zh -> ja` screen becomes `ja -> zh` when photographing Japanese menus/signs. Clearing the workspace or switching to a non-image text mode leaves that context and restores the direction. `scripts/mobile-parity-audit.mjs` anchors this against the web `handleInputMethodChange` auto-swap behavior. `IOS_SMOKE_SCENES=main,image pnpm test:mobile:ios-smoke` passes with 2 Release/Hermes simulator scenes after the change.

Latest native speech-provider coverage:

- The iOS Release simulator `speech-provider-smoke` scene runs the actual mobile shared-core ASR flow against a local mock OpenAI-compatible transcription endpoint: `transcribeAudioFile` uploads an `expo-file-system` FileBlob through Expo/Hermes `FormData`. The latest smoke recorded `requests=1`, covering one multipart `audio/transcriptions` request with the configured model. It verifies native cloud-ASR upload wiring, Hermes/runtime behavior, and redacted result handling, but it does not replace real ASR provider QA or real microphone iPhone QA.

Latest Device QA provider speech coverage:

- The hidden Device QA surface now exposes a real-device-oriented `Provider speech` check. It writes a valid short synthetic WAV fixture in the native cache directory, sends it through shared-core `transcribeAudioFile` using the current speech settings, and reports only provider type plus transcript length. The check verifies real cloud ASR credentials and native multipart upload without exporting transcript text, provider credentials, endpoints, response bodies, or local audio file URIs. It does not replace the separate real microphone and Apple Speech/on-device ASR checks.

Latest native config-guidance coverage:

- The mobile main workspace now renders a native `ConfigGuidanceCard` when Translation, Explanation, Quick Q&A, OCR, or VLM configuration is missing. Its Open Settings action jumps directly to the relevant Translation, General, or Image Settings section through the same section-anchor mechanism used by the Settings jump bar. Focused `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke` passes on the Release iOS simulator; real-device Settings navigation remains part of the signed iPhone QA pass.

Latest native secure-input coverage:

- Mobile Settings and first-run setup now render Eye/EyeOff reveal controls for every `secureTextEntry` `Field`, covering config passwords and provider API keys. This aligns the native setup/import UI with the web Import/Export dialog and WelcomeWizard password reveal behavior. `pnpm --dir apps/mobile typecheck`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:parity-audit` with 265 checks, and focused `IOS_SMOKE_SCENES=settings,setup-manual,setup-import pnpm test:mobile:ios-smoke` with 3 scenes pass.

Latest shared-core audio coverage:

- `@tabitomo/core` now has unit coverage for cloud ASR request shaping: native/local provider rejection before network, missing credential validation, speech-key priority over translation/general keys, translation endpoint priority over General AI endpoint, `audio/transcriptions` path construction, multipart `model`/`file` payloads, abort signal pass-through, provider error text surfacing, and `{ text }` response parsing.
- The Vite web cloud ASR helper now uses the same key/endpoint fallback order as the shared mobile helper, so imported General AI configs behave consistently across web and Expo for record-then-transcribe cloud speech.

Latest shared-core local model/cache coverage:

- `@tabitomo/core` now has unit coverage for model-pack manifest normalization, duplicate pack/file rejection, unsafe file-name rejection, manifest total-byte validation, installed-pack metadata normalization, installed-pack byte totals, installed metadata matching against the source manifest, installed-pack compatibility gates, activation selection, native-baseline fallback, incompatible-pack reporting, missing-baseline reporting, and user-facing model-size formatting.
- Expo Settings now shows active ASR and active OCR runtime selection. The selector prefers the newest compatible installed model pack, falls back to Apple Speech or Apple Vision when no custom pack is ready, and reports no-compatible-pack/no-baseline states explicitly.
- Expo iOS model-pack smoke now covers native manifest download, byte/SHA-256 verification, staged activation, same-version replacement, installed-file metadata validation, cleanup of sibling `.staging-*`/`.previous-*` artifacts, activation selection for the just-installed tiny pack, and delete cleanup.
- The Device QA surface now also exposes a real-device-oriented Model pack storage check. It installs a tiny in-memory model pack through `installModelPackFromBytes`, verifies persisted metadata and installed files, confirms staging artifacts are cleaned up, deletes the tiny pack, and restores previous installed-pack metadata without exposing local file URIs in the report.

Current highest-risk gaps:

- Real-provider QA for Translation, Explanation, Quick Q&A, VLM, OCR, ASR, and Japanese furigana. A credential-gated harness now exists, Device QA exposes Provider text, Provider image, and Provider speech checks, and Release iOS simulator mock text/image/speech provider evidence covers the text, VLM, OCR, and ASR shared-core paths, but real provider credentials have not been run in this workspace.
- Real iPhone verification for camera capture, microphone, Apple Speech, Vision OCR, TTS, share sheet, real QR scanning, Device QA Provider text, Device QA Provider image, Device QA Provider speech, Device QA Model pack storage, and signed SecureStore settings persistence after kill/relaunch. A dedicated checklist now exists at `.agents/ios-real-device-qa.md`, and the hidden Device QA scene provides an in-app runner for native permission/device surfaces, including Settings storage, Provider text, Provider image, Provider speech, and Model pack storage checks, plus a redacted JSON report export with per-check outcome/timing records for release evidence.
- EAS build scaffold now exists with `development`, `development-simulator`, `preview`, `preview-simulator`, `production`, and iOS submit profiles plus `.easignore`. Canonical release path is still undecided between local Xcode and EAS because EAS CLI login, Apple Developer/App Store Connect credentials, and signed-device evidence are still external. `.agents/ios-release-evidence.zh-CN.md` and `pnpm test:mobile:release-evidence` now machine-summarize local Xcode/EAS availability, EAS profile readiness, provider credential readiness, and optional signed-iPhone Device QA report validation.
- Deeper iOS flow automation beyond first-screen startup.
- Signed-iPhone validation of the implemented local runtimes. Whisper Base and SenseVoice Small now run through sherpa-onnx; PP-OCR v5 Mobile runs through ONNX Runtime; Apple Speech/Vision are missing/invalid-model fallbacks. Real-device accuracy, latency, memory, rotation, offline relaunch, and full-download evidence remain pending.

## Non-Negotiable Product Requirements

1. Text translation must match the web app's language coverage, prompt behavior, provider flexibility, and result quality.
2. Audio input must support iOS microphone capture and cloud transcription at parity with the web app's configured speech provider flow.
3. Image input must support camera capture, photo-library import, OCR translation, and direct VLM image translation.
4. Settings must expose all provider configuration needed by the web app: General AI, translation override, speech recognition, OCR, and VLM.
5. User settings must persist securely on iOS, especially API keys.
6. The mobile UI must be native React Native, compact, cute, and aligned with tabitomo's existing visual language.
7. Local model features must have a native iOS path, not a pretend JavaScript-only port.
8. Every web feature must be classified as implemented, replaced by a native equivalent, intentionally deferred, or blocked by platform constraints.
9. Signed iOS builds must enable private CloudKit settings sync by default, retain SecureStore as the offline cache, and never block local saves when iCloud is unavailable.

## Architecture Direction

### Repository Layout

- `apps/mobile`: Expo app targeting iOS first.
- `packages/tabitomo-core`: shared TypeScript logic that can run in web and Expo.
- `src`: existing Vite web app.

### Shared Core Scope

Shared core should contain:

- language definitions
- settings types and normalization
- translation prompts and request shaping
- OCR/VLM prompts and response parsing
- provider protocol helpers
- portable config migration helpers

Shared core should not contain:

- DOM APIs
- React DOM components
- browser-only PWA logic
- Web Worker implementation details
- WASM runtime bootstrapping tied to browser isolation headers

### Mobile App Runtime

Use Expo SDK 57 with React Native 0.86 and React 19.2.x. The app should use `expo-dev-client` because local model work will require native modules or config plugins.

Expo Go is acceptable only for early cloud-only UI development. It is not a valid target for final parity.

## Feature Parity Matrix

| Area | Web capability | Expo iOS requirement | Priority | Status |
| --- | --- | --- | --- | --- |
| Text translation | OpenAI-compatible and general AI translation | Native text input, language pickers, translate action, same prompts through shared core | P0 | Implemented initial; mobile typed input now auto-translates after debounce, aborts stale requests, and uses a 10-minute in-memory translation cache matching web behavior; mock-provider Expo web E2E smoke passes; Release iOS simulator mock text-provider smoke covers the shared-core translation path; real-provider/iPhone QA pending |
| Text explanation | Web Explanation mode for words, sentences, and grammar patterns | Native Explain mode using shared General AI assistant prompt, same language selection, same thinking-token cleanup | P0 | Implemented with streaming output; mobile typed input now auto-runs Explanation after debounce and aborts stale streams; mock-provider Expo web E2E smoke passes; Release iOS simulator mock text-provider smoke covers the streaming shared-core Explanation path; real-provider/iPhone QA pending |
| Quick Q&A | Web Quick Q&A travel-language assistant | Native Q&A mode using shared General AI assistant prompt, same language selection, spoken-question path after ASR | P0 | Implemented with streaming output; mobile typed input now auto-runs Q&A after debounce and aborts stale streams; mock-provider Expo web E2E smoke passes; Release iOS simulator mock text-provider smoke covers the streaming shared-core Q&A path; real-provider/iPhone QA pending |
| Rich text results | Web renders markdown for VLM, Explanation, and Q&A | Native lightweight markdown renderer for headings, lists, bold, inline code, and code blocks | P1 | Implemented initial; visual QA pending |
| Translation provider settings | General AI, translation override, API format options | Settings screen with secure API-key storage and same provider fields | P0 | Implemented initial |
| First-run setup wizard | WelcomeWizard on first launch with manual setup and import paths | Native first-run setup sheet with manual provider setup, quick fill, encrypted config import, file import, and QR scan | P1 | Implemented initial; Expo web first-run/manual/import smoke passes with real encrypted `.ttconfig` import; iOS Release simulator smoke now covers setup choice, manual translation setup, and import setup; real iPhone file import and camera QR decode QA pending |
| Output modes | Plain/structured output and Hunyuan-MT handling | Shared core parity | P0 | Implemented initial; mobile Settings now mirrors web behavior by forcing plain output and disabling Structured mode when Hunyuan-MT is selected; focused and full Release iOS simulator `settings-hunyuan-output` smokes pass |
| Language swap | Swap source/target | Native control | P0 | Implemented initial |
| Copy result | Clipboard copy with success feedback | Use Expo Clipboard or RN clipboard-compatible package and mirror web `Copy -> Copied`/Check feedback | P0 | Implemented initial |
| Text-to-speech | Browser speech synthesis | `expo-speech` native TTS | P0 | Implemented initial |
| Audio recording | `getUserMedia`, `MediaRecorder` | `expo-audio` recording with iOS microphone permission | P0 | Implemented initial |
| Cloud ASR | SiliconFlow/OpenAI-compatible transcription | Upload native audio file through shared speech helper | P0 | Implemented initial; Release iOS simulator mock speech-provider smoke covers the native FileBlob multipart upload through shared core; real-provider/iPhone mic QA pending |
| Realtime transcription | Web realtime/VAD path | Native streaming design required; first release may use record-then-transcribe | P1 | Mobile preserves the imported setting for Web config parity but disables the toggle in iOS Settings with a record-then-transcribe status note; native streaming runtime still required for true parity |
| Web Speech API | Browser speech recognition | Replace with iOS native speech module or cloud ASR; Web Speech itself is not available | P1 | Apple Speech native replacement implemented initial; real-device verification pending |
| Image upload | File picker/dropzone plus web image-mode language reversal | `expo-image-picker` photo library import with native image language context | P0 | Implemented initial; Camera/Album only enter image language context after an asset is selected, then swap source/target for OCR/VLM and restore when leaving image context; Expo web album file-picker smoke passes; iOS photo-library QA pending |
| Camera capture | Browser camera panel plus web image-mode language reversal | `expo-image-picker` camera or `expo-camera` if richer controls are needed, with native image language context | P0 | Implemented initial; Camera/Album language direction now mirrors web text/image input-method swap semantics |
| Image compression | Canvas + WASM mozjpeg | Native image manipulation/compression path | P0 | Implemented initial with `expo-image-manipulator` |
| Cloud OCR | Alibaba Cloud Model Studio Qwen-OCR only | Shared core native `advanced_recognition` adapter and coordinate parsing | P0 | `qwen3.5-ocr` default with `qwen-vl-ocr-latest` compatibility; Web/Mobile settings identify the provider; mock-provider coverage updated; real-provider/iPhone QA pending |
| VLM image translation | Direct image-to-translation streaming | Stream provider deltas into the native result panel while preserving thinking-token cleanup | P0/P1 | Implemented with shared streaming provider path; Expo web album + mock-provider VLM smoke passes; Release iOS simulator mock image-provider smoke covers native streaming VLM; real-provider/iPhone QA pending |
| OCR overlay image | Canvas overlay translated text | Native SVG/canvas equivalent or image annotation module | P1 | Improved native overlay plus full-screen native image lightbox; Expo web mock-provider OCR overlay smoke passes; Release iOS simulator mock image-provider smoke covers OCR geometry parsing and translated overlay item generation; focused Release iOS `image-lightbox` smoke passes; real-image native visual QA pending |
| Local PP-OCR | Browser worker + ONNX/WASM | Native iOS module using Core ML, ONNX Runtime, or an on-device native OCR replacement; no JavaScript-only promise | P1 | iOS Vision native replacement implemented initial; real-image QA pending |
| Local ASR | sherpa-onnx WASM runtime and model directory | Native module using Core ML, Speech framework, whisper.cpp, sherpa-onnx iOS, or ONNX Runtime | P1 | iOS Local provider now uses Apple on-device Speech when the selected locale supports it; custom Core ML/Whisper/SenseVoice runtime research still required |
| Japanese furigana | kuroshiro/kuromoji assets | Shared logic if Metro-compatible, otherwise native/server fallback with native-style ruby rendering | P1 | Implemented initial via provider fallback; visual/provider QA and local-native path still pending |
| Import/export settings | JSON export/import and QR | Native document/share sheet and QR scanner/generator | P1 | Implemented initial via encrypted payload clipboard, document picker/share sheet, and QR; Expo web smoke verifies real encrypted `.ttconfig` first-run import, Settings export, QR preview generation, and Settings import restore; iOS simulator smoke verifies encrypted export/import field parity with a redacted config round-trip result and separately verifies QR scanner callback import using a real encrypted payload |
| Settings normalization/migration | Web normalizes legacy speech provider, output mode, OCR provider, and API format | Shared core normalization used by mobile storage and `.ttconfig` import/export | P1 | Implemented with fixture coverage |
| QR setup import | Browser camera QR scanner | Native camera scanner | P1 | Implemented initial with `expo-camera` QR scanner; QR generation smoke passes and iOS simulator smoke now opens the camera scanner surface with camera permission granted, then the `settings-qr-import` scene injects a generated encrypted payload through `QRScannerSheet`'s `onScanned` callback and validates shared-core import plus redacted result handling; real camera QR decoding still needs device/browser camera QA |
| PWA update prompt | Service worker update | Not applicable; replaced by App Store/TestFlight update flow | N/A | Native replacement |
| Offline installability | PWA install | Native app install | N/A | Native replacement |
| Expo web build | Universal app can also export for web when it does not slow iOS parity | `expo export --platform web` plus browser first-screen/setup smoke | P2 | Implemented with expanded scriptable smoke for setup, real encrypted `.ttconfig` import/export, QR preview, core main-surface interactions, settings save/reload persistence, mock-provider text modes, album + mock-provider VLM, and mock-provider OCR overlay; QR camera scan QA pending |
| Local cache | Service worker runtime cache | Native file/cache strategy for models and assets | P1 | Fixed R2 download, byte/SHA-256 verification, staging/rollback cleanup, Documents metadata, native-load validation, deterministic activation, sherpa-onnx ASR, ONNX Runtime PP-OCR, Apple fallback, unload/delete, and simulator storage smoke are implemented initial; signed-device inference/storage QA pending |
| Dark mode | CSS dark classes | React Native color scheme support | P1 | Implemented initial with `useColorScheme` theme tokens |
| E2E tests | Playwright | Detox/Maestro or Expo-compatible smoke tests for iOS/web | P1 | Expo web smoke implemented; iOS simulator smoke now covers Release build/install/launch plus deterministic parity scene screenshots for main, markdown, long text, image overlay, image lightbox, furigana, language picker, QR scanner camera surface, hidden iOS Device QA surface, settings, QR preview, settings QR import callback-chain, settings config round-trip, Settings Hunyuan-MT output-mode parity, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, settings local-runtime preview, settings model-pack compatibility preview, model-pack install/delete, and first-run setup choice/manual/import; richer permission/device automation still needs selection |

## iOS Local Model Strategy

Local models are the biggest gap between Web and Expo. The goal is feature parity, but the implementation path must be native.

Current documented strategy: use Apple Speech/on-device Speech and Apple Vision as the first iOS native baseline, keep cloud fallback fully shippable, and treat custom model packs as opt-in downloads behind benchmark and license gates. See `.agents/ios-local-model-runtime-strategy.md` for runtime choice, model-pack cache design, offline behavior, size expectations, license review notes, and real-iPhone benchmark plan.

### Candidate Paths

1. Core ML conversion
   - Convert supported OCR/ASR models to `.mlmodel` or `.mlpackage`.
   - Use a custom Expo native module in Swift.
   - Best long-term iOS integration, but model compatibility must be proven.

2. ONNX Runtime React Native / iOS
   - Use ONNX Runtime Mobile or React Native binding if compatible with Expo prebuild.
   - May preserve more of the existing ONNX model path.
   - Need binary size, execution provider, and iOS performance validation.

3. sherpa-onnx native iOS
   - Reuse sherpa runtime natively instead of browser WASM.
   - Good candidate for ASR parity if integration and license constraints work.

4. Apple Speech framework
   - Implemented as the first iOS native replacement for browser Web Speech API.
   - Useful for native speech recognition, but not equivalent to local custom ASR models.
   - Requires dev-client/native build plus real-device permission and locale verification.

5. Apple Vision framework
   - Implemented as the first iOS on-device replacement for browser/local PP-OCR in mobile OCR mode.
   - Avoids shipping a large OCR model in the first native prototype.
   - Requires real-image QA for language coverage, rotated text, and overlay geometry.

6. Server/cloud fallback
   - Must remain available as a reliable fallback.
   - Does not satisfy local-model parity by itself.

### Required Research Outputs

Documented in `.agents/ios-local-model-runtime-strategy.md`:

- chosen runtime for OCR: Apple Vision baseline; custom PP-OCR deferred pending real-image QA
- chosen runtime for ASR: Apple Speech/on-device Speech baseline; `whisper.cpp` + Core ML/Metal as the first custom ASR prototype if needed
- model format and conversion steps
- expected app binary size impact
- expected first-run model download size
- offline behavior
- minimum iOS recommendation
- license review notes
- benchmark plan on a real iPhone

## Real Provider QA Harness

Command:

- `pnpm test:provider-smoke`

Default behavior:

- With no credentials, the command exits successfully and reports skipped checks. This keeps local/CI dry-runs safe.
- Set `TABITOMO_PROVIDER_SMOKE_REQUIRED=all` to fail when any provider-backed check is skipped or fails.
- Set `TABITOMO_PROVIDER_SMOKE_REQUIRED=text` to require Translation, Explanation, Quick Q&A, and Japanese furigana only.
- Set `TABITOMO_PROVIDER_SMOKE_REQUIRED=translation,explanation,qa,furigana,vlm,ocr,asr` for an explicit subset.

General AI / text env:

- `TABITOMO_GENERAL_API_KEY`
- `TABITOMO_GENERAL_ENDPOINT`
- `TABITOMO_GENERAL_MODEL`
- `TABITOMO_GENERAL_API_FORMAT` (`openai-chat`, `openai-responses`, or `anthropic`; defaults to `openai-chat`)

Translation override env:

- `TABITOMO_TRANSLATION_API_KEY`
- `TABITOMO_TRANSLATION_ENDPOINT`
- `TABITOMO_TRANSLATION_MODEL`
- `TABITOMO_TRANSLATION_OUTPUT_MODE` (`structured` or `plain`)

Image env:

- `TABITOMO_VLM_API_KEY`, `TABITOMO_VLM_ENDPOINT`, `TABITOMO_VLM_MODEL`
- Or `TABITOMO_PROVIDER_SMOKE_VLM_USE_GENERAL=1` with a vision-capable General AI model
- `TABITOMO_OCR_API_KEY`, `TABITOMO_OCR_ENDPOINT`, `TABITOMO_OCR_MODEL`
- Or `TABITOMO_PROVIDER_SMOKE_OCR_USE_GENERAL=1` with an OCR-capable General AI model

Speech env:

- `TABITOMO_SPEECH_API_KEY`
- `TABITOMO_SPEECH_ENDPOINT`
- `TABITOMO_SPEECH_MODEL`
- `TABITOMO_SPEECH_AUDIO_FILE`
- Optional `TABITOMO_SPEECH_AUDIO_MIME`

Covered paths:

- Shared-core `translateText`
- Streaming Explanation via `explainTextStream`
- Streaming Quick Q&A via `answerQuestionStream`
- Provider-backed Japanese furigana via `annotateJapaneseFurigana`
- Streaming VLM image translation via `streamTranslateImageWithVLM`
- Cloud OCR parsing via `performOCR`
- Cloud ASR upload via `transcribeAudioFile`

The image checks use a generated PNG containing the word "CAFE", so they exercise real image upload and text recognition instead of a blank pixel.

## Milestones

### M0: Tracking and Scaffold

Acceptance:

- Expo app exists under `apps/mobile`.
- Shared core exists under `packages/tabitomo-core`.
- This requirements document exists and is kept current.
- `pnpm --dir apps/mobile typecheck` passes.

Status: complete for initial scaffold.

### M1: Cloud Text Translation Parity

Acceptance:

- User can configure General AI provider.
- User can enter text, choose source/target language, translate, swap languages, clear, copy, and use TTS.
- Translation output matches web prompt behavior for plain, structured, and Hunyuan-MT cases.
- User can switch between Translation, Explanation, and Quick Q&A modes without leaving the main tool surface.
- Explanation and Quick Q&A use General AI settings and preserve the web prompt intent through shared core helpers.
- Voice transcription can feed the currently selected text mode, not only translation.
- API keys persist securely.

Status: implemented initial. Release simulator first-screen smoke passed in light and dark mode. Translation, Explanation, and Quick Q&A are wired in the native main surface. Explanation and Quick Q&A now stream provider deltas through shared core, matching the web interaction model more closely. Mobile typed input now auto-runs the active text mode after a short debounce, cancels stale requests when the user changes mode/clears/starts a newer text action, and keeps the web-equivalent 10-minute translation cache for repeated translation requests. A Release/Hermes simulator `text-provider-smoke` scene runs `translateText`, streaming `explainTextStream`, and streaming `answerQuestionStream` against a local mock OpenAI-compatible endpoint and verifies one non-streaming request plus two streaming requests. Needs real-provider manual verification on iPhone/simulator.

### M2: Audio Parity

Acceptance:

- iOS microphone permission flow works.
- User can record audio and submit to configured cloud ASR provider.
- Transcribed text is inserted into source text and translated.
- Error states cover permission denied, missing provider config, network failure, and unsupported local mode.

Status: implemented initial. Cloud record-then-transcribe is available, the `web-speech` provider maps to an Apple Speech native module on iOS, and the `local` provider uses Apple on-device Speech when the selected locale supports it. Mobile preserves the realtime/VAD setting for Web `.ttconfig` compatibility but disables the toggle in iOS Settings with an explicit record-then-transcribe status note until a native streaming ASR runtime ships. Shared core unit tests now lock the cloud ASR helper's credential fallback, endpoint fallback, multipart request, and error behavior, and the web cloud ASR helper follows the same fallback semantics. A Release/Hermes simulator `speech-provider-smoke` scene runs shared-core `transcribeAudioFile` against a local mock `/v1/audio/transcriptions` endpoint, uploads an `expo-file-system` FileBlob, verifies one multipart request, and writes a redacted result. Needs real-device microphone upload/native speech/on-device locale verification with real ASR provider credentials.

### M3: Image Parity

Acceptance:

- User can capture from camera and import from photo library.
- User can run cloud OCR + translation.
- User can run VLM image translation.
- Image result UI supports text-only and overlay-style output.
- iOS photo/camera permission states are handled.

Status: implemented initial. VLM direct image translation now streams provider deltas through shared core. Overlay maps OCR `rotate_rect`/polygon geometry into native percentage frames with rotation-aware labels, and OCR mode fills source text with recognized originals plus translation text with translated lines. Local OCR mode now uses Apple Vision on iOS when `local-ppocr` is selected. A Release/Hermes simulator `image-provider-smoke` scene runs streaming VLM, cloud OCR, and OCR-line translation against a local mock OpenAI-compatible endpoint and verifies three provider requests plus OCR geometry parsing. Still needs screenshot QA against web Canvas behavior on real examples and real-provider/iPhone image verification.

### M4: Settings, Import/Export, and Migration

Acceptance:

- Mobile settings expose all fields needed by the web app.
- First launch guides users through provider setup or encrypted config import.
- Existing web JSON config can be imported.
- Mobile config can be exported for web.
- QR import/export path is available or explicitly deferred with issue link.

Status: implemented initial. Encrypted `.ttconfig` payload export/import, clipboard, native document picker/share-sheet, QR display/scan, secure password/API-key reveal controls, and first-run native setup wizard are implemented with shared Web-compatible AES-GCM/PBKDF2 format. Shared core now normalizes legacy `local-whisper` speech configs, Hunyuan-MT plain output mode, OCR providers, and API format values for mobile storage/import parity. Expo web first-run/manual/import smoke verifies a real encrypted `.ttconfig` payload generated by `@tabitomo/core`; iOS simulator smoke verifies encrypted export/import field parity through `settings-config-roundtrip` and writes a redacted result. The `settings-qr-import` simulator scene also generates a real encrypted payload in Release/Hermes, routes it through the native QR scanner callback, validates shared-core import and API-key field parity, attempts native save, and writes a redacted result without the payload or secret markers. The hidden Device QA surface now includes a Settings storage check that writes synthetic settings through `expo-secure-store`, validates loaded General AI/translation/speech/OCR/VLM fields, restores the previous state, and records only a redacted result. It also includes Provider text, Provider image, and Provider speech checks that run current real provider settings through shared-core text, image, and cloud ASR paths with a 60-second per-step timeout and redacted reporting. It also includes a Model pack storage check that installs and deletes a tiny in-memory pack through the same native model-pack storage path used by manifest URL installs, then restores prior installed-pack metadata. Needs iOS visual QA plus real-device QR camera decode, file picker/share-sheet, signed SecureStore kill/relaunch persistence verification, real-provider Device QA execution, and real-device model-pack storage execution.

The Device QA surface also includes a Provider image check that uses current VLM/OCR settings with a generated "CAFE" PNG to exercise shared-core streaming VLM, cloud OCR, and OCR-line translation. Its report is intentionally summarized and redacted so no provider secrets, endpoints, response bodies, image data URLs, imported payloads, or local URIs are exported.

The Device QA surface also includes a Provider speech check that writes a valid short synthetic WAV fixture, calls shared-core cloud ASR through `transcribeAudioFile`, and reports only provider type plus transcript length. It is a credential/upload check for speech settings; real microphone capture and recognition quality remain separate real-device QA rows.

### M4.1: Settings Field Coverage

Implemented in mobile settings:

- General AI: API format, endpoint, model, API key.
- Translation override: output mode, endpoint, model, API key.
- Speech: provider, cloud model/key, realtime toggle, fixed local engine/model download, VAD mode, SenseVoice language/ITN, Whisper language/task. Mobile exposes no model path or manifest URL.
- Image OCR: Local PP-OCR or Alibaba Cloud Model Studio Qwen-OCR, DashScope Beijing/Singapore or Workspace native endpoint, `qwen3.5-ocr`/compatibility model, and Alibaba API key. General AI/custom OCR remain legacy config fields only and are not exposed as adapted coordinate OCR providers.
- VLM: General AI toggle, custom VLM toggle, thinking toggle, endpoint, model, API key.
- Import/export: encrypted payload, clipboard, native file picker/share sheet, QR generation/scanning.
- Native local runtime validation: Settings loads the selected sherpa-onnx or ONNX Runtime model when ready and reports Apple Speech/Vision only as fallback.
- Local models: Settings shows fixed Whisper Base, SenseVoice Small, and PP-OCR v5 Mobile download/update/delete controls. Mobile exposes no local path, runtime-assets URL, or arbitrary manifest URL. Models download only from `assets.tabitomo.alkinum.io`; file URLs are same-origin enforced, byte/SHA-256 verified, staged, native-load validated, and atomically activated. Sessions unload before deletion. Model binaries and download state never enter iCloud sync or `.ttconfig` export.

Remaining settings work:

- Add any future web settings introduced after this branch's current schema.
- Verify imported web `.ttconfig` payloads on a real iPhone and one simulator.
- Decide whether Japanese furigana should use provider fallback only, bundled Metro-compatible kuroshiro assets, or a native dictionary/tokenizer path before release.
- Keep iOS API keys in SecureStore; Expo web uses localStorage fallback only because `expo-secure-store` does not provide the native keychain API on web.

### M5: Local Model Native Prototype

Acceptance:

- One local OCR or ASR path runs on iOS through a native module or validated native package.
- The app clearly switches between cloud and local providers.
- Performance and model-size notes are documented.

Status: fixed R2 model distribution and native download storage are implemented. The `tabitomo-assets` R2 bucket is bound to `assets.tabitomo.alkinum.io` with active TLS 1.2; verified Whisper Base int8, SenseVoice Small int8, and PP-OCR v5 Mobile ONNX assets are published with per-file SHA-256 manifests. Mobile Settings downloads these fixed models without path or arbitrary manifest input. Apple Speech/on-device Speech and Apple Vision remain the active inference fallbacks until the sherpa-onnx iOS and ONNX Runtime Mobile adapters are implemented and benchmarked. Real-device download/storage and custom inference QA remain pending.

### M6: Release Readiness

Acceptance:

- iOS app builds through Expo prebuild/dev-client and EAS or local Xcode.
- App icons, display name, bundle identifier, privacy strings, and permissions are configured.
- Smoke tests pass on simulator and at least one real iPhone.
- Parity matrix has no unknown P0 items.

Status: in progress. iOS Release simulator build, install, launch, camera permission grant, light/dark first-screen screenshot smoke, deterministic parity scene screenshots, settings QR import callback-chain smoke, encrypted settings config round-trip smoke, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, focused native image lightbox smoke, and local HTTP tiny model-pack first-install/replacement/delete smoke are covered through `pnpm test:mobile:ios-smoke`, including main, markdown, long text, OCR overlay, image lightbox, furigana, language picker, QR scanner camera surface, hidden iOS Device QA surface, settings, settings QR preview, settings QR import, settings config round-trip, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, settings local-runtime preview, settings model-pack compatibility preview, settings model-pack first-install/replacement/delete, and first-run setup choice/manual/import scenes. Expo web export and browser smoke pass as a secondary universal target. `pnpm test:mobile:release-readiness` now verifies the release-facing app config, build number, bundle identifier, iOS deployment target, prebuilt Xcode project settings, privacy strings, SecureStore/camera/audio/image plugins, native dependency set, workspace presence, and QA docs. Real-device checks, real-provider credentials, signed SecureStore persistence, and permission-dependent iOS flow automation are still pending.

## UX Requirements

- Keep the working surface compact and fast.
- Avoid a marketing-style landing screen.
- First screen is the translator itself.
- Use native segmented controls, sheets, switches, icon buttons, and compact forms.
- Preserve tabitomo's cute flat-shadow feel without copying browser CSS directly.
- Respect safe areas, keyboard avoidance, Dynamic Type where practical, and dark mode.
- Long text and translated results must be scrollable without layout overlap.

## Data and Security Requirements

- Store API keys in `expo-secure-store` or an equivalent secure storage path.
- Store non-secret preferences in AsyncStorage or SecureStore if simplicity is preferred.
- Do not log API keys, full Authorization headers, or full imported config payloads.
- Show clear errors for missing API key, endpoint, model, and permission failures.
- Keep BYOK behavior: users can use their own provider endpoints.

## Testing Requirements

Minimum automated checks:

- TypeScript check for shared core and mobile app.
- Mobile release-readiness config gate for Expo app config, bundle identifier, build number, iOS deployment target, prebuilt Info.plist privacy strings, SecureStore/camera/audio/image plugins, native dependency set, smoke script availability, Device QA report app identity metadata, mobile realtime/VAD honesty guard, web/mobile default-language parity, strict release-evidence sample-fixture guard, and QA docs.
- Shared core fixture tests for settings normalization, web/core settings parity, and encrypted `.ttconfig` round trips.
- Shared core tests for cloud ASR request shaping, credential/endpoint fallback, local-provider rejection, provider error handling, model-pack manifest/installed metadata normalization, unsafe file-name rejection, manifest total-byte validation, installed metadata matching against manifests, installed model-pack compatibility gates, activation selection, and native-baseline fallback.
- Expo web smoke test for export, first-run setup wizard, real encrypted `.ttconfig` import, imported settings persistence, manual setup, import setup, skip flow, core text-mode switching, source input, primary action controls, image-mode controls, language picker, settings sections including Local models, settings save/reload persistence, Settings export payload, QR preview generation, Settings import restore, mock-provider Translation, mock-provider streaming Explanation, mock-provider streaming Quick Q&A, album file selection, mock-provider streaming VLM image translation, mock-provider OCR overlay plus per-line translation, and runtime console/page errors.
- Provider smoke dry-run with no credentials; real-provider smoke with required env before release candidate.
- iOS simulator smoke test for Release native build, temporary simulator boot, install, camera permission grant, launch, light/dark first-screen screenshots, deterministic parity preview screenshots for main translator, markdown assistant result, long-text Q&A, OCR overlay, image lightbox, furigana, language picker, QR scanner camera surface, hidden iOS Device QA surface with Settings storage, Provider text, Provider image, Provider speech, and Model pack storage check UI, redacted report controls, and per-check outcome/timing records, settings sheet, settings QR export preview, settings QR import callback-chain using a real encrypted `.ttconfig` payload generated in-app, settings encrypted config round-trip, native mock text-provider smoke for shared-core Translation, streaming Explanation, and streaming Quick Q&A, native mock image-provider smoke for streaming VLM, OCR, OCR-line translation, and OCR geometry parsing, native mock speech-provider smoke for shared-core cloud ASR multipart upload, settings local-runtime preview, settings model-pack compatibility/activation preview, model-pack first-install/replacement/delete, first-run setup choice/manual/import, and config-guidance, plus redacted QR import/config/text-provider/image-provider/speech-provider result leak checks, byte/SHA-256-verified tiny model-pack first install, same-version replacement, installed-file metadata validation, backup/staging cleanup assertion, activation selection assertion, and delete cleanup against a local HTTP server. Focused `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`, `IOS_SMOKE_SCENES=settings-model-pack-install pnpm test:mobile:ios-smoke`, `IOS_SMOKE_SCENES=setup-choice,setup-manual pnpm test:mobile:ios-smoke`, and `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke` also pass.
- Unit tests for prompt/request helpers where practical.
- Smoke test for app render.
- Manual iOS simulator checklist for camera, photo library, microphone, settings save/load, text translation, OCR, and VLM.

Release candidate checks:

- Real iPhone test using `.agents/ios-real-device-qa.md` for camera, microphone, TTS, photo import, Apple Speech, Vision OCR, QR scan, file import/share, Device QA Provider text, Device QA Provider image, Device QA Provider speech, Device QA Model pack storage, Active ASR/OCR local-model state, signed SecureStore settings storage round-trip plus kill/relaunch persistence, network requests, and memory pressure. Export the redacted Device QA JSON report after running checks, validate it with `pnpm test:mobile:device-qa-report /path/to/report.json`, and attach it to release evidence; report records must include app identity metadata plus check `outcome`, `result`, `startedAt`, `finishedAt`, and `durationMs` fields.
- App binary size and first-run model download review, using `.agents/ios-local-model-runtime-strategy.md` as the local model/cache gate.
- Privacy permission strings reviewed in context.

## Known Platform Differences

- PWA service worker features do not map to native app updates.
- Web Speech API does not exist in React Native; it must be replaced.
- Browser Web Workers and cross-origin isolation headers do not map directly to iOS native runtime.
- Canvas-based image overlay must be rebuilt with React Native/SVG/native image rendering.
- Large WASM/ONNX browser assets are not automatically suitable for iOS app packaging.

## Open Questions

1. Should the first TestFlight build allow cloud-only mode while local model work continues?
2. Which iOS minimum version do we want to commit to?
3. Can Apple Vision remain the shipped local OCR baseline after menu/sign/receipt QA, or do we need a custom PP-OCR pack?
4. Should mobile expose every advanced web setting immediately, or hide advanced sections behind an "Advanced" toggle?
5. Do we want EAS Build as the canonical build path, or local Xcode builds first?
6. Is the currently enforced `com.backrunner.tabitomo` bundle identifier final for App Store/TestFlight, or only the migration default?

## Immediate Follow-Up Queue

1. Real-provider QA: `pnpm test:provider-smoke` now provides the standard credential-gated harness for Translation, streaming Explanation, streaming Quick Q&A, Japanese furigana, VLM, OCR, and ASR. Release iOS simulator mock-provider coverage now exists for the three text flows plus VLM/OCR image flows and cloud ASR multipart upload; still run the harness with real credentials and verify the same flows on simulator/iPhone UI.
2. Dark mode visual QA: release simulator first-screen screenshots passed; deterministic smoke now covers settings, QR preview, settings local-runtime preview, settings model-pack compatibility preview, QR scanner surface, iOS Device QA surface, OCR overlay, image lightbox, long text states, markdown result rendering, Japanese furigana rendering, language picker, and the text-mode segmented control; continue checking real QR scan/camera capture and real content on device.
3. OCR overlay visual QA: Expo web smoke and iOS Release mock image-provider smoke now cover album/image request paths, VLM image streaming, OCR geometry parsing, and OCR overlay item generation with per-line translation; focused iOS smoke also covers opening the translated image lightbox; still compare native OCR overlay screenshots against web Canvas output on menu/sign/photo examples and tune label sizing.
4. Native iOS build verification: maintain `pnpm test:mobile:ios-smoke` for Release simulator build/install/launch, parity preview screenshots, settings QR import callback-chain result/leak checks, encrypted config round-trip result checks, Settings Hunyuan-MT output-mode result/leak checks, native mock text-provider result/leak checks, native mock image-provider result/leak checks, and native mock speech-provider result/leak checks; use `IOS_SMOKE_SCENES=settings-qr-import pnpm test:mobile:ios-smoke` for focused QR import regression debugging, `IOS_SMOKE_SCENES=settings-hunyuan-output pnpm test:mobile:ios-smoke` for focused Hunyuan output-mode regression debugging, and `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` for focused Device QA rendering checks. The hidden Device QA surface now includes Settings storage, Provider text, Provider image, Provider speech, and Model pack storage checks plus a redacted JSON report copy/share path with per-check outcome/timing records. Still verify `@tabitomo/native-speech`, `@tabitomo/native-vision`, real camera QR decoding, Device QA Provider text execution with real credentials, Device QA Provider image execution with real VLM/OCR credentials, Device QA Provider speech execution with real ASR credentials, Device QA Model pack storage execution, and SecureStore kill/relaunch persistence behavior on a signed real-iPhone build.
5. Native local OCR: Apple Vision replacement is implemented initial; compare against web PP-OCR on menus/signs/receipts. If Vision is insufficient, follow `.agents/ios-local-model-runtime-strategy.md` and prototype PP-OCR through ONNX Runtime Mobile before attempting Core ML conversion.
6. Native local ASR: Apple on-device Speech is wired for the mobile Local provider where the selected locale supports it. If custom offline ASR is required, follow `.agents/ios-local-model-runtime-strategy.md` and prototype `whisper.cpp` with Core ML/Metal first; evaluate sherpa-onnx native iOS only if SenseVoice/Cantonese coverage is required.
7. Model-pack cache manager: shared manifest/installed metadata, Settings UI, native manifest URL download, byte/SHA-256 verification, staging install, previous-pack backup before replacement, same-version replacement, Documents-backed metadata persistence, delete, compatibility status, activation selection, deterministic simulator tiny-pack first-install/replacement/delete smoke, and Device QA tiny in-memory install/delete check are implemented initial. Backup/staging cleanup and activation selection have smoke coverage; next run the Device QA model-pack check on a signed real iPhone and then wire real custom runtime adapters behind the selector.
8. Settings/audio parity audit: `pnpm test:core` now compares web/core default settings, API format options, speech normalization, web `loadSettings` normalization, shared cloud ASR request behavior, model-pack metadata normalization, and model-pack install metadata invariants; still rerun whenever the web settings schema, speech provider flow, or model-pack manifest changes.
9. iOS smoke test: current Release smoke passes startup plus deterministic native previews for main translator, markdown assistant result, long-text Q&A, OCR overlay, image lightbox, furigana, language picker, QR scanner camera surface, hidden iOS Device QA surface with Settings storage, Provider text, Provider image, Provider speech, Model pack storage, and redacted report controls, settings sheet, settings QR preview, settings QR import callback-chain, settings config round-trip, Settings Hunyuan-MT output-mode parity, native mock text-provider smoke, native mock image-provider smoke, native mock speech-provider smoke, settings local-runtime preview, settings model-pack compatibility preview, model-pack first-install/replacement/delete, and first-run setup choice/manual/import; focused `IOS_SMOKE_SCENES=settings-hunyuan-output pnpm test:mobile:ios-smoke`, `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`, and `IOS_SMOKE_SCENES=setup-choice,setup-manual pnpm test:mobile:ios-smoke` also pass. Still expand into permission-backed simulator/dev-client checks for camera capture, photo import, mic recording, Apple Speech, cloud ASR, TTS, signed config save/load after relaunch, OCR, VLM, and all three text modes against real providers.
10. Expo web feature-depth QA: expanded smoke now covers setup, real encrypted `.ttconfig` import/export, imported settings persistence, QR preview generation, Settings import restore, Local models settings rendering, core main-surface interactions, settings save/reload persistence, mock-provider text modes, album file selection, mock-provider VLM image translation, and mock-provider OCR overlay; continue checking QR camera scan in a browser/device.
11. Release config gate: `pnpm test:mobile:release-readiness` now checks app config, current `com.backrunner.tabitomo` bundle id, build number `1`, iOS deployment target `16.4`, prebuilt Info.plist privacy strings, native dependencies, smoke scripts, Device QA report validator, Device QA app identity metadata, mobile realtime/VAD honesty guard, web/mobile default-language parity, strict release-evidence sample-fixture guard, and QA docs. Keep it in the local/CI release preflight whenever `app.json`, `Podfile.properties.json`, package scripts, native iOS project files, or release evidence scripts change.
12. Device QA report gate: `pnpm test:mobile:device-qa-report` validates a checked-in sample fixture for schema/redaction/app-identity coverage, and `pnpm test:mobile:device-qa-report /path/to/exported-report.json` is required for signed real-iPhone release evidence. The release validator defaults to `TABITOMO_DEVICE_QA_REQUIRED=all`, and strict release evidence rejects the checked-in sample fixture even when it passes schema validation.
13. Test harness: choose Maestro, Detox, or Expo-compatible smoke tests for the core iOS flows.

## Decision Log

- 2026-07-08: Use Expo SDK 57 for the mobile app scaffold.
- 2026-07-08: Use `expo-dev-client` because local model parity needs native modules.
- 2026-07-08: Mobile OCR can use General AI through shared core when `imageOCR.useGeneralAI` is enabled; VLM "Use OCR" fallback also respects that route.
- 2026-07-08: Added React Native `useColorScheme` theme tokens for mobile light/dark mode across the translator, sheets, buttons, inputs, QR, and camera scan surfaces.
- 2026-07-08: Improved mobile OCR overlay parity by using OCR `rotate_rect`/polygon geometry, percentage-sized native labels, rotation transforms, and web-aligned OCR source/translation text population.
- 2026-07-08: Treat Core ML/local model work as a native research and implementation track, not a JavaScript-only port.
- 2026-07-08: Keep the existing Vite web app intact while adding `apps/mobile` and `packages/tabitomo-core`.
- 2026-07-08: Implemented initial native Expo translator workspace in `apps/mobile/App.tsx`.
- 2026-07-08: Added SecureStore-backed mobile settings persistence.
- 2026-07-08: Added `expo-audio`, `expo-image-picker`, `expo-image-manipulator`, `expo-clipboard`, `expo-speech`, `expo-linear-gradient`, and `lucide-react-native` for native parity.
- 2026-07-08: Verified `pnpm --dir apps/mobile typecheck`, `npx expo-doctor apps/mobile`, and `pnpm --dir apps/mobile exec expo export --platform ios --output-dir /tmp/tabitomo-expo-export`.
- 2026-07-08: Added Web-compatible encrypted config payload export/import to `@tabitomo/core` using PBKDF2-SHA256 and AES-GCM.
- 2026-07-08: Added mobile Import/Export settings section with clipboard payload export, paste import, SVG QR display, and `expo-camera` QR scan import.
- 2026-07-08: Verified encrypted config round trip with `pnpm dlx tsx`.
- 2026-07-08: Re-verified `pnpm --dir apps/mobile typecheck`, `npx expo-doctor apps/mobile`, and iOS `expo export` after QR/import-export work.
- 2026-07-08: Added `@tabitomo/native-speech`, a local Expo Apple module wrapping iOS Speech framework recognition for the mobile `web-speech` provider path.
- 2026-07-08: Added `NSSpeechRecognitionUsageDescription` and wired native speech result/error/state events into the Expo app, with cloud recording fallback when native speech is unavailable.
- 2026-07-08: Aligned workspace React/ReactDOM to `19.2.3` so Expo SDK 57 and the local native module resolve a single React/native module peer tree.
- 2026-07-08: Verified `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm --dir packages/tabitomo-native-speech exec tsc --noEmit`, `pnpm --dir apps/mobile typecheck`, `npx expo-doctor apps/mobile`, Expo Apple autolinking, and iOS `expo export` after native speech work.
- 2026-07-09: Generated the iOS native project with Expo prebuild, installed Pods, and verified generic iOS Simulator `xcodebuild` for the Expo dev-client app.
- 2026-07-09: Added explicit `NSMicrophoneUsageDescription` and aligned image-picker/camera/audio microphone permission strings so prebuild preserves the microphone privacy key.
- 2026-07-09: Added `@tabitomo/native-vision`, a local Expo Apple module using Apple Vision on-device text recognition for mobile OCR mode when `imageOCR.provider` is `local-ppocr`.
- 2026-07-09: Wired mobile OCR mode to use native Vision OCR on iOS, then reuse the existing shared translation and native overlay pipeline.
- 2026-07-09: Verified `TabitomoNativeSpeech` and `TabitomoNativeVision` are installed as Pods and linked by the app through generic iOS Simulator `xcodebuild`.
- 2026-07-09: Built a Release iOS Simulator app, installed it into a temporary simulator device set, launched it, and captured light/dark first-screen screenshots; the main translator UI rendered without blank canvas or obvious overlap.
- 2026-07-09: Added shared `@tabitomo/core` assistant helpers for Explanation and Quick Q&A, then wired the Expo app's native main surface with a text-mode segmented control and voice-to-current-mode behavior.
- 2026-07-09: Added a lightweight React Native markdown result renderer so mobile VLM, Explanation, and Quick Q&A results do not expose common markdown syntax as raw text.
- 2026-07-09: Added shared Japanese furigana annotation tokens with provider fallback and a native React Native ruby-style renderer for Japanese translation results; local kuroshiro/native dictionary parity remains a release decision.
- 2026-07-09: Moved web-aligned settings normalization into shared core so mobile storage and import/export handle legacy `local-whisper`, Hunyuan-MT plain output mode, OCR provider fallback, and API format fallback consistently.
- 2026-07-09: Added Expo web runtime dependencies and a web storage fallback for the mobile app; verified `expo export --platform web` and Playwright first-screen smoke without the previous SecureStore runtime error.
- 2026-07-09: Added native Expo first-run setup wizard that mirrors the web WelcomeWizard flow with manual provider setup, SiliconFlow Hunyuan-MT quick fill, encrypted config paste/file import, and QR scan import.
- 2026-07-09: Verified the Expo web export shows the first-run setup wizard and manual translation setup step with Playwright screenshots.
- 2026-07-09: Added `@tabitomo/core` Node test fixtures for legacy settings normalization, Hunyuan-MT output-mode detection, versioned config wrapping, encrypted `.ttconfig` round trips, and bad-password rejection; exposed root `pnpm test:core`.
- 2026-07-09: Added root `pnpm test:mobile:web-smoke`, a scriptable Expo web export + Playwright smoke covering first-run setup, manual setup, import setup, skip flow, and runtime errors.
- 2026-07-09: Added root `pnpm test:mobile:ios-smoke`, a scriptable iOS Release simulator smoke that builds `tabitomo`, creates a temporary iPhone simulator, installs `com.backrunner.tabitomo`, launches it, and captures light/dark first-screen screenshots.
- 2026-07-09: Verified `pnpm test:mobile:ios-smoke` on iPhone 16 / iOS 26.5 simulator; Release build, native module linking, JS/Hermes bundling, app install, app launch, and screenshot capture all passed.
- 2026-07-09: Added shared `@tabitomo/core` provider streaming support for OpenAI-compatible chat SSE, OpenAI Responses text-delta SSE, Anthropic content-delta SSE, non-streaming fallback responses, and common thinking/box-token cleanup.
- 2026-07-09: Wired Expo mobile Explanation, Quick Q&A, and VLM image translation to stream provider deltas into the native result panel instead of waiting for full response completion.
- 2026-07-09: Expanded `pnpm test:core` to run all core test files and added provider streaming fixtures for OpenAI-compatible, Anthropic, and thinking-token cleanup behavior.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` after the streaming changes; Release simulator build, install, launch, Hermes bundle startup, and light/dark first-screen screenshots passed.
- 2026-07-09: Added stable accessibility labels/roles to key Expo main-surface controls and settings footer buttons, then expanded `pnpm test:mobile:web-smoke` to cover first-run setup plus text-mode switching, source input, image-mode controls, language picker, settings sections, settings save/reload persistence, and runtime errors.
- 2026-07-09: Wired the mobile `local` speech provider to iOS on-device Speech when the selected locale supports it, with native capability detection and an explicit on-device recognition flag in `@tabitomo/native-speech`.
- 2026-07-09: Fixed `SettingsSheet` draft synchronization when settings change outside the sheet, so first-run encrypted config imports are reflected when opening Settings.
- 2026-07-09: Expanded `pnpm test:mobile:web-smoke` to generate a real encrypted `.ttconfig` payload with `@tabitomo/core`, import it through the Expo first-run import flow, and verify imported General AI settings persist before continuing the main-surface smoke.
- 2026-07-09: Added `@tabitomo/core` settings parity tests that compare web and core defaults, API format options, speech normalization, and web storage normalization.
- 2026-07-09: Fixed web `loadSettings` API format normalization so invalid legacy `generalAI.apiFormat` values fall back to `openai-chat`, matching shared core behavior.
- 2026-07-09: Expanded `pnpm test:mobile:web-smoke` with a CORS-aware mock OpenAI-compatible provider, then verified actual Expo UI execution for Translation, streaming Explanation, and streaming Quick Q&A.
- 2026-07-09: Expanded `pnpm test:mobile:web-smoke` to drive Expo web album file selection with a temporary PNG and verify streaming VLM image translation through the mock provider.
- 2026-07-09: Expanded `pnpm test:mobile:web-smoke` to configure cloud OCR, drive album file selection in OCR overlay mode, mock OCR `words_info` geometry, verify per-line translation, and assert OCR/image provider requests.
- 2026-07-09: Expanded `pnpm test:mobile:web-smoke` to verify Settings export payload generation, QR preview rendering, and Settings import restore with the exported encrypted payload.
- 2026-07-09: Added shared `@tabitomo/core` cloud ASR tests for local-provider rejection, missing config errors, key/endpoint fallback order, multipart transcription requests, abort signal forwarding, provider error surfacing, and response parsing.
- 2026-07-09: Aligned the Vite web cloud ASR helper with the shared mobile/core cloud ASR fallback order: speech-specific key, translation key, General AI key; translation endpoint, then General AI endpoint.
- 2026-07-09: Added a simulator-only Expo smoke-scene harness using `Documents/tabitomo-smoke-scene.json` so `pnpm test:mobile:ios-smoke` can verify native rendering for the main translator, markdown assistant output, OCR overlay, furigana renderer, and settings sheet without relying on fragile simulator tap automation or custom URL confirmation dialogs.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` on iPhone 16 / iOS 26.5 simulator with the smoke-scene harness; Release build, install, launch, light/dark screenshots, five parity scene screenshots, and screenshot-difference checks passed.
- 2026-07-09: Expanded the simulator-only smoke-scene harness to cover long-text Q&A, language picker, settings QR export preview, and first-run import setup in addition to the existing main, markdown, OCR overlay, furigana, and settings scenes.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` on iPhone 16 / iOS 26.5 simulator after the smoke expansion; Release build, install, launch, light/dark screenshots, nine parity scene screenshots, and screenshot-difference checks passed.
- 2026-07-09: Added `pnpm test:provider-smoke`, a credential-gated real-provider QA harness for shared-core Translation, streaming Explanation, streaming Quick Q&A, provider-backed Japanese furigana, streaming VLM image translation, cloud OCR, and cloud ASR. The no-credential dry-run passes with skipped checks; real-provider execution remains pending.
- 2026-07-09: Added a QR scanner simulator smoke scene and camera permission grant to `pnpm test:mobile:ios-smoke`, so the native `expo-camera` scanner sheet and scan-frame surface are covered in Release simulator screenshots. Real QR decoding still requires device/browser camera QA.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` on iPhone 16 / iOS 26.5 simulator after QR scanner coverage; Release build, install, camera permission grant, launch, light/dark screenshots, ten parity scene screenshots, and screenshot-difference checks passed.
- 2026-07-09: Added `.agents/ios-real-device-qa.md` plus hidden `tabitomo://smoke?scene=device-qa` Expo sheet for real-iPhone TTS, mic, Apple Speech, on-device ASR availability, camera/photo, Vision OCR, share sheet, and document-picker checks; added the surface to iOS simulator smoke rendering.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm test:provider-smoke` dry-run, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke`; iOS Release simulator smoke now covers 11 scenes including the hidden Device QA surface.
- 2026-07-09: Added Settings native local-runtime validation for Local ASR and Local PP-OCR. The checks query Apple Speech/on-device Speech and Apple Vision availability for the current source language, and `pnpm test:mobile:ios-smoke` now covers a 12th `settings-local` preview scene.
- 2026-07-09: Documented the iOS local model runtime and cache strategy in `.agents/ios-local-model-runtime-strategy.md`: Apple Speech/Vision remain the first native baseline, custom model packs are opt-in downloads behind checksum/license/benchmark gates, `whisper.cpp` + Core ML/Metal is the first custom ASR prototype, and custom PP-OCR is deferred until real-image Vision QA proves it is necessary.
- 2026-07-09: Added shared model-pack manifest and installed-pack metadata types/tests in `@tabitomo/core`, installed-pack persistence in the Expo app, and a Settings Local models section showing Apple Speech/Vision baseline, cache root, custom pack count/size, and installed-pack deletion. At this point, download/checksum/install and activation selection were still the next model-pack implementation steps; later entries track those completions.
- 2026-07-09: Added a native Expo model-pack manifest URL installer that downloads and normalizes the manifest, downloads pack files into a temporary cache directory, verifies byte count and SHA-256, copies verified files into `Documents/tabitomo/model-packs/<id>/<version>`, persists installed metadata, and exposes the flow from Settings. Runtime adapter activation and real-device tiny-pack QA remain pending.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` after the model-pack manifest installer UI; Release simulator build, install, launch, light/dark screenshots, 12 parity scene screenshots, and screenshot-difference checks passed.
- 2026-07-09: Added installed model-pack compatibility gates in `@tabitomo/core` for iOS/app version, runtime adapter availability, invalid installs, and platform support. Expo Settings now shows installed custom pack count, ready count, and per-pack Ready/Needs runtime/Unsupported/Invalid status so downloaded packs are not treated as activated runtimes until an adapter exists.
- 2026-07-09: Re-verified `pnpm test:core`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke` after installed model-pack compatibility status UI; iOS Release simulator smoke again passed 12 scenes.
- 2026-07-09: Added a `settings-model-packs` simulator smoke scene with synthetic installed packs to cover Ready and Needs runtime compatibility states in Settings.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke` after the synthetic model-pack preview; iOS Release simulator smoke passed 13 scenes.
- 2026-07-09: Hardened model-pack manifests and installed metadata in `@tabitomo/core`: unsafe file names are rejected, manifest total bytes must match file bytes, and installed file metadata must match the source manifest before Settings can persist a pack.
- 2026-07-09: Hardened the Expo native model-pack installer to copy verified downloads into a staging directory and back up an existing active pack before replacing it, instead of deleting the active pack before the new pack is ready.
- 2026-07-09: Re-verified `pnpm test:core`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke` after model-pack installer hardening; iOS Release simulator smoke passed 13 scenes.
- 2026-07-09: Moved non-secret installed model-pack metadata out of SecureStore and into `Documents/tabitomo-mobile-model-packs.v1.json`, keeping provider/API-key settings in SecureStore while avoiding simulator/keychain entitlement failures for model-pack state.
- 2026-07-09: Added a `settings-model-pack-install` simulator smoke scene plus local HTTP manifest/file server so `pnpm test:mobile:ios-smoke` verifies tiny model-pack download, byte/SHA-256 validation, staged install, metadata persistence, and delete without external network dependencies.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck` and `pnpm test:mobile:ios-smoke` after the metadata storage fix and tiny model-pack install/delete smoke; iOS Release simulator smoke passed 14 scenes and reported `Model-pack install smoke passed: smoke-server-fallback-tiny@2026.07.smoke, bytes=31`.
- 2026-07-09: Expanded `settings-model-pack-install` to install the same tiny pack twice, covering first install plus same-version replacement instead of only the first activation path.
- 2026-07-09: The same-version replacement smoke exposed a metadata URI bug: after `Directory.rename()`, the active directory object could still point at the renamed `.previous-*` backup, so installed file metadata did not resolve to real active files.
- 2026-07-09: Fixed the replacement metadata bug by rebuilding the active directory/file URIs after staged activation before persisting `InstalledModelPack` metadata.
- 2026-07-09: Added cleanup/list helpers for same-version `.staging-*` and `.previous-*` artifacts, then updated the model-pack smoke to assert no successful replacement/delete residue remains.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm test:core`, `pnpm test:provider-smoke` dry-run, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke`; iOS Release simulator smoke passed 14 scenes with model-pack `replacementClean: true`.
- 2026-07-09: Added redacted JSON report generation to the hidden iOS Device QA surface, with Copy report and Share report actions that omit provider credentials, imported config payloads, and local image/file URIs.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:web-smoke`, and `pnpm test:mobile:ios-smoke` after Device QA report export; iOS Release simulator smoke passed 14 scenes and rendered the updated Device QA surface.
- 2026-07-09: Expanded Device QA report records with per-check `outcome`, `result`, `startedAt`, `finishedAt`, and `durationMs` fields while continuing to omit provider credentials, imported config payloads, and local image/file URIs.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck` and `pnpm test:mobile:ios-smoke` after timed Device QA records; iOS Release simulator smoke passed 14 scenes and reported `Model-pack install smoke passed: smoke-server-fallback-tiny@2026.07.smoke, bytes=31`.
- 2026-07-09: Added a `settings-config-roundtrip` simulator smoke scene that exports encrypted settings via shared core, imports the prefixed payload, validates General AI, translation override, speech, OCR, VLM, and API-key parity, attempts native settings save/load, and writes a redacted result without API keys or encrypted payload.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck` and `pnpm test:mobile:ios-smoke` after config round-trip coverage; iOS Release simulator smoke passed 15 scenes and reported `Config round-trip smoke passed: payloadLength=1752`. Unsigned simulator SecureStore persistence can report `skipped-secure-store-entitlement`, so signed real-device/TestFlight persistence remains a release gate.
- 2026-07-09: Added a hidden Device QA `Settings storage` check that writes synthetic General AI, translation override, speech, OCR, and VLM settings through the mobile SecureStore path, reloads and validates the fields including API-key presence, restores the prior settings state, and records only a redacted result.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after the Device QA Settings storage check; iOS Release simulator smoke still passed 15 scenes, config round-trip reported `payloadLength=1752`, and model-pack install smoke passed.
- 2026-07-09: Added a `text-provider-smoke` iOS simulator scene that runs Release/Hermes shared-core `translateText`, streaming `explainTextStream`, and streaming `answerQuestionStream` against a local mock OpenAI-compatible endpoint, then writes a redacted result without the provider key marker.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after native text-provider smoke coverage; iOS Release simulator smoke passed 16 scenes, text-provider smoke reported `requests=3`, config round-trip reported `payloadLength=1752`, and model-pack install smoke passed.
- 2026-07-09: Added an `image-provider-smoke` iOS simulator scene that runs Release/Hermes shared-core streaming VLM, cloud OCR, and OCR-line translation against a local mock OpenAI-compatible endpoint, verifies OCR geometry parsing, and writes a redacted result without the provider key marker or image payload.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, and `pnpm test:mobile:ios-smoke` after native image-provider smoke coverage; iOS Release simulator smoke passed 17 scenes, image-provider smoke reported `requests=3`, text-provider smoke reported `requests=3`, config round-trip reported `payloadLength=1752`, and model-pack install smoke passed.
- 2026-07-09: Added a `speech-provider-smoke` iOS simulator scene that runs Release/Hermes shared-core `transcribeAudioFile` against a local mock OpenAI-compatible `/v1/audio/transcriptions` endpoint, verifies one multipart upload request, and writes a redacted result without the provider key marker or local audio file details.
- 2026-07-09: Fixed Expo iOS cloud ASR uploads to pass `expo-file-system` `File`/FileBlob objects instead of unsupported React Native `{ uri, name, type }` FormData parts under Expo 57 winter `fetch`.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, `pnpm test:core`, `pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after native speech-provider smoke coverage; iOS Release simulator smoke passed 18 scenes, speech-provider smoke reported `requests=1`, image-provider smoke reported `requests=3`, text-provider smoke reported `requests=3`, config round-trip reported `payloadLength=1752`, model-pack install smoke passed, and Expo web smoke passed.
- 2026-07-09: Added a `settings-qr-import` iOS simulator scene that generates a real encrypted `.ttconfig` payload inside the Release/Hermes app, injects it through the native QR scanner sheet callback, imports through shared-core config decrypt/migration, validates provider/API-key field parity, attempts native settings save, and writes a redacted QR import smoke result without the password, API-key markers, or encrypted payload.
- 2026-07-09: Added `IOS_SMOKE_SCENES` filtering for focused iOS smoke runs, then verified `IOS_SMOKE_SCENES=settings-qr-import pnpm test:mobile:ios-smoke`; QR import smoke reported `payloadLength=1784`.
- 2026-07-09: Re-verified `pnpm test:mobile:ios-smoke` after QR import coverage; iOS Release simulator smoke passed 19 scenes, QR import smoke reported `payloadLength=1784`, config round-trip reported `payloadLength=1752`, text-provider smoke reported `requests=3`, image-provider smoke reported `requests=3`, speech-provider smoke reported `requests=1`, model-pack install smoke reported `bytes=31`, and Expo web smoke also passed.
- 2026-07-09: Aligned the Expo mobile main text surface with the web text-input behavior by adding debounced auto-run for Translation, Explanation, and Quick Q&A, aborting stale in-flight text requests, preserving manual action buttons, and adding a 10-minute in-memory translation cache. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, `pnpm test:core`, `pnpm test:mobile:web-smoke`, and focused `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`; the focused Release simulator smoke passed 1 scene.
- 2026-07-09: Added a native mobile image lightbox for translated image previews, made OCR/VLM image previews pressable, and added the `image-lightbox` simulator smoke scene to the default iOS scene matrix. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, focused `IOS_SMOKE_SCENES=image-lightbox pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke`; the focused Release simulator smoke passed 1 scene and the default iOS scene matrix now contains 20 scenes.
- 2026-07-09: Re-verified full `pnpm test:mobile:ios-smoke` after adding `image-lightbox`; iOS Release simulator smoke passed 20 scenes, QR import smoke reported `payloadLength=1784`, config round-trip reported `payloadLength=1752`, text-provider smoke reported `requests=3`, image-provider smoke reported `requests=3`, speech-provider smoke reported `requests=1`, model-pack install smoke reported `bytes=31`, and the full matrix captured the new `smoke-image-lightbox.png` scene.
- 2026-07-09: Added `installModelPackFromBytes` and shared the native model-pack staging/activation/metadata path between URL manifest installs and Device QA local-byte installs. The hidden Device QA surface now has a Model pack storage check that creates a tiny in-memory pack, verifies persisted metadata/files and staging cleanup, deletes it, restores previous installed-pack metadata, and reports only pack id/bytes.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm test:mobile:web-smoke`, and focused `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` after the Device QA Model pack storage check; the focused Release simulator smoke passed 1 scene and confirmed the Device QA surface renders in Release/Hermes.
- 2026-07-09: Added a Device QA `Provider text` check that runs current settings through shared-core Translation, streaming Explanation, streaming Quick Q&A, and provider-backed Japanese furigana with 60-second per-step aborts. The redacted report records only compact pass/fail metadata and output lengths/tokens, omitting API keys, endpoints, imported config payloads, provider response bodies, and local file/image URIs.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm test:mobile:web-smoke`, and focused `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` after adding the Device QA Provider text check; Expo web smoke passed, and the focused Release simulator smoke passed 1 scene and confirmed the updated Device QA surface renders in Release/Hermes.
- 2026-07-09: Added a Device QA `Provider image` check that runs current settings through shared-core streaming VLM image translation, cloud OCR, and OCR-line translation using a generated "CAFE" PNG with 60-second per-step aborts. The redacted report records only compact pass/fail metadata, lengths, OCR counts, and line-translation counts, omitting API keys, endpoints, imported config payloads, provider response bodies, image data URLs, and local file/image URIs.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, focused `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after adding the Device QA Provider image check; Expo web smoke passed, and the focused Release simulator smoke passed 1 scene and confirmed the Device QA surface renders the new Provider image entry in Release/Hermes.
- 2026-07-09: Added a Device QA `Provider speech` check that writes a valid short synthetic WAV fixture and runs current speech settings through shared-core `transcribeAudioFile` with a 60-second timeout. The redacted report records only provider type and transcript length, omitting transcript text, API keys, endpoints, imported config payloads, provider response bodies, and local audio file URIs. The existing iOS simulator `speech-provider-smoke` fixture now also writes a valid WAV instead of a pseudo-WAV text payload.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `node --check scripts/ios-simulator-smoke.mjs`, focused `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after adding the Device QA Provider speech check; Expo web smoke passed, and the focused Release simulator smoke passed 1 scene and confirmed the Device QA surface renders the new Provider speech entry in Release/Hermes.
- 2026-07-09: Added shared-core `selectModelPackActivation` so local-model selection prefers the newest ready installed pack, falls back to the native Apple Speech/Vision baseline when no custom pack is ready, and reports no-compatible-pack/no-baseline states explicitly. Expo Settings now renders Active ASR and Active OCR rows from that selector, and the `settings-model-pack-install` smoke asserts the just-installed tiny pack is selected as the active ASR candidate.
- 2026-07-09: Re-verified `pnpm test:core`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, focused `IOS_SMOKE_SCENES=settings-model-pack-install pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after model-pack activation selection; the focused install smoke reported `bytes=31` and activation status `installed-pack`.
- 2026-07-09: Added mobile Settings Hunyuan-MT output-mode parity: when the translation model is Hunyuan-MT, the Settings sheet now forces plain output and disables Structured mode to match the web app. Added the `settings-hunyuan-output` iOS simulator scene with a redacted result file and a visible smoke-only status block so screenshot distinctness proves the scene changed.
- 2026-07-09: Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, focused `IOS_SMOKE_SCENES=settings-hunyuan-output pnpm test:mobile:ios-smoke`, full `pnpm test:mobile:ios-smoke`, and `pnpm test:mobile:web-smoke` after Hunyuan output-mode parity; the focused smoke reported `model=tencent/Hunyuan-MT-7B, outputMode=plain`, and the full iOS Release simulator matrix passed 21 scenes.
- 2026-07-09: Added `setup-choice` and `setup-manual` iOS simulator scenes so first-run setup visual smoke now covers setup choice, manual translation setup, and import setup. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/ios-simulator-smoke.mjs`, focused `IOS_SMOKE_SCENES=setup-choice,setup-manual pnpm test:mobile:ios-smoke`, `pnpm test:mobile:web-smoke`, and full `pnpm test:mobile:ios-smoke`; the focused setup smoke passed 2 scenes, and the full iOS Release simulator matrix passed 23 scenes.
- 2026-07-09: Added a source-controlled mobile release-readiness gate. `apps/mobile/app.json` now records iOS `buildNumber=1`, `apps/mobile/ios/Podfile.properties.json` pins `ios.deploymentTarget=16.4`, and `pnpm test:mobile:release-readiness` verifies release-facing config checks covering the Expo source config, prebuilt Xcode project, Info.plist privacy strings, plugins, dependencies, smoke scripts, and QA docs. Re-verified `node --check scripts/mobile-release-readiness.mjs`, `node --check scripts/ios-simulator-smoke.mjs`, `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:release-readiness`, `pnpm test:mobile:web-smoke`, and `pnpm test:provider-smoke` dry-run. This is a configuration gate only; signed real-device/TestFlight QA remains required.
- 2026-07-09: Added `pnpm test:mobile:device-qa-report`, a JSON validator for exported iOS Device QA reports. It verifies schema, app identity metadata, iOS runtime metadata, required check IDs, passed required outcomes, ISO timestamps, non-negative durations, and redaction rules for API keys, config payloads, endpoint URLs, image data URLs, and local file/photo URIs. A checked-in sample fixture keeps the validator covered locally; real release evidence still requires running the command against the exported signed-iPhone report. `pnpm test:mobile:release-readiness` now verifies 125 release-facing checks including the report validator, fixture, Device QA app identity fields, mobile realtime/VAD honesty guard, web/mobile default-language parity, release-evidence sample-fixture guard, parity audit, EAS profiles, `.easignore`, EAS release-path docs, and local Xcode preflight docs/script.
- 2026-07-09: Added `pnpm test:mobile:release-evidence` and `.agents/ios-release-evidence.zh-CN.md`. The script emits a redacted release evidence manifest covering app version/config, git status, local Xcode/EAS availability, provider-smoke env completeness, and optional signed-iPhone Device QA report validation. Development mode reports gaps without requiring credentials or a device report; `--strict` requires `TABITOMO_IOS_RELEASE_PATH`, all provider-smoke inputs, and a valid signed-iPhone report.
- 2026-07-09: Added `pnpm test:mobile:parity-audit`. The audit now checks 270 static parity evidence anchors covering the non-WebView native shell, shared-core exports and mobile integration, text Translation/Explanation/Q&A, result copy success feedback, speech, image VLM/OCR/overlay/lightbox, image language-direction context, Settings, first-run setup, config import/export, secure input reveal controls, local model packs, all 24 iOS smoke scenes, all 17 Device QA checks, Device QA report app identity metadata, mobile realtime/VAD honesty guard, web/mobile default-language parity, release-evidence sample-fixture guard, Expo web smoke coverage, and provider-smoke coverage. It is included in release-readiness as a regression guard; real-provider and real-device QA remain required.
- 2026-07-09: Device QA reports now export app identity metadata (`bundleIdentifier=com.backrunner.tabitomo`, `buildNumber=1`, and `buildSource=expo-native`), the report validator requires those fields, and `pnpm test:mobile:release-evidence -- --strict` rejects the checked-in sample fixture so it cannot be used as signed real-device/TestFlight evidence. Re-verified `node --check scripts/mobile-release-readiness.mjs`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:device-qa-report`, `pnpm test:mobile:release-readiness`, and `pnpm test:mobile:parity-audit`.
- 2026-07-09: Mobile Settings and first-run setup now show Realtime transcription as unavailable in the iOS native runtime, with an explicit record-then-transcribe status note. The Web realtime/VAD setting is preserved for `.ttconfig` compatibility and future native streaming ASR instead of being presented as an active iOS feature. Release-readiness and parity-audit now include regression anchors for this guard. Re-verified `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:release-readiness`, `pnpm test:mobile:parity-audit`, `pnpm test:mobile:release-evidence`, and `git diff --check`.
- 2026-07-09: Shared-core default languages now match the current web first screen (`zh` source to `ja` target). Mobile continues to initialize from shared-core defaults, so the Expo iOS first screen now aligns with the Web UI. Added `packages/tabitomo-core/src/languages.test.ts`, plus release-readiness and parity-audit anchors for the web/shared/mobile default-language contract. Re-verified `pnpm test:core`, `pnpm --dir packages/tabitomo-core exec tsc --noEmit`, `pnpm --dir apps/mobile typecheck`, `pnpm test:mobile:release-readiness`, and `pnpm test:mobile:parity-audit`.
- 2026-07-09: Mobile Settings and first-run setup now expose Eye/EyeOff reveal controls for secure config password and provider API-key fields, aligning the native setup/import UI with the web Import/Export dialog and WelcomeWizard. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:parity-audit` with 265 checks, and focused `IOS_SMOKE_SCENES=settings,setup-manual,setup-import pnpm test:mobile:ios-smoke` with 3 scenes.
- 2026-07-09: Mobile Camera/Album now enters an image language context after a selected asset, swapping source/target languages for OCR/VLM and restoring the direction when the user clears or leaves the image context. This aligns the native app with the web text/image input-method auto-swap while keeping the first-screen text default at `zh -> ja`. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:parity-audit` with 265 checks, `pnpm test:mobile:release-readiness` with 125 checks, and focused `IOS_SMOKE_SCENES=main,image pnpm test:mobile:ios-smoke` with 2 scenes.
- 2026-07-09: Mobile result copy feedback now mirrors the web result area: successful Copy switches the native button to `Copied` with the Check icon for 2 seconds, and new `targetText` resets the feedback state. Re-verified `pnpm --dir apps/mobile typecheck`, `node --check scripts/mobile-parity-audit.mjs`, `pnpm test:mobile:parity-audit` with 270 checks, `pnpm test:mobile:release-readiness` with 125 checks, `git diff --check`, and focused `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke` with 1 scene.
- 2026-07-11: Source-controlled the Expo iOS Xcode project/workspace and added a clean-prebuild-safe config plugin for Xcode-managed automatic signing with team `PB8H83VL3Z`, CloudKit capability metadata, iOS `16.4`, and Expo version/build synchronization. Added project sync/open/build-number/archive/TestFlight scripts plus automatic-signing App Store export options. Re-verified full Expo prebuild + CocoaPods sync, 23 Xcode preflight checks, 176 release-readiness checks, mobile typecheck, 300 parity-audit checks, Web production build, and focused Release iOS simulator smoke for the main scene. A device archive reaches Xcode provisioning and is currently blocked only because this Mac has no signed-in Apple Developer account. This is a native release-tooling change; Web behavior and UI are unchanged.
- 2026-07-11: Made `public/icon.png` the visual source for the Expo/iOS app icon. `pnpm icons:sync-mobile` trims the PWA icon's transparent outer bounds, extends the blue background to a full 1024x1024 square, removes alpha for Apple's AppIcon requirement, and writes matching Expo and Xcode assets; `pnpm test:mobile:icon-parity` compares their decoded RGB pixels. The Xcode project sync now regenerates these assets before prebuild so clean native regeneration cannot restore Expo's placeholder icon.
- 2026-07-11: Re-verified app-icon parity, 310 Web/mobile parity checks, 186 mobile release-readiness checks, Expo Web smoke, and focused `IOS_SMOKE_SCENES=main` Release/Hermes simulator smoke after the icon-source change; the iOS smoke passed 1 scene on iPhone 16 / iOS 26.5.
- 2026-07-09: Added EAS release scaffolding. Root `eas.json` defines development, development-simulator, preview, preview-simulator, production, and iOS submit profiles; `.easignore` excludes node_modules, dist, output, Playwright reports, and test results; `.agents/ios-eas-release-path.zh-CN.md` documents EAS profile usage, account-secret boundaries, common commands, and release rules. `pnpm test:mobile:release-readiness` now validates the EAS scaffold, and `pnpm test:mobile:release-evidence` reports EAS profile and CLI readiness.
- 2026-07-09: Added local Xcode release preflight. `pnpm test:mobile:ios-xcode-preflight` checks the workspace, scheme, Release/iphoneos build settings, bundle id, deployment target, marketing version, build number, Info.plist values, and signing metadata status. The preflight caught and fixed a real drift: `apps/mobile/ios/tabitomo.xcodeproj/project.pbxproj` had `MARKETING_VERSION = 1.0`; it now matches Expo `app.json` version `0.1.0`. `.agents/ios-local-xcode-release-path.zh-CN.md` documents local archive commands, signing preflight, and release rules.
