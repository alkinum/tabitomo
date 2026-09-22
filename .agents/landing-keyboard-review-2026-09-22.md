# Setup density and keyboard behavior

## Behavior contract

- First-run choice remains compact; manual configuration and import expand the existing panel. Returning to the choices restores the compact height without resetting the draft.
- Back belongs to the header. Setup completion and optional actions scroll with the form, so no navigation footer moves into the typing area.
- Model discovery retains the same endpoint, credential, model, loading and failure behavior. Its label is centered independently of the refresh icon/spinner on Web and Expo.
- Workspace branding and mode controls stay in place during keyboard presentation. Keyboard avoidance has one owner per surface.

## Platform implementation

- Web: compact choice cards, a taller bounded form, fixed header navigation, independently scrolling content, shared semantic colors and explicit focus/disabled states.
- Mobile: matching labels, choices and hierarchy. iOS uses UIKit custom/large sheet detents in the existing pageSheet, with native height animation and Reduce Motion support. Its setup ScrollView owns keyboard insets and interactive dismissal; the header and sheet stay stationary. This is a platform exception because browser dialogs do not have UIKit detents or native keyboard notifications.
- Main workspace: preserves its header/modes and bottom safe-area padding. A compensating KeyboardAvoidingView offset avoids an independent safe-area change during keyboard animation. Underlying workspace avoidance is disabled while a sheet owns input.
- Other native sheets: cache screen geometry on layout before keyboard notifications, avoiding an async measurement during keyboard animation.
- Shared core: no settings, defaults, provider, persistence, encryption, import/export or CloudKit schema changes.
- Native module: extends the existing layout module to set sheet detents and report screen scaling for geometry assertions. A native rebuild is required.

## Verification

Browser layout regression checks 390×844 and 320×720 in both themes, compact/expanded/return height, panel bounds, header Back position, centered model label and focus/blur stability. Browser checks do not simulate the native software keyboard.

iOS smoke covers the choice, expanded form, focused Model field, keyboard dismissal, main input, Settings input and returning to the workspace. Geometry assertions compare UIKit screen coordinates, including system sheet scaling, and verify that the focused sheet input is above the keyboard. Simulator evidence does not establish physical-device frame pacing or third-party keyboard behavior.

Artifacts: `output/landing-review/`.

### Results

- 72 core tests, shared-core/Web/mobile TypeScript, 533 parity anchors and Web production build passed.
- Expo Web full smoke passed, including 390×844 / 320×720 light/dark setup geometry, configuration import, model discovery and interaction recovery.
- Web Chromium/WebKit: 34 scenarios passed across the focused runs; two synthetic-camera cases are intentionally skipped on WebKit. Intermittent loopback `ERR_ADDRESS_INVALID` errors were resolved by rerunning the affected tests on a fresh local port.
- iPhone 16 / iOS 27.0 Release build: all 10 selected scenes and both initial themes passed their native geometry checks. Setup expands from screen Y ≈ 466 to Y = 59; the form remains at Y = 59 while the keyboard is shown and after dismissal. Main content stays at Y = 67. Captured and inspected setup, main and Settings keyboard screenshots.
- The old final screenshot gate rejected the deliberately identical restored setup form. The gate now permits identical images only for named equivalent setup states; it was rerun successfully against all 12 retained screenshots and 12 passing geometry reports. See `native/verification.json`.
- No physical iPhone installation or frame-rate measurement was performed.
