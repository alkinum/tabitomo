# Mobile model assets

Mobile downloads only fixed model IDs from `https://assets.tabitomo.alkinum.io`:

- `models/asr/whisper-base/manifest.json`
- `models/asr/sensevoice-small/manifest.json`
- `models/ocr/ppocr-v5-mobile/manifest.json`

The Cloudflare R2 bucket is `tabitomo-assets`. Its custom domain is `assets.tabitomo.alkinum.io`. Model binaries are versioned and immutable; each fixed manifest is uploaded last with `no-cache`.

Published production assets (verified 2026-07-11):

- Whisper Base int8: `160610353` bytes, MIT
- SenseVoice Small int8: `239550971` bytes, MIT
- PP-OCR v5 Mobile ONNX: `21521924` bytes, Apache-2.0

Run `rtk pnpm test:mobile:model-assets` to verify all manifests, object HEAD responses, content lengths, fixed-origin URLs, licenses, and SHA-256 metadata.

## Publish

Prepare a flat directory containing the exact files consumed by the native runtime. Do not publish a `.tar`, `.zip`, model directory path, or unreviewed upstream archive. Record upstream provenance and confirm the redistribution license before publishing.

Validate without uploading:

```bash
rtk env TABITOMO_R2_ACCOUNT_ID=<account-id> pnpm models:publish-mobile \
  whisper-base model-assets/whisper-base \
  --version 2026.07.11 \
  --license Apache-2.0 \
  --dry-run
```

Publish after reviewing `output/model-manifests/<model-id>.json`:

```bash
rtk env TABITOMO_R2_ACCOUNT_ID=<account-id> pnpm models:publish-mobile \
  whisper-base model-assets/whisper-base \
  --version 2026.07.11 \
  --license Apache-2.0
```

The script rejects unknown model IDs, empty or nested directories, unsafe versions, and missing license metadata. It computes SHA-256 and byte size per file, uploads versioned objects first, and publishes the manifest last.
