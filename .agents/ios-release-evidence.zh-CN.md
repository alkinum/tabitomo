# tabitomo iOS 发布证据 Manifest

状态：已建立自动化骨架；首个 RC 默认走 local Xcode，等待真实 provider credentials 和签名 iPhone 报告
脚本：`pnpm test:mobile:release-evidence`

## 目的

`release-readiness` 证明 Expo/iOS 发布配置没有漂移；`device-qa-report` 证明真机导出的 Device QA JSON 合格；`provider-smoke` 证明真实 provider 能跑通。

`release-evidence` 负责把这些证据汇总成一份可存档的 manifest，回答四个问题：

- 当前 app 版本、bundle id、build number、最低 iOS 是什么。
- 当前准备走本地 Xcode 还是 EAS，以及这个选择来自显式环境变量还是本地默认决策。
- 真实 provider smoke 的环境变量是否齐备。
- 签名 iPhone 导出的 Device QA 报告是否已经通过校验。

脚本不会输出 API key、endpoint 值、provider 响应正文、图片 data URL 或本地文件 URI。provider 部分只记录变量是否存在和每个 smoke step 是否可运行。

## 常用命令

开发期查看当前缺口：

```bash
pnpm test:mobile:release-evidence
```

本机 Xcode preflight 可用、EAS CLI 不可用且未设置 `TABITOMO_IOS_RELEASE_PATH` 时，脚本会默认选择 `local-xcode`，并在 manifest 中记录：

```json
{
  "releasePath": {
    "selected": "local-xcode",
    "selectionSource": "default-local-xcode"
  }
}
```

RC 环境仍建议显式设置：

```bash
TABITOMO_IOS_RELEASE_PATH=local-xcode pnpm test:mobile:release-evidence
```

写出一份 manifest 到 `output/`：

```bash
pnpm test:mobile:release-evidence -- --out output/tabitomo-ios-release-evidence.json
```

带真实 iPhone Device QA 报告：

```bash
pnpm test:mobile:release-evidence -- \
  --device-report /path/to/tabitomo-ios-device-qa-report.json \
  --out output/tabitomo-ios-release-evidence.json
```

release-candidate 硬门槛：

```bash
TABITOMO_IOS_RELEASE_PATH=local-xcode \
TABITOMO_PROVIDER_SMOKE_REQUIRED=all \
pnpm test:mobile:release-evidence -- \
  --strict \
  --device-report /path/to/tabitomo-ios-device-qa-report.json \
  --out output/tabitomo-ios-release-evidence.json
```

如果最终选择 EAS：

```bash
TABITOMO_IOS_RELEASE_PATH=eas \
TABITOMO_PROVIDER_SMOKE_REQUIRED=all \
pnpm test:mobile:release-evidence -- \
  --strict \
  --device-report /path/to/tabitomo-ios-device-qa-report.json
```

## Manifest 字段

- `app`：Expo app name、version、scheme、bundle identifier、build number、最低 iOS。
- `git`：当前分支、commit、dirty worktree 数量。
- `releasePath.selected`：来自 `TABITOMO_IOS_RELEASE_PATH`，或在 local Xcode 可用且 EAS CLI 不可用时默认选择 `local-xcode`；值为 `local-xcode`、`eas` 或 `undecided`。
- `releasePath.selectionSource`：`env`、`default-local-xcode` 或 `undecided`。
- `releasePath.localXcode`：本机 `xcodebuild`、`xcrun`、`apps/mobile/ios/tabitomo.xcworkspace` 和 `pnpm test:mobile:ios-xcode-preflight` 是否可用。
- `releasePath.eas`：`eas` CLI、`eas.json`、EAS build profiles、iOS submit profile 和常用 build/submit 命令。
- `automatedGates`：本仓库应该先跑的自动化命令入口，包括 core、mobile typecheck、release-readiness、iOS Xcode preflight、parity audit、provider smoke、Expo web smoke、iOS simulator smoke 和 Device QA report validator。
- `providerSmoke.steps`：`translation`、`explanation`、`qa`、`furigana`、`vlm`、`ocr`、`asr` 是否具备真实 credentials/fixture。
- `deviceReport`：传入 `--device-report` 时，会调用 `pnpm test:mobile:device-qa-report` 同等校验逻辑，并标记 `sampleFixture`，用于区分真实签名 iPhone 导出报告和 checked-in sample fixture。非 sample 报告必须声明 `runtime.isPhysicalDevice=true` 且 `runtime.isSimulator=false`。
- `nextActions`：当前 manifest 还缺的发布动作。
- `failures`：`--strict` 模式下必须修掉的问题。

## 放行规则

开发期 manifest 的 `status=pass` 只代表脚本本身运行成功，不代表 iOS parity 已经完成。

真正 release-candidate 需要同时满足：

- `pnpm test:mobile:release-readiness` 通过。
- `TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke` 通过。
- 签名 iPhone 执行 `.agents/ios-real-device-qa.md` 后导出的 JSON 通过 `pnpm test:mobile:device-qa-report /path/to/report.json`，且报告 runtime metadata 证明它来自物理 iPhone 而不是 simulator。
- `pnpm test:mobile:release-evidence -- --strict --device-report /path/to/report.json --out output/tabitomo-ios-release-evidence.json` 通过。
- `TABITOMO_IOS_RELEASE_PATH` 已明确为 `local-xcode` 或 `eas`，或 manifest 记录 `selectionSource=default-local-xcode` 且 local Xcode 工具链可用。
- `--strict` 模式下传入 `scripts/fixtures/ios-device-qa-report.sample.json` 会失败；sample 只用于覆盖 validator 本身，不能作为真机验收或 release evidence。

在这些条件满足前，不把 Expo iOS 版本标记为完成。当前 Apple Speech / Apple Vision 是 iOS 本地能力 baseline，Core ML、whisper.cpp、sherpa-onnx、ONNX Runtime Mobile 和 PP-OCR native 是否继续推进，要根据真机 QA 和真实图片/语音结果再决策。
