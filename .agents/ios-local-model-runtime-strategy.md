# tabitomo iOS Local Model Runtime and Cache Strategy

Status: implemented initial. Fixed R2 model distribution, verified native install, sherpa-onnx Whisper/SenseVoice inference, ONNX Runtime PP-OCR inference, deterministic engine selection, and Apple fallback are wired. Signed-device latency, memory, accuracy, rotation, and offline QA remain release gates.
Last updated: 2026-07-11
Primary target: iOS native Expo dev-client/TestFlight build
Related tracker: `.agents/expo-universal-app-requirements.md`

## Purpose

This document turns the Expo parity requirement for local ASR/OCR into an implementable iOS plan.

The app ships native runtime code but downloads model weights only when the user asks. Model files come from the fixed tabitomo R2 domain, are byte/SHA-256 verified, and must load successfully in the native runtime before activation.

## Current Decision

For iOS parity:

- Whisper Base and SenseVoice Small run through sherpa-onnx 1.13.4. `speechRecognition.localEngine` selects exactly one model; another downloaded ASR model cannot override it.
- PP-OCR v5 Mobile runs detector and recognizer ONNX files through ONNX Runtime 1.27.0 with a generated character dictionary.
- Apple on-device Speech and Apple Vision remain recoverable fallbacks when the selected model is absent, incompatible, or cannot run.
- Cloud BYOK ASR/OCR/VLM paths remain separately selectable.
- Runtime code is bundled; model weights are not bundled and never sync through iCloud or `.ttconfig`.
- Fixed manifests are served from `https://assets.tabitomo.alkinum.io/models/...`; the app has no user-entered model path or manifest field.

## Required Research Outputs

| Output | Current answer |
| --- | --- |
| Chosen runtime for OCR | ONNX Runtime 1.27.0 with PP-OCR v5 Mobile detector, recognizer, and `dict.txt`; Apple Vision fallback. |
| Chosen runtime for ASR | sherpa-onnx 1.13.4 offline recognizer for Whisper Base and SenseVoice Small; Apple on-device Speech fallback. |
| Model format and conversion steps | Whisper uses sherpa encoder/decoder int8 ONNX plus tokens; SenseVoice uses int8 ONNX plus tokens; PP-OCR uses det/rec ONNX plus a structured-YAML-derived dictionary. |
| Expected app binary size impact | Apple baseline: near zero beyond native module code. whisper.cpp prototype: expect native runtime/linker impact in the low tens of MB after stripping. ONNX Runtime Mobile or sherpa-onnx prototype: expect a similar or larger low-to-mid tens of MB impact depending on selected operators. |
| Expected first-run model download size | Apple baseline: 0 MB. Whisper tiny/base packs should be treated as tens to low hundreds of MB. Whisper small or larger should be treated as hundreds of MB and opt-in only. Custom OCR det/rec/cls packs should be estimated as tens of MB until measured from the selected PP-OCR assets. |
| Offline behavior | Downloaded packs run without network after verification. Missing/invalid packs use Apple local fallback when available and otherwise show a download/language action. |
| Minimum iOS version | Release must set an explicit iOS deployment target before RC. Recommendation: iOS 17+ for the first TestFlight unless product distribution requires older devices; do not commit below iOS 16 until native Speech, Vision, Expo modules, and model-runtime prototypes are tested there. |
| License review notes | Apple baseline avoids third-party model redistribution. Before shipping custom packs, verify runtime license, model-weight license, attribution requirements, and commercial redistribution terms for whisper.cpp, Whisper weights, sherpa-onnx, SenseVoice, ONNX Runtime, PaddleOCR/PP-OCR, and any hosted model bundle. |
| Benchmark plan | Use `.agents/ios-real-device-qa.md` plus the benchmark matrix below on at least one real iPhone. Record latency, memory, accuracy, offline behavior, and UX failure states before promoting any custom model runtime from prototype to default. |

## Runtime Matrix

| Feature | First native baseline | Custom model candidate | Promotion rule |
| --- | --- | --- | --- |
| Browser Web Speech replacement | Apple Speech online/on-device | None needed unless Apple coverage fails | Real-device speech QA passes for source languages used by the product. |
| Web local ASR parity | sherpa-onnx Whisper Base or SenseVoice Small | Apple on-device Speech fallback | Keep enabled only if signed-device latency, memory, accuracy, and license gates pass. |
| Web local PP-OCR parity | ONNX Runtime PP-OCR v5 Mobile | Apple Vision fallback | Keep enabled only if menu/sign/receipt accuracy and overlay geometry pass signed-device QA. |
| Japanese furigana local path | Provider fallback plus native ruby-style rendering | Bundled dictionary/tokenizer or server fallback | Decide separately after provider QA; do not bundle large dictionaries without size review. |

## Model Pack and Cache Design

Use fixed, app-owned manifests as internal install metadata. This is not a user-facing model-pack mode: users choose Whisper, SenseVoice, or PP-OCR and tap Download; they never enter a path or manifest URL.

### Manifest

Each fixed R2 model has a versioned manifest:

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "asr-whisper-base-ja-en",
      "feature": "asr",
      "runtime": "whisper-cpp-coreml",
      "version": "2026.07.1",
      "minAppVersion": "0.1.0",
      "minIOS": "17.0",
      "bytes": 145000000,
      "license": "TBD",
      "files": [
        {
          "name": "model.bin",
          "url": "https://assets.tabitomo.alkinum.io/models/asr/whisper-base/base-encoder.int8.onnx",
          "sha256": "TBD",
          "bytes": 145000000
        }
      ]
    }
  ]
}
```

Required fields:

- `id`: stable identifier used by settings and diagnostics.
- `feature`: `asr`, `ocr`, `vad`, or `furigana`.
- `runtime`: native runtime adapter name.
- `version`: immutable pack version.
- `minAppVersion` and `minIOS`: compatibility gates.
- `files`: URL, byte size, and SHA-256 for every file.
- `license`: license identifier plus a human-readable attribution entry.

### Storage

Recommended storage layout:

- Temporary downloads: app cache directory.
- Verified packs: app document/application-support style directory under `tabitomo/model-packs/<id>/<version>/`.
- Active-pack pointer: small non-secret JSON state in app Documents storage.
- Pack metadata: manifest, checksum results, install time, last used time, byte size, manifest/file metadata match result, and runtime compatibility result.

Implementation notes:

- Download to a temp path first.
- Verify byte count and SHA-256 before activation.
- Move the complete pack atomically when possible. Current Expo implementation stages verified files first, renames the previous active version to a backup path, then renames the staged version into the active path.
- Same-version replacement must create fresh metadata paths after filesystem renames. In Expo FileSystem, `Directory.rename()` can mutate the source object's URI; after activating a staged directory, rebuild the active directory/file URIs before persisting `InstalledModelPack` metadata so metadata never points at a `.previous-*` backup.
- Install and delete flows must clean sibling `.staging-*` and `.previous-*` artifacts for the same pack/version after success; failed installs may leave diagnostic artifacts, but successful replacement/delete should leave no active-adjacent staging or previous directories.
- Keep API keys/provider settings in SecureStore, but keep installed model-pack metadata in `Documents/tabitomo-mobile-model-packs.v1.json`; model-pack metadata is non-secret and Release simulator builds can lack the keychain entitlement needed by SecureStore.
- Never activate a partially downloaded pack.
- Keep old pack versions until the new pack passes runtime validation.
- Provide a Settings "Local models" management section before enabling large downloads.
- Let users delete model packs without deleting provider settings.

### Bundled vs Downloaded

Bundle only small metadata and native runtime code in the app binary.

Do not bundle Whisper small/medium, PP-OCR packs, or SenseVoice packs in the first TestFlight. Large packs should be user-initiated downloads with an explicit size label and Wi-Fi-friendly UX.

iOS On-Demand Resources may be considered later if the app moves deeper into native Xcode packaging, but the first Expo path should use app-managed downloads so it works consistently across local Xcode, EAS, and TestFlight builds.

## Settings Behavior

Relevant settings fields:

- `speechRecognition.localEngine`
- `speechRecognition.vadMode`
- `speechRecognition.senseVoiceLanguage`
- `speechRecognition.whisperLanguage`
- `speechRecognition.whisperTask`
- `imageOCR.provider`

For iOS, the UI should interpret them as:

- `provider = local`: use the downloaded model selected by `localEngine`; fall back to Apple on-device Speech when it is not ready.
- `localEngine = whisper | sensevoice`: deterministically selects `whisper-base` or `sensevoice-small`.
- `imageOCR.provider = local-ppocr`: use downloaded PP-OCR v5 Mobile; fall back to Apple Vision when it is not ready.

Settings validation must show three separate states:

- Native available: Apple runtime can run now.
- Model pack missing: custom runtime selected but pack is not installed.
- Unsupported locale/runtime: current device or language cannot run the selected local path.

Current activation behavior:

- Shared core exposes `selectModelPackActivation(installed, environment, feature, nativeBaselineRuntime)`.
- ASR selection first filters to the exact fixed model selected by `localEngine`; OCR filters to `ppocr-v5-mobile`. Version/install-time preference only applies within that model ID.
- If no custom pack is ready, iOS falls back to the native baseline runtime: Apple Speech for ASR and Apple Vision for OCR.
- If installed packs exist but none are compatible and no baseline is available, the selector reports `no-compatible-pack` with the latest compatibility reason.
- If neither an installed pack nor a baseline is available, the selector reports `no-baseline`.
- Expo Settings renders this as Active ASR and Active OCR. The simulator `settings-model-pack-install` smoke asserts the just-installed tiny pack is selected as the active ASR candidate after verified install/replacement.

## Benchmark Matrix

### ASR

Run on a real iPhone, with airplane mode tests where applicable.

Inputs:

- 10 second clean speech: English, Japanese, Mandarin.
- 30 second travel phrase speech with background noise.
- Mixed-language sentence with place names.
- Short repeated commands for start/stop UX.

Metrics:

- Permission success/failure state.
- Time to recognition start.
- Final transcript latency.
- Real-time factor for custom runtime.
- WER/CER or manual transcript score.
- Peak memory during 60 second recording.
- Battery/thermal notes after 10 repeated runs.
- Offline pass/fail.

Compare:

- Cloud ASR configured through shared core.
- Apple Speech online.
- Apple on-device Speech.
- Custom ASR prototype when available.

### OCR

Images:

- Japanese menu.
- Chinese sign.
- Receipt with small text.
- Rotated/angled label.
- Low-light photo.

Metrics:

- OCR latency.
- Extracted text completeness.
- Translation overlay alignment.
- Rotation/line grouping behavior.
- Peak memory.
- Failure state clarity.

Compare:

- Cloud OCR.
- Apple Vision.
- Web PP-OCR.
- Custom PP-OCR prototype when available.

## Implementation Backlog

1. Add shared `ModelPackManifest` and `InstalledModelPack` types in `@tabitomo/core`. Status: implemented initial with unit coverage for manifest normalization, unsafe file-name rejection, duplicate rejection, total-byte matching, installed metadata matching, compatibility gates, and size formatting.
2. Add an Expo fixed-model manager for download, checksum, install, delete, and diagnostics. Status: implemented. R2 origin enforcement, Documents metadata, staging/rollback cleanup, native load validation, and unload-before-delete are wired; signed-device storage/offline QA remains.
3. Add a Settings "Local models" section with installed size, runtime check, fixed download/update/delete actions, and active runtime status. Status: implemented without path/URL/manifest inputs. Real-device visual and storage QA remains.
4. Add real-device benchmark logging that redacts API keys and imported config payloads. Status: implemented initial for the hidden Device QA surface as a copy/share JSON report with app/runtime metadata, image readiness, and per-check `outcome`, `result`, `startedAt`, `finishedAt`, and `durationMs` records while omitting provider credentials, imported config payloads, and local image/file URIs. Detailed memory and accuracy benchmark fields remain pending.
5. Run Whisper Base and SenseVoice Small through the shared sherpa-onnx adapter. Status: implemented; signed-device quality/performance measurements remain.
6. Run PP-OCR v5 Mobile through ONNX Runtime and retain Apple Vision fallback. Status: implemented; rotated/low-light/small-text QA remains.
7. Measure binary size, peak memory, latency, thermal behavior, and offline relaunch on supported iPhones.
8. Promote or tune model defaults only from real-device evidence.

## Acceptance Gates

The local model track is release-ready only when:

- Apple Speech/Vision baseline passes real-device QA or every failing language/image case has a documented fallback.
- Custom model packs, if shipped, are downloaded only after user consent and checksum verification.
- Same-version replacement preserves a valid active pack until the staged replacement is verified, then persists metadata pointing at the final active files and leaves no successful-install `.staging-*` or `.previous-*` residue.
- Activation selection prefers ready installed packs and falls back to Apple Speech/Vision baseline instead of silently selecting incompatible custom packs.
- The app can cold launch without installed custom packs.
- Missing-pack and unsupported-locale errors are clear and recoverable.
- App binary size and first-run download size are recorded.
- Licenses and attribution are reviewed before model distribution.
- Benchmarks show acceptable latency and memory on a real iPhone.

## Reference Links to Verify During Implementation

- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo prebuild: https://docs.expo.dev/workflow/prebuild/
- Expo FileSystem: https://docs.expo.dev/versions/latest/sdk/filesystem/
- Apple Speech framework: https://developer.apple.com/documentation/speech
- Apple Vision text recognition: https://developer.apple.com/documentation/vision/vnrecognizetextrequest
- Apple Core ML: https://developer.apple.com/documentation/coreml
- Apple On-Demand Resources: https://developer.apple.com/documentation/bundleresources/on-demand_resources
- ONNX Runtime Mobile: https://onnxruntime.ai/docs/get-started/with-mobile.html
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- sherpa-onnx: https://k2-fsa.github.io/sherpa/onnx/
