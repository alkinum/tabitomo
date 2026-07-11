# tabitomo iOS Real Device QA

Status: pending real iPhone execution; redacted in-app QA report export implemented
Primary target: iPhone running a signed native Expo dev-client/TestFlight/local Xcode build
Companion in-app surface: `tabitomo://smoke?scene=device-qa`
Companion report artifact: redacted JSON copied/shared from the Device QA surface
Companion report validator: `pnpm test:mobile:device-qa-report /path/to/tabitomo-ios-device-qa-report.json`
Companion release evidence manifest: `pnpm test:mobile:release-evidence -- --device-report /path/to/tabitomo-ios-device-qa-report.json --out output/tabitomo-ios-release-evidence.json`

## Purpose

This checklist is the release-candidate evidence gate for Expo iOS parity that cannot be proven by simulator screenshots alone.

Use it together with:

- `pnpm test:provider-smoke` with real credentials.
- `pnpm test:mobile:ios-smoke` for Release simulator build/render coverage, encrypted config import/export parity, and redacted result leak checks.
- Manual UI comparison against the current Vite web app for text, image, settings, and import/export flows.

The simulator `settings-config-roundtrip` scene may record `skipped-secure-store-entitlement` when an unsigned Release simulator build lacks the keychain entitlement required by `expo-secure-store`. That is acceptable only for simulator automation after encrypted import parity passes. Release readiness still requires a signed real-device/TestFlight build to persist API keys and settings through SecureStore.

## Setup

1. Install a signed native iOS build on a real iPhone.
2. Configure General AI, translation override if needed, speech, OCR, and VLM from Settings or import a known-good encrypted `.ttconfig`.
3. Open the hidden QA surface from Safari or Notes with `tabitomo://smoke?scene=device-qa`.
4. Keep one menu/sign/receipt image with Japanese or Chinese text in Photos.
5. Prepare one small `.ttconfig` export file for document-picker import.
6. After running Device QA checks, use Copy report or Share report to export the redacted JSON report.
7. Run `pnpm test:mobile:device-qa-report /path/to/tabitomo-ios-device-qa-report.json` against the exported report. The default script target validates only the checked-in sample fixture; release evidence must pass with the real exported iPhone report path.
8. Generate the release evidence manifest with `pnpm test:mobile:release-evidence -- --device-report /path/to/tabitomo-ios-device-qa-report.json --out output/tabitomo-ios-release-evidence.json`. For a release candidate, add `--strict` and set `TABITOMO_IOS_RELEASE_PATH=local-xcode` or `TABITOMO_IOS_RELEASE_PATH=eas`.

## Required Evidence

Record device model, iOS version, build source, bundle identifier, provider endpoints/models, and result for every item.

Also attach the Device QA JSON report. It records app/runtime metadata including bundle identifier, build number, build source, iOS runtime, physical-device/simulator flags, device model/type, OS name/version, source language, image readiness, and each Device QA check result while intentionally omitting provider credentials, imported config payloads, and local image/file URIs.

The exported report must pass `pnpm test:mobile:device-qa-report /path/to/report.json`. The validator checks schema version, app identity metadata, iOS runtime metadata, physical iPhone provenance for non-sample reports, required check IDs, `passed` outcomes for required checks, ISO timestamps, non-negative durations, and redaction rules that reject API-key markers, config payloads, endpoint URLs, image data URLs, and local file/photo URIs. Use `TABITOMO_DEVICE_QA_REQUIRED=core` only for interim debugging; release-candidate evidence uses the default `all` mode.

The Device QA surface includes a `Settings storage` check. It writes synthetic General AI, translation override, speech, OCR, and VLM settings through the mobile SecureStore path, reloads and validates them, restores the previous settings state, and records only a redacted result. Run it before the manual kill/relaunch persistence check.

The `iCloud settings` check saves the current normalized settings through the private CloudKit path, reloads them through the local/cloud timestamp merge, and requires a synced status. Run it while signed into iCloud on a signed build, then repeat once offline and once after reinstall to verify local-only fallback and recovery. The CloudKit payload must use encrypted fields; model-pack binaries must remain device-local.

The Device QA surface also includes a `Model pack` storage check. It creates a tiny in-memory model-pack manifest/file, installs it through the same staging/activation/metadata path used by manifest URL installs, verifies persisted metadata and installed files, confirms staging artifacts are cleaned up, deletes the tiny pack, restores the previous installed-pack metadata, and records only pack id/byte details.

The `Local ASR model` check requires the selected fixed Whisper or SenseVoice model to be downloaded, loads it through sherpa-onnx, and runs a local WAV through inference. The `PP-OCR model` check requires PP-OCR v5 Mobile plus a captured/imported device image, loads detector/recognizer/dictionary files through ONNX Runtime, and runs inference. Reports record only model/runtime IDs, transcript length or line count, and timing; they omit media, local URIs, and recognized content.

The Device QA surface includes a `Provider text` check for real credential runs on device. It uses the current saved settings to run Translation, streaming Explanation, streaming Quick Q&A, and provider-backed Japanese furigana through shared core with per-step timeouts. The report records only pass/fail metadata and compact output lengths/tokens; provider credentials, endpoints, imported config payloads, response bodies, and local image/file URIs must stay omitted.

The Device QA surface includes a `Provider image` check for real VLM/OCR credential runs on device. It uses a generated PNG containing the word "CAFE" to run streaming VLM image translation, cloud OCR, and OCR-line translation through shared core with per-step timeouts. The report records only pass/fail metadata, output lengths, OCR counts, translated-line counts, and timings; provider credentials, endpoints, imported config payloads, response bodies, image data URLs, and local image/file URIs must stay omitted.

The Device QA surface includes a `Provider speech` check for real cloud ASR credential runs on device. It writes a valid short synthetic WAV fixture, uploads it through shared-core `transcribeAudioFile`, and records only provider type plus transcript length. The report must not include transcript text, provider credentials, endpoints, imported config payloads, response bodies, or local audio file URIs. This checks ASR provider configuration and native multipart upload; it does not replace the real microphone capture rows.

Each check record must include:

- `outcome`: `passed` or `failed`
- `result`: short human-readable result or error
- `startedAt` and `finishedAt`: ISO timestamps
- `durationMs`: elapsed runtime for the native check

| Area | Action | Pass evidence | Result |
| --- | --- | --- | --- |
| Startup | Launch app cold and warm | Translator first screen renders, no blank surface, no layout overlap | Pending |
| Settings storage | Run Device QA Settings storage, then save real/provider settings, kill app, relaunch | Device QA storage check passes; signed build persists keys/settings through SecureStore after relaunch; no entitlement error; API key is not shown in logs/report | Pending |
| iCloud settings | Run Device QA iCloud settings while signed into iCloud; repeat offline, on a second device, and after reinstall | Private CloudKit round-trip passes; newer timestamp wins; offline saves stay local and later recover; no API key or payload appears in logs/report | Pending |
| Provider text | Configure real General AI/translation settings, then run Device QA Provider text | Translation, Explanation, Quick Q&A, and furigana pass; report includes timings/lengths but no API keys, endpoints, or provider response bodies | Pending |
| Provider image | Configure real VLM and cloud OCR settings, then run Device QA Provider image | VLM, OCR, and OCR-line translation pass on the generated CAFE image; report includes timings/counts/lengths but no API keys, endpoints, response bodies, image data URL, or local image URIs | Pending |
| Provider speech | Configure real cloud ASR settings, then run Device QA Provider speech | Synthetic WAV upload reaches the ASR provider; report includes provider type/timing/transcript length but no transcript text, API keys, endpoints, response bodies, or local audio URI | Pending |
| Local ASR model | Download the selected Whisper/SenseVoice model, run Device QA Local ASR model, repeat in airplane mode and after relaunch | sherpa-onnx inference completes from downloaded files; report contains only model/runtime, transcript length, and timing | Pending |
| PP-OCR model | Download PP-OCR v5, capture/import a real image, run Device QA PP-OCR model, repeat in airplane mode and after relaunch | ONNX Runtime inference completes; report contains only model/runtime, line count, and timing; inspect rotation/alignment separately | Pending |
| Model pack storage | Run Device QA Model pack, then inspect Local models status | Tiny pack install/delete check passes; metadata is restored; no staging/previous artifacts remain; report does not expose local file URIs | Pending |
| Import setup | Import encrypted `.ttconfig` from file | Settings populate, save, and persist after relaunch | Pending |
| QR import | Scan encrypted settings QR from another screen | Payload imports or shows a clear password/config error | Pending |
| TTS | Run Device QA TTS and main Listen button | Audio plays through iPhone output | Pending |
| Microphone | Grant mic permission and record from main mic button | Recording starts/stops and produces a transcription request or clear error | Pending |
| Cloud ASR | Record speech with configured cloud provider | Transcribed text fills source and feeds current text mode | Pending |
| Apple Speech | Run Device QA Apple Speech and main native speech flow | Permission/availability reported and recognized speech fills source text | Pending |
| On-device ASR fallback | Remove or invalidate the selected downloaded ASR model, then run a supported locale | Uses Apple on-device Speech only as fallback or gives a clear download/unsupported-locale error | Pending |
| Camera capture | Capture a real image from main Camera and Device QA Capture | Image preview appears and can be processed | Pending |
| Photo import | Import the prepared image from Photos | Image preview appears and can be processed | Pending |
| Vision OCR fallback | Remove PP-OCR v5 and run local OCR on a prepared image | Apple Vision is used as fallback and OCR overlay labels align acceptably | Pending |
| Cloud OCR | Select cloud OCR and process prepared image | Source text and translated overlay/result populate | Pending |
| VLM | Select VLM mode and process prepared image | Streaming markdown result appears without raw protocol/thinking noise | Pending |
| Share sheet | Export `.ttconfig` via Share file and Device QA Share | Native share sheet opens and file is readable elsewhere | Pending |
| File picker | Import via Settings and Device QA Import | Picker opens; cancel and valid file states behave clearly | Pending |
| QA report | Run all Device QA checks, then Copy report and Share report, then validate exported JSON | `pnpm test:mobile:device-qa-report /path/to/report.json` passes; redacted JSON contains check outcomes, results, timestamps, durations, and no API keys/config payloads/endpoint URLs/image URIs | Pending |
| Dark mode | Toggle iOS dark mode and repeat main flows | Text remains readable; controls do not overlap | Pending |
| Memory | Repeat image capture/import/OCR/VLM 5 times | No crash or unusable memory pressure | Pending |

## Release Rule

Do not mark Expo iOS parity complete until every P0/P1 item above is passed, intentionally deferred with a release decision, or blocked by a documented platform/provider constraint.

Do not count an unsigned simulator `skipped-secure-store-entitlement` result as SecureStore release evidence. It only proves the encrypted config import path; signed real-device persistence must pass separately.

Do not count the checked-in sample report fixture as real-device evidence. It exists only to keep the report validator covered in local/CI checks. Any report path other than the checked-in sample fixture must declare `runtime.isPhysicalDevice=true` and `runtime.isSimulator=false` to pass validation.
