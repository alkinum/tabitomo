---
name: tabitomo-platform-parity
description: Keep tabitomo Web and Expo mobile behavior, settings, shared logic, and visual language aligned while preserving a native phone-first iOS experience. Use for any tabitomo feature, UI, settings schema, provider, translation mode, input method, storage, import/export, or platform-specific change that could affect src/, apps/mobile/, packages/tabitomo-core/, native Expo modules, or parity tests.
---

# tabitomo Platform Parity

Treat the React/Vite Web app and Expo app as two product surfaces backed by one portable behavior contract. Keep core capabilities and design language aligned; do not force pixel-identical layouts across desktop and phones.

## Required Workflow

1. Inspect the current Web, mobile, shared-core, and test implementations before editing.
2. List affected behavior contracts: settings fields, defaults, provider calls, labels, modes, persistence, import/export, and failure states.
3. Put portable behavior in `packages/tabitomo-core`. Keep DOM, browser workers, Expo APIs, and Apple frameworks in their platform layers.
4. Update both product surfaces in the same change unless a documented platform exception applies.
5. Update parity anchors and behavioral smoke coverage with the implementation.
6. Verify phone layouts at 390x844 and 320x720 when mobile UI changes.
7. Report Web, mobile, shared-core, native, and test impact separately at handoff.

## Product Contract

Keep these aligned across Web and mobile:

- Translation, Explanation, and Q&A behavior and output semantics.
- Language coverage, source/target defaults, swap behavior, and image-mode direction changes.
- General AI, translation override, speech, OCR, VLM, local runtime, and config fields.
- Provider formats, normalization, migrations, encrypted `.ttconfig` import/export, and validation.
- Missing-configuration guidance, error meaning, loading state, copy/TTS actions, and result formats.
- Brand palette, typography hierarchy, icon meaning, flat-depth controls, and interaction feedback.

When adding or removing a setting, update all of:

- `packages/tabitomo-core/src/settings.ts` and related migrations/tests.
- Web Settings and first-run setup.
- Expo Settings and first-run setup.
- Config import/export compatibility.
- `scripts/mobile-parity-audit.mjs` and relevant smoke coverage.

## Mobile-First Expo Rules

- Optimize `apps/mobile` for signed iPhone builds and phone viewports first.
- Use React Native and native/Expo APIs; never make the main experience a WebView wrapper.
- Respect safe areas, software keyboards, touch targets, bottom-sheet lifecycle, and 320px width.
- Prefer compact, focused mobile sections over copying desktop density.
- Preserve the Web interaction model and visual identity while adapting layout, navigation, and control size for phones.
- Treat Expo Web as a development and smoke-test surface. Do not distort the iOS UI to make Expo Web behave like the primary Web product.
- Keep Android architecturally possible, but do not let it weaken the iOS-first implementation without an explicit requirement.

## Platform Exceptions

Allow a platform-specific implementation only when browser or native capabilities genuinely differ. Use an equivalent behavior and document the exception in the relevant `.agents` requirement file.

Examples:

- Web Speech maps to Apple Speech on iOS.
- Browser OCR workers map to Apple Vision or a native model runtime.
- Browser storage maps to SecureStore/Documents plus CloudKit on iOS.
- Desktop settings may use wider multi-column layouts; mobile uses categorized phone-sized views.

Never expose a control that claims an unavailable native capability works. Never silently drop a Web P0/P1 feature from mobile.

## iOS Settings Sync

- Enable private CloudKit settings sync by default in signed iOS builds.
- Keep SecureStore as the offline local cache and merge by explicit timestamps.
- Store secret-bearing settings in CloudKit encrypted fields.
- Do not sync downloaded model-pack binaries through CloudKit.
- Degrade to local-only storage when iCloud is signed out or unavailable without blocking saves.
- Show truthful sync status in mobile Settings. Do not present CloudKit as a Web capability.
- Require signed-device or TestFlight validation for account, entitlement, conflict, offline, and reinstall behavior.

## UI Review Rules

- Compare the changed Web and mobile surfaces before choosing mobile layout.
- Match names, icons, color roles, control states, and hierarchy.
- Keep the mobile main workspace centered, compact, and safe-area aware.
- Avoid persistent instructional banners, redundant actions, nested cards, and long unpartitioned settings forms.
- Use complete enter and exit paths for popup panels; keep the backdrop independent from panel motion.
- Remove browser-native focus decoration when it conflicts with the design, but replace it with a clear product focus state.

## Verification

Run commands through `rtk`.

Minimum for shared behavior or UI changes:

```bash
rtk pnpm test:core
rtk pnpm --dir packages/tabitomo-core exec tsc --noEmit
rtk pnpm --dir apps/mobile typecheck
rtk pnpm test:mobile:parity-audit
rtk pnpm test:mobile:web-smoke
rtk pnpm build
```

Also run focused iOS simulator smoke when native UI, storage, permissions, or modules change. Native CloudKit release evidence requires a signed iPhone/TestFlight build; simulator-only success is insufficient.

Read `.agents/expo-universal-app-requirements.md` for the current parity ledger and `.agents/app-capability-requirements.zh-CN.md` for release-level capability status when the change affects a P0/P1 feature.
