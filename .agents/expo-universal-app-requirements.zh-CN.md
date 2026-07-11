# tabitomo Expo Universal App 需求跟进文档

状态：实现中
分支：`expo-universal-parity`
主目标：iOS 原生体验优先，Expo Web/Android 作为不拖慢 iOS 的次级目标
详细英文实现台账：`.agents/expo-universal-app-requirements.md`

## 目标

把现有 React/Vite Web 版 tabitomo 同构为一个 Expo Universal App，但 iOS 不能只是 WebView 包壳。移动端需要使用 React Native UI、iOS 原生权限和设备能力，并把可复用的业务逻辑沉到 `packages/tabitomo-core`。

最终目标是：用户在 iPhone 上可以完成 Web 版已有的文本翻译、解释、旅行问答、语音输入、图片 OCR/VLM 翻译、设置导入导出、本地能力选择和暗色模式体验。

## 完成定义

这个需求只有在以下证据齐备后才算完成：

- Web 版现有 P0/P1 用户能力在 Expo iOS 中已实现、被原生能力替代、明确延期，或记录为平台限制。
- `apps/mobile` 不是 WebView wrapper，核心界面是 React Native。
- `packages/tabitomo-core` 承载语言、设置、prompt、provider request/stream、OCR/VLM/ASR 协议、配置迁移和 model-pack 元数据等共享逻辑。
- 自动化验证通过：core tests、core typecheck、mobile typecheck、mobile parity audit、mobile release-readiness config gate、Expo web smoke、iOS Release simulator smoke、provider smoke dry-run。
- 真 provider 验证通过：Translation、Explanation、Quick Q&A、Japanese furigana、VLM、OCR、ASR。
- 真 iPhone 验证通过：相机、相册、麦克风、TTS、Apple Speech、Apple Vision OCR、QR 扫描、文件导入、分享、签名构建 SecureStore 设置持久化、内存压力。
- Device QA 脱敏 JSON 报告被导出并存档，且每项检查包含 `outcome/result/startedAt/finishedAt/durationMs`。

## 当前实现快照

已完成初版：

- Expo SDK 57 / React Native 0.86 app：`apps/mobile`
- 共享核心包：`packages/tabitomo-core`
- iOS Speech 原生模块：`packages/tabitomo-native-speech`
- iOS Vision OCR 原生模块：`packages/tabitomo-native-vision`
- 文本翻译、解释、Quick Q&A 三种主模式；mobile 主输入已对齐 Web 的输入停止后自动执行语义，支持 debounce 自动翻译/解释/Q&A、旧请求取消、翻译 10 分钟内存缓存、结果复制成功按钮反馈，同时保留手动按钮
- 轻量 markdown 结果渲染、日文 furigana ruby 风格渲染
- 录音后 cloud ASR、iOS Apple Speech、支持语言时的 on-device Speech
- 相机/相册图片输入、进入图片翻译时对齐 Web 自动反转语言方向、cloud OCR、VLM 图片翻译、OCR overlay、图片全屏 translated lightbox、iOS Vision 本地 OCR baseline
- 设置页、首次启动设置向导、Settings section jump bar、加密 `.ttconfig` 导入导出、QR 预览/扫描
- 主工作台缺配置内联引导：Translation、Explanation、Quick Q&A、OCR、VLM 缺少对应配置时，移动端显示原生 Open Settings 卡片，并跳到对应 Settings 分组
- Settings 与首次设置中的密码/API key 安全输入支持 Eye/EyeOff 显示/隐藏，补齐 Web Import/Export 与 WelcomeWizard 的密码可见性体验
- 本地模型 Settings 区块、model-pack manifest 下载、字节数和 SHA-256 校验、staging 替换、同版本 replacement、delete cleanup、兼容性状态、ASR/OCR 激活选择
- 隐藏 Device QA 页面：`tabitomo://smoke?scene=device-qa`，包含 Settings storage SecureStore round-trip、Provider text 真 provider 检查、Provider image 真 VLM/OCR 检查、Provider speech 真 cloud ASR 上传检查、Model pack tiny install/delete、TTS、权限、Apple Speech、Vision OCR、分享和文件导入检查，并可导出脱敏 JSON 报告
- 隐藏 settings config round-trip smoke：导出加密配置、导入带 `tabitomo-config:` 前缀的 payload、校验 General AI/翻译 override/speech/OCR/VLM/API key 字段、尝试原生保存读取，并写出脱敏 JSON 结果
- 隐藏 settings QR import smoke：在 Release/Hermes app 内生成真实加密 `.ttconfig` payload，经由 `QRScannerSheet` 的 `onScanned` 回调注入，走 shared-core `importConfigPayload` 解密/迁移，校验 General AI/翻译 override/speech/OCR/VLM/API key 字段，尝试原生保存，并写出不泄露密码、API key marker 或加密 payload 的脱敏 JSON 结果
- 隐藏 text-provider smoke：在 iOS Release/Hermes app 内运行 shared-core `translateText`、流式 `explainTextStream`、流式 `answerQuestionStream`，对接本地 mock OpenAI-compatible endpoint，校验 1 个非流式翻译请求和 2 个流式解释/Q&A 请求，并写出不泄露 `ios-smoke-provider-key` 的脱敏结果
- 隐藏 image-provider smoke：在 iOS Release/Hermes app 内运行 shared-core 流式 VLM、cloud OCR、OCR 后逐行 `translateText`，对接本地 mock OpenAI-compatible endpoint，校验 1 个 VLM streaming 请求、1 个 OCR 请求、1 个 OCR-line 翻译请求和 OCR geometry parsing，并写出不泄露 `ios-smoke-image-provider-key` 或图片 data URL 的脱敏结果
- 隐藏 image-lightbox smoke：注入图片/OCR overlay demo 数据，打开原生全屏 translated image preview，校验 Release/Hermes app 能渲染图片和 overlay labels，并完成截图 smoke
- 隐藏 speech-provider smoke：在 iOS Release/Hermes app 内运行 shared-core `transcribeAudioFile`，使用 `expo-file-system` FileBlob 对接本地 mock `/v1/audio/transcriptions` endpoint，校验 1 个 multipart ASR 请求，并写出不泄露 `ios-smoke-speech-provider-key` 或本地音频 URI/文件名的脱敏结果
- 隐藏 Hunyuan-MT output smoke：在 iOS Release/Hermes app 内打开 Settings，使用 Hunyuan-MT 翻译模型和初始 structured 输出草稿，校验移动端 Settings 会像 Web 一样强制 plain 输出并禁用 Structured，同时写出不泄露 `ios-smoke-hunyuan-key` 的脱敏结果

最新通过的本地验证：

- `pnpm --dir apps/mobile typecheck`
- `node --check scripts/ios-simulator-smoke.mjs`
- `pnpm test:core`
- `pnpm test:mobile:parity-audit`
- `pnpm test:mobile:release-readiness`
- `pnpm test:mobile:device-qa-report` 使用 checked-in sample fixture 通过；真实 release evidence 需要对签名 iPhone 导出的报告路径运行同一命令，且 strict release evidence 会拒绝 checked-in sample fixture
- `pnpm test:mobile:web-smoke`
- `pnpm test:provider-smoke` dry-run；当前无真实 provider env 时 7 项按预期 skipped
- `pnpm test:mobile:release-evidence` 可生成发布证据 manifest；默认开发模式只汇总缺口，release-candidate 使用 `--strict --device-report /path/to/report.json`
- `pnpm test:mobile:ios-xcode-preflight` 最新通过，20 checks；Release/iphoneos workspace、scheme、bundle id、iOS deployment target、版本号和 Info.plist 对齐，签名 metadata 仍需 Apple credentials。
- `pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=image-lightbox pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=settings-model-pack-install pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=settings-hunyuan-output pnpm test:mobile:ios-smoke`
- 聚焦 `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke`
- iOS Release simulator smoke 最新全量矩阵通过 23 个 scene，已包含 `image-lightbox`、`settings-hunyuan-output`、`setup-choice`、`setup-manual` 和 `setup-import`。settings QR import callback-chain smoke 通过，结果显示 `payloadLength=1784`；Hunyuan output smoke 通过，结果显示 `model=tencent/Hunyuan-MT-7B, outputMode=plain`；model-pack tiny install/replacement/delete smoke 通过，结果显示 `bytes=31`；settings config round-trip smoke 通过，结果显示 `payloadLength=1752`；text-provider smoke 通过，结果显示 `requests=3`；image-provider smoke 通过，结果显示 `requests=3`；speech-provider smoke 通过，结果显示 `requests=1`。当前 scene 矩阵已扩展到 24 个，新增 `config-guidance`。
- 最新聚焦 iOS Release simulator `main` scene 通过，用于确认 mobile 自动文本处理不会干扰 deterministic smoke 预览；`image-lightbox` 已进入并通过全量 Release simulator smoke，用于确认图片全屏预览和 overlay labels 在 Release/Hermes app 中能稳定渲染；`settings-hunyuan-output` 已进入并通过全量 Release simulator smoke，用于确认移动端 Settings 的 Hunyuan-MT plain/Structured 禁用行为对齐 Web；`IOS_SMOKE_SCENES=setup-choice,setup-manual` 聚焦 smoke 通过，用于确认首次设置选择页和手动翻译设置页能在 iOS Release/Hermes app 中稳定渲染。
- 最新聚焦 iOS Release simulator `settings-model-pack-install` scene 通过，确认 tiny model-pack 经过下载、校验、安装、同版本替换和 cleanup 后，会被 `selectModelPackActivation` 选为当前 ASR 激活候选；Settings 也会显示 Active ASR / Active OCR，未安装可用 pack 时回退 Apple Speech / Apple Vision baseline。
- Device QA surface 聚焦渲染 smoke 通过，页面已包含 Settings storage、Provider text、Provider image、Provider speech 和 Model pack storage 检查。Provider text 会用当前真实 settings 运行 shared-core Translation、流式 Explanation、流式 Quick Q&A 和日文 furigana，并在报告中只记录长度/token 等脱敏摘要；Provider image 会用生成的 "CAFE" PNG 和当前真实 VLM/OCR settings 运行 shared-core 流式 VLM、cloud OCR、OCR-line translation，并只记录长度、OCR 数量、逐行翻译数量等脱敏摘要；Provider speech 会写入一个有效的短 WAV fixture，用当前 speech settings 运行 shared-core cloud ASR 上传，并只记录 provider 类型和 transcript 长度；Model pack storage 会创建一个极小的内存 model-pack，经由与 manifest URL 安装相同的 staging/activation/metadata 路径安装，校验文件和 metadata、清理 staging 残留、删除 tiny pack，并恢复原有 installed-pack metadata；这些检查仍需要在签名真机/TestFlight 上手动运行并导出报告。
- `expo-device` runtime provenance 加入后，曾在 Release/Hermes simulator 出现白屏，runtime 报错为 `[runtime not ready]: Error: Cannot find native module 'ExpoDevice'`。root cause 是 JS 依赖已加入但 iOS Pods 未同步；已在 `apps/mobile/ios` 执行 `rtk pod install`，安装 `ExpoDevice (57.0.0)` 并更新 Podfile.lock/Pods Manifest/`ExpoModulesProvider.swift`。
- `expo-device` native module 链接修复后，已重新通过 `pnpm --dir apps/mobile typecheck`、聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`、全量 `pnpm test:mobile:ios-smoke`、`pnpm test:mobile:release-readiness`、`pnpm test:mobile:parity-audit` 和 `git diff --check`。iOS smoke 的 canonical scene 切换机制是先写入 Documents 下的 `tabitomo-smoke-scene.json`，App 读取后写出 `tabitomo-smoke-scene-ack.json`，脚本等待 ack 后再截图；不要用 `simctl openurl` 作为当前 scene 切换方案，因为它会引入 iOS 系统确认弹窗风险。
- 本轮修复移动端 sheet header 窄屏可读性：首次设置、Settings、QR scanner、Device QA 的标题/说明区域统一使用 `sheetHeaderText`，避免长 subtitle 被右侧关闭按钮挤出或截断。已通过 `pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness`，以及聚焦 `IOS_SMOKE_SCENES=setup-choice,settings,qr-scanner,device-qa pnpm test:mobile:ios-smoke`（4 scenes）。
- 本轮补齐 mobile Settings 的 Web tab/group 等价导航：Settings sheet 顶部新增横向 section jump bar，可跳到 General、Translation、Speech、Image、Local、Config；section 位置由 `onLayout` 记录。已通过 `pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness`、`git diff --check`，以及聚焦 `IOS_SMOKE_SCENES=settings pnpm test:mobile:ios-smoke`。
- 本轮补齐 mobile 主工作台缺配置引导：新增原生 `ConfigGuidanceCard`，Translation/Explanation/Q&A/OCR/VLM 缺配置时提供内联 `Open Settings` CTA，并通过 `settingsInitialJumpId` / `initialJumpId` 跳到 Translation、General 或 Image 分组。已通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/ios-simulator-smoke.mjs`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness`、`git diff --check`，以及聚焦 `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke`。
- 本轮补齐 mobile 安全输入可见性：`Field` 在 `secureTextEntry` 时显示原生 Eye/EyeOff 按钮，Settings 与首次设置中的 password/API key 输入可像 Web Import/Export 和 WelcomeWizard 一样显示/隐藏。已通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:parity-audit`（265 checks）和聚焦 `IOS_SMOKE_SCENES=settings,setup-manual,setup-import pnpm test:mobile:ios-smoke`（3 scenes）。
- 本轮补齐 mobile 图片语言方向 parity：Camera/Album 选中图片后进入 image language context，像 Web text→image 一样交换源/目标语言；清空或离开图片上下文时恢复。已通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:parity-audit`（265 checks）、`pnpm test:mobile:release-readiness` 和聚焦 `IOS_SMOKE_SCENES=main,image pnpm test:mobile:ios-smoke`（2 scenes）。
- 本轮补齐 mobile 结果复制反馈 parity：结果 Copy 按钮复制成功后会像 Web 一样短暂切到 `Copied` 和 Check 图标，2 秒后恢复；当新结果文本出现或清空时立即复位。已通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:parity-audit`（270 checks）、`pnpm test:mobile:release-readiness`（125 checks）、`git diff --check` 和聚焦 `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`（1 scene）。
- 注意：text-provider smoke、image-provider smoke 和 speech-provider smoke 是 Release iOS simulator 内的本地 mock provider 证据，只证明 native shared-core 链路、FileBlob multipart 上传和 Hermes/runtime 行为，不等于真实 provider credentials QA、真机麦克风 QA 或真机拍照/相册 QA。
- 注意：unsigned Release simulator 可能因为缺少 keychain entitlement 让 `expo-secure-store` 返回 `A required entitlement isn't present`。当前 settings config round-trip 和 QR import smoke 只会在加密导入/字段校验通过后记录 `skipped-secure-store-entitlement` 或 `save-skipped-secure-store-entitlement`，但真机签名构建/TestFlight 的 SecureStore 持久化仍是放行门槛。
- 新增 release-readiness config gate：`pnpm test:mobile:release-readiness` 会机检 Expo source config、当前默认 bundle id `com.backrunner.tabitomo`、build number `1`、iOS deployment target `16.4`、prebuilt Xcode project、Info.plist 隐私文案、SecureStore/camera/audio/image 插件、native dependency、EAS profiles、`.easignore`、本地 Xcode preflight、smoke 脚本、Device QA report validator、Device QA app 身份字段、mobile realtime/VAD 诚实状态、Web/mobile 默认语言一致性、release evidence sample-fixture guard、mobile parity audit 和 QA 文档；最新结果为 125 项通过。该 gate 只证明发布配置没有漂移，不替代签名真机/TestFlight QA。
- 新增 mobile parity audit：`pnpm test:mobile:parity-audit` 会机检 Web P0/P1 能力在 Expo mobile 中有对应 native/shared-core 实现、Settings/Setup/ImportExport surface、Settings jump bar、缺配置引导、安全输入显示/隐藏、结果复制反馈、iOS smoke scene、Device QA check、Device QA report app identity、mobile realtime/VAD 诚实状态、Web/mobile 默认语言一致性、release evidence sample-fixture guard、provider smoke 和 Expo web smoke 证据锚点；最新结果为 270 项通过。该 audit 是静态防回归，不替代真 provider 或真机 QA。

## 功能范围

| 模块 | iOS Expo 需求 | 当前状态 | 放行条件 |
| --- | --- | --- | --- |
| 文本翻译 | 输入、语言选择、swap、copy、复制成功反馈、TTS、同 Web prompt/provider 行为 | 初版完成；mobile 已补 debounce 自动翻译、旧请求取消、10 分钟内存缓存和 `Copy → Copied` / Check 反馈；Expo web mock provider 和 iOS Release simulator mock text-provider smoke 均已覆盖 | 真 provider + iPhone UI 验证 |
| 解释模式 | 单词/句子/语法解释，流式输出 | 初版完成；mobile 已补 debounce 自动解释和旧 streaming 请求取消；Expo web mock provider 和 iOS Release simulator mock text-provider smoke 均已覆盖 | 真 provider 验证 |
| Quick Q&A | 旅行语言助手，语音转写后也能进入当前模式 | 初版完成；mobile 已补 debounce 自动 Q&A 和旧 streaming 请求取消；Expo web mock provider 和 iOS Release simulator mock text-provider smoke 均已覆盖 | 真 provider + ASR 端到端验证 |
| 设置 | General AI、翻译 override、speech、OCR、VLM、advanced local fields、移动端分组快速跳转、缺配置 Open Settings 引导、安全输入显示/隐藏 | 初版完成；iOS simulator 已覆盖加密配置 round-trip、QR import callback-chain、Hunyuan-MT output-mode parity、Settings jump bar 和缺配置引导卡渲染；安全输入可见性已有 typecheck/parity audit 锚点；Device QA 已有 Settings storage、Provider text、Provider image、Provider speech 和 Model pack storage 检查 | 真机保存/重启/导入导出和 SecureStore 验证 |
| 首次设置 | 手动配置、快速填充、文件导入、QR 导入 | 初版完成；Expo web first-run/manual/import smoke 通过；iOS simulator 已覆盖 setup choice、manual translation setup、import setup 三个首次设置视觉场景，且 QR import 已覆盖 scanner callback/import/save 链路 | 真 iPhone 文件/真实相机 QR 解码验证 |
| 音频 | 麦克风权限、录音、cloud ASR、Apple Speech/on-device Speech | 初版完成；iOS Release simulator mock speech-provider smoke 已覆盖 cloud ASR FileBlob multipart 上传链路；Device QA 已新增 Provider speech，用当前 speech settings 发送有效短 WAV fixture 做真 provider upload 检查；Web realtime/VAD 配置在 mobile 中保留兼容但禁用，iOS 当前明确使用 record-then-transcribe/native Speech baseline | 真 iPhone 麦克风/Apple Speech/真实云 ASR；custom native streaming ASR 另行决策 |
| 图片 | 相机、相册、从文本进入图片时自动反转语言方向、压缩、OCR overlay、图片全屏 lightbox、VLM markdown | 初版完成；mobile Camera/Album 进入图片上下文时会像 Web text→image 一样交换源/目标语言，清空或离开图片上下文时恢复；Expo web mock provider 和 iOS Release simulator mock image-provider smoke 均已覆盖 VLM/OCR/OCR-line translation 核心链路；`image-lightbox` 已进入全量 iOS smoke 并覆盖全屏图片预览 | 真图片 OCR/VLM/overlay 对照 Web + 真 provider 验证 |
| 本地 OCR | 下载的 PP-OCR v5 Mobile 通过 ONNX Runtime 执行；缺失/失效时 Apple Vision fallback | 初版完成；iOS Release 模拟器完整模型 smoke 已执行 PP-OCR detector/recognizer 并返回 1 行 | 真机菜单/招牌/收据、旋转/低光/小字、内存/延迟 QA |
| 本地 ASR | 下载的 Whisper Base/SenseVoice Small 通过 sherpa-onnx 执行；缺失/失效时 Apple on-device Speech fallback | 初版完成；iOS Release 模拟器完整模型 smoke 已分别执行 Whisper Base 和 SenseVoice Small | 真机多语言、噪声、内存/延迟/离线 QA |
| 本地模型 | 固定 R2 manifest、下载、校验、native load 验证、安装、替换、unload/delete、兼容性状态、确定性激活选择 | 初版完成；Mobile 不暴露 path/manifest URL，R2 资产 125 checks 通过，三个固定官方模型的 iOS Release runtime smoke 通过 | 签名真机完整下载/重启/离线/推理 QA |
| Expo web | 不拖慢 iOS 的 universal web export/smoke | 初版完成；最新 `pnpm test:mobile:web-smoke` 通过 | 保持 smoke 跟随核心功能变化 |

## 关键缺口

- 尚未用真实 provider credentials 跑完整 provider smoke。目前已有 Expo web mock provider 证据、iOS Release simulator 本地 mock text/image/speech provider 证据，以及 Device QA Provider text / Provider image / Provider speech 真机入口，但不能替代实际真实 provider QA。
- 尚未在真实 iPhone 上验证相机、相册、麦克风、TTS、Apple Speech、Vision OCR、真实相机 QR 解码、文件导入/分享、Device QA Settings storage、Device QA Provider text、Device QA Provider image、Device QA Provider speech、Device QA Model pack storage、签名构建 SecureStore kill/relaunch 设置持久化。
- sherpa-onnx ASR 与 ONNX Runtime PP-OCR 已接入真实下载模型；Apple Speech/Vision 只作为缺失或失效 fallback。尚缺签名 iPhone 上的精度、延迟、峰值内存、旋转框和离线重启证据。
- EAS Build scaffold 已建立：`eas.json` 包含 `development`、`development-simulator`、`preview`、`preview-simulator`、`production` profiles 和 iOS submit profile，`.easignore` 已排除构建/测试产物；首个 RC canonical release path 默认走 local Xcode，EAS 作为后续/备选路径保留。当前默认 bundle identifier `com.backrunner.tabitomo` 和最低 iOS `16.4` 已进入机器检查；release evidence manifest 可以机检所选路径、provider env、EAS CLI/profile 状态和真机报告状态，但 App Store/TestFlight 最终值仍可按产品/账号决策调整。

## 下一步队列

1. 跑真实 provider smoke：Translation、Explanation、Q&A、furigana、VLM、OCR、ASR，并在 simulator/iPhone UI 中复核文本三模式、图片 VLM/OCR 和语音 ASR 不是只在 mock provider 下成立。
2. 用真实 iPhone 执行 `.agents/ios-real-device-qa.md`，导出 Device QA JSON 报告，并运行 `pnpm test:mobile:device-qa-report /path/to/report.json` 校验 schema、必跑检查和脱敏规则。
3. 用签名真机构建/TestFlight 运行 Device QA 的 Settings storage、Provider text、Provider image、Provider speech 和 Model pack storage 检查，再验证 Settings 保存、kill app、重启读取、`.ttconfig` 文件导入和真实 QR 扫描导入后的持久化，确认 SecureStore 没有 entitlement 问题。
4. 拿菜单、招牌、收据图片对比 iOS Vision OCR、cloud OCR、Web PP-OCR overlay，并检查全屏图片 lightbox 的 overlay 位置和文字缩放。
5. 在真机上跑 tiny model-pack install/replacement/delete 和激活选择显示，确认文件系统、metadata、Active ASR/OCR 状态行为。
6. 根据 QA 结果决定是否进入 custom ASR/OCR runtime prototype，并把 `selectModelPackActivation` 输出接入真实 whisper/Core ML、ONNX Runtime 或 PP-OCR adapter。
7. 首个 RC 按 local Xcode 路径推进：显式设置 `TABITOMO_IOS_RELEASE_PATH=local-xcode`，配置 Apple signing team/profile，确认当前默认 bundle id `com.backrunner.tabitomo`、build number `1`、最低 iOS `16.4` 是否就是 TestFlight/App Store 值；随后用 `pnpm test:mobile:release-evidence -- --strict --device-report /path/to/report.json --out output/tabitomo-ios-release-evidence.json` 冻结发布证据。EAS 路径保留为后续/备选。

## 最新决策记录

- 2026-07-09：新增 `settings-qr-import` iOS simulator scene，在 Release/Hermes app 内生成真实加密 `.ttconfig`，通过 native QR scanner callback 注入并走 shared-core import/save 链路；该 smoke 证明回调链路，不替代真机相机 QR 解码。
- 2026-07-09：新增 `IOS_SMOKE_SCENES` 过滤能力，可用 `IOS_SMOKE_SCENES=settings-qr-import pnpm test:mobile:ios-smoke` 单独回归 QR import；单场景和全量 19 场景均已通过。
- 2026-07-09：mobile 主文本输入补齐 Web 式自动执行：输入停止后 debounce 自动运行当前 Translation/Explanation/Q&A，新的文本请求会 abort 旧请求，重复翻译走 10 分钟内存缓存；已通过 mobile typecheck、core tests、Expo web smoke 和聚焦 `IOS_SMOKE_SCENES=main` Release simulator smoke。
- 2026-07-09：新增原生图片全屏 translated lightbox，OCR/VLM 图片预览可点击打开全屏预览并复用 overlay labels；新增 `image-lightbox` iOS simulator scene，已通过 mobile typecheck、smoke 脚本语法检查、Expo web smoke、聚焦 `IOS_SMOKE_SCENES=image-lightbox` Release simulator smoke，以及全量 `pnpm test:mobile:ios-smoke`。该轮全量 iOS Release simulator smoke 通过 20 个 scene，QR import `payloadLength=1784`，config round-trip `payloadLength=1752`，text/image/speech provider requests 分别为 `3/3/1`，model-pack install `bytes=31`。
- 2026-07-09：新增 `installModelPackFromBytes`，让 manifest URL 安装和 Device QA 本地字节安装共用同一套 model-pack staging/activation/metadata 路径；Device QA 现在有 Model pack storage 检查，会安装/校验/删除 tiny in-memory pack、恢复原有 installed-pack metadata，并且报告只记录 pack id/bytes，不暴露本地文件 URI。
- 2026-07-09：新增并通过聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`，确认 Device QA surface 在 Release/Hermes 中可以渲染，且 Settings storage 与 Model pack storage 检查入口都在页面上。
- 2026-07-09：新增 Device QA `Provider text` 检查，用当前 settings 跑 shared-core Translation、流式 Explanation、流式 Quick Q&A 和 provider-backed Japanese furigana，每步 60 秒 abort；QA 报告只记录通过/失败、输出长度和 token 数等摘要，不记录 API key、endpoint、provider 正文、导入 payload 或本地文件/图片 URI。
- 2026-07-09：重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm --dir packages/tabitomo-core exec tsc --noEmit`、`pnpm test:mobile:web-smoke` 和聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`；Expo web smoke 通过，Release/Hermes 下 Device QA surface 可渲染新增 Provider text 检查入口。
- 2026-07-09：新增 Device QA `Provider image` 检查，用生成的 "CAFE" PNG 和当前 settings 跑 shared-core 流式 VLM image translation、cloud OCR、OCR-line translation，每步 60 秒 abort；QA 报告只记录通过/失败、输出长度、OCR 数量和逐行翻译数量等摘要，不记录 API key、endpoint、provider 正文、导入 payload、图片 data URL 或本地文件/图片 URI。
- 2026-07-09：重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm --dir packages/tabitomo-core exec tsc --noEmit`、聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` 和 `pnpm test:mobile:web-smoke`；Expo web smoke 通过，Release/Hermes 下 Device QA surface 可渲染新增 Provider image 检查入口。
- 2026-07-09：新增 Device QA `Provider speech` 检查，写入一个有效短 WAV fixture，并用当前 speech settings 跑 shared-core `transcribeAudioFile`，每步 60 秒 abort；QA 报告只记录 provider 类型和 transcript 长度，不记录 transcript 正文、API key、endpoint、provider 正文、导入 payload 或本地音频 URI。已有 iOS simulator `speech-provider-smoke` 也改为写入有效 WAV，而不是伪 WAV 文本。
- 2026-07-09：重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm --dir packages/tabitomo-core exec tsc --noEmit`、`node --check scripts/ios-simulator-smoke.mjs`、聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke` 和 `pnpm test:mobile:web-smoke`；Expo web smoke 通过，Release/Hermes 下 Device QA surface 可渲染新增 Provider speech 检查入口。
- 2026-07-09：新增 shared-core `selectModelPackActivation`，优先选择最新 ready installed pack，没有可用 pack 时回退原生 Apple Speech / Apple Vision baseline，并能报告无兼容 pack 或无 baseline 状态；Settings 已显示 Active ASR / Active OCR，`settings-model-pack-install` smoke 会断言刚安装的 tiny pack 被选为激活候选。
- 2026-07-09：重新通过 `pnpm test:core`、`pnpm --dir packages/tabitomo-core exec tsc --noEmit`、`pnpm --dir apps/mobile typecheck`、`node --check scripts/ios-simulator-smoke.mjs`、聚焦 `IOS_SMOKE_SCENES=settings-model-pack-install pnpm test:mobile:ios-smoke` 和 `pnpm test:mobile:web-smoke`；focused model-pack install smoke 报告 `bytes=31`，并验证 activation status 为 `installed-pack`。
- 2026-07-09：补齐 mobile Settings 的 Hunyuan-MT output-mode parity：当翻译模型为 Hunyuan-MT 时，Settings 会强制 plain 输出并禁用 Structured，行为对齐 Web；新增 `settings-hunyuan-output` iOS simulator scene、脱敏结果文件和 smoke-only 可见状态区块，避免截图与普通 settings 场景完全相同。
- 2026-07-09：重新通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/ios-simulator-smoke.mjs`、聚焦 `IOS_SMOKE_SCENES=settings-hunyuan-output pnpm test:mobile:ios-smoke`、全量 `pnpm test:mobile:ios-smoke` 和 `pnpm test:mobile:web-smoke`；focused smoke 报告 `model=tencent/Hunyuan-MT-7B, outputMode=plain`，全量 iOS Release simulator matrix 通过 21 个 scene。
- 2026-07-09：新增 `setup-choice` 和 `setup-manual` iOS simulator scene，让首次设置视觉 smoke 从原本的 import setup 扩展到 setup choice、manual translation setup、import setup 三段；重新通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/ios-simulator-smoke.mjs`、聚焦 `IOS_SMOKE_SCENES=setup-choice,setup-manual pnpm test:mobile:ios-smoke`、`pnpm test:mobile:web-smoke` 和全量 `pnpm test:mobile:ios-smoke`；聚焦 setup smoke 通过 2 个 scene，全量 iOS Release simulator matrix 通过 23 个 scene。
- 2026-07-09：新增 mobile release-readiness config gate。`apps/mobile/app.json` 现在记录 iOS `buildNumber=1`，`apps/mobile/ios/Podfile.properties.json` 固定 `ios.deploymentTarget=16.4`，根脚本新增 `pnpm test:mobile:release-readiness`，会检查 Expo source config、prebuilt Xcode project、Info.plist 隐私文案、插件、native dependencies、smoke 脚本和 QA 文档；已重新通过 `node --check scripts/mobile-release-readiness.mjs`、`node --check scripts/ios-simulator-smoke.mjs`、`pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:release-readiness`、`pnpm test:mobile:web-smoke` 和 `pnpm test:provider-smoke` dry-run。该 gate 只覆盖发布配置，不替代签名真机/TestFlight QA。
- 2026-07-09：新增 `pnpm test:mobile:device-qa-report`，用于校验签名 iPhone 导出的 Device QA JSON 报告。校验内容包括 schema、app identity metadata、iOS runtime metadata、必需 check id、必跑项目 passed outcome、ISO 时间戳、非负 duration，以及 API key、配置 payload、endpoint URL、图片 data URL、本地 file/photo URI 等脱敏规则；checked-in sample fixture 用于本地/CI 覆盖校验器本身，真实 release evidence 必须对导出的真机报告路径运行。`pnpm test:mobile:release-readiness` 现在包含该 validator、fixture、Device QA app 身份字段、mobile realtime/VAD 诚实状态、Web/mobile 默认语言一致性、release evidence sample-fixture guard、parity audit、EAS scaffold、本地 Xcode preflight 和 `expo-device` runtime provenance 检查，最新 125 项通过。
- 2026-07-09：新增 `pnpm test:mobile:release-evidence` 和 `.agents/ios-release-evidence.zh-CN.md`。该脚本汇总 app 版本、git 状态、local Xcode/EAS 可用性、provider smoke env 完整度和可选真机 Device QA 报告校验结果；默认开发模式不要求真实凭证或真机报告，`--strict` 模式要求 `TABITOMO_IOS_RELEASE_PATH`、真实 provider env 和签名 iPhone 报告全部齐备。
- 2026-07-09：新增 `pnpm test:mobile:parity-audit`。该脚本起初用 241 个静态证据锚点检查 mobile 不是 WebView wrapper、shared core 导出/接入完整、文本三模式、语音、图片 VLM/OCR/overlay/lightbox、Settings、首次设置、配置导入导出、本地模型、23 个 iOS smoke scene、17 个 Device QA check、Device QA report app identity、runtime provenance、mobile realtime/VAD 诚实状态、Web/mobile 默认语言一致性、release evidence sample-fixture guard、Expo web smoke、provider smoke 覆盖入口和 sheet header 窄屏可读性锚点；当前已扩展到 270 checks，并覆盖 Settings jump bar、section jump anchors、缺配置引导卡、`config-guidance` scene、安全输入显示/隐藏、图片语言方向和结果复制反馈。该 audit 已纳入 release-readiness，防止后续改动误删 Web parity surface。
- 2026-07-09：Device QA 报告现在导出 app identity metadata：`bundleIdentifier=com.backrunner.tabitomo`、`buildNumber=1` 和 `buildSource=expo-native`；validator 会强制要求这些字段，`pnpm test:mobile:release-evidence -- --strict` 会拒绝 checked-in sample fixture，避免 sample 被误当作签名真机/TestFlight 证据。已重新通过 `node --check scripts/mobile-release-readiness.mjs`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:device-qa-report`、`pnpm test:mobile:release-readiness` 和 `pnpm test:mobile:parity-audit`。
- 2026-07-09：mobile Settings 和首次设置向导中的 Realtime transcription 现在在 iOS native 中显示为不可用，并明确说明当前使用 record-then-transcribe，Web realtime/VAD 字段仅为 `.ttconfig` 兼容和未来 native streaming ASR 保留；release-readiness 与 parity-audit 都新增了防回归锚点。已重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:release-readiness`、`pnpm test:mobile:parity-audit`、`pnpm test:mobile:release-evidence` 和 `git diff --check`。
- 2026-07-09：shared-core 默认语言已改为 `zh → ja`，与 Web 第一屏 `TranslationTool` 保持一致；mobile 第一屏继续从 shared-core 默认值读取，因此 iOS 初始 UI 与 Web 对齐。新增 `packages/tabitomo-core/src/languages.test.ts`，release-readiness 和 parity-audit 也新增默认语言一致性锚点。已重新通过 `pnpm test:core`、`pnpm --dir packages/tabitomo-core exec tsc --noEmit`、`pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:release-readiness` 和 `pnpm test:mobile:parity-audit`。
- 2026-07-09：新增 EAS 发布 scaffold：根目录 `eas.json` 定义 development、development-simulator、preview、preview-simulator、production 和 iOS submit profile；`.easignore` 排除 `node_modules`、`dist`、`output`、Playwright 报告和测试结果；`.agents/ios-eas-release-path.zh-CN.md` 记录 EAS profiles、常用命令、账号级秘密边界和放行规则。`pnpm test:mobile:release-readiness` 现在机检 EAS profiles，`pnpm test:mobile:release-evidence` 会输出 EAS profile/CLI 状态。
- 2026-07-09：新增本地 Xcode 发布 preflight：`pnpm test:mobile:ios-xcode-preflight` 会检查 workspace、scheme、Release/iphoneos build settings、bundle id、deployment target、marketing version、build number、Info.plist 和签名元数据状态；同时修复 `apps/mobile/ios/tabitomo.xcodeproj/project.pbxproj` 的 `MARKETING_VERSION` 从 `1.0` 到 `0.1.0`，使 Xcode Release build settings 与 Expo `app.json` 对齐。`.agents/ios-local-xcode-release-path.zh-CN.md` 记录本地 archive 命令、强制签名 preflight 和放行规则。
- 2026-07-09：`expo-device` 加入 Device QA runtime provenance 后，Release/Hermes simulator 白屏暴露 native module 未链接问题；在 `apps/mobile/ios` 执行 `rtk pod install` 后，`ExpoDevice (57.0.0)` 已进入 Podfile.lock/Pods Manifest/`ExpoModulesProvider.swift`。重新通过 `pnpm --dir apps/mobile typecheck`、聚焦 `IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`、全量 `pnpm test:mobile:ios-smoke`、`pnpm test:mobile:release-readiness`、`pnpm test:mobile:parity-audit` 和 `git diff --check`。当前 iOS simulator smoke 通过 Documents scene 文件 + ack 文件确认 scene 切换，不使用 `simctl openurl` 触发 deep link。
- 2026-07-09：移动端 sheet header 增加 `sheetHeaderText` 可收缩标题容器，修复首次设置、Settings、QR scanner 和 Device QA 在窄屏上长说明文字可能被右侧关闭按钮挤出/截断的问题。重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness` 和聚焦 `IOS_SMOKE_SCENES=setup-choice,settings,qr-scanner,device-qa pnpm test:mobile:ios-smoke`（4 scenes）。
- 2026-07-09：移动端 Settings 增加横向 section jump bar，用 `onLayout` 锚定 General、Translation、Speech、Image、Local、Config 六个分组位置，作为 Web Settings tab/group 的 iOS 等价导航。同步把 parity audit 的 Settings section 检查改为标题和 jump anchor，而不是完整 JSX 行匹配；重新通过 `pnpm --dir apps/mobile typecheck`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness`、`git diff --check` 和聚焦 `IOS_SMOKE_SCENES=settings pnpm test:mobile:ios-smoke`。
- 2026-07-09：移动端主工作台新增 `ConfigGuidanceCard`，当 Translation、Explanation、Quick Q&A、OCR 或 VLM 缺少对应配置时显示原生 `Open Settings` 引导，并通过 `settingsInitialJumpId` / `initialJumpId` 跳到 Translation、General 或 Image 分组；重新通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/ios-simulator-smoke.mjs`、`pnpm test:mobile:parity-audit`（当前最新 265 checks）、`pnpm test:mobile:release-readiness`、`git diff --check` 和聚焦 `IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke`。
- 2026-07-09：移动端 Settings 与首次设置中的 password/API key 安全输入新增 Eye/EyeOff 显示/隐藏按钮，行为对齐 Web Import/Export 和 WelcomeWizard。重新通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:parity-audit`（265 checks）和聚焦 `IOS_SMOKE_SCENES=settings,setup-manual,setup-import pnpm test:mobile:ios-smoke`（3 scenes）。
- 2026-07-09：移动端 Camera/Album 进入图片翻译上下文时新增 Web parity 的语言方向自动反转：默认文本 `zh → ja` 首屏不变，但选中/拍摄图片后会切到 `ja → zh` 等当前反向方向；清空或切到非图片文本模式时恢复。该行为使用 `enterImageLanguageContext` / `leaveImageLanguageContext` 锚定，避免重复处理多张图片时来回反转；已通过 typecheck、parity audit 265 checks、release-readiness 125 checks 和聚焦 `main,image` iOS simulator smoke。
- 2026-07-09：移动端结果 Copy 按钮新增 Web parity 的复制成功反馈：复制后 `resultCopied` 驱动按钮切到 `Copied` 和 Check 图标，2 秒后恢复；`targetText` 改变时会清理 timer 并复位，防止新结果沿用旧复制状态。已通过 `pnpm --dir apps/mobile typecheck`、`node --check scripts/mobile-parity-audit.mjs`、`pnpm test:mobile:parity-audit`（270 checks）、`pnpm test:mobile:release-readiness`（125 checks）、`git diff --check` 和聚焦 `IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`（1 scene）。
- 2026-07-11：Expo iOS Xcode project/workspace 已纳入源码管理，并新增 clean-prebuild-safe config plugin，固定 Xcode Managed Automatic Signing、Team `PB8H83VL3Z`、CloudKit capability metadata、iOS `16.4` 与 Expo version/build 同步。新增工程同步、打开、build number、archive、TestFlight 上传脚本和 Automatic Signing App Store export options；已通过完整 Expo prebuild + CocoaPods 同步、23 项 Xcode preflight、176 项 release-readiness、mobile typecheck、300 项 parity audit、Web production build 和聚焦 `main` 的 Release iOS simulator smoke。真机 archive 已到 Xcode provisioning 阶段，当前仅因本机未登录 Apple Developer 账号阻断。该改动只影响 native 发布工具链，Web 行为和 UI 不变。
- 2026-07-11：将 `public/icon.png` 设为 Expo/iOS AppIcon 的视觉源。`pnpm icons:sync-mobile` 会裁掉 PWA 图标透明外边界，把蓝色背景补成完整 1024x1024 方形，并按 Apple AppIcon 要求移除 alpha，再写入一致的 Expo 与 Xcode 图标；`pnpm test:mobile:icon-parity` 会比较两份生成图的解码 RGB 像素。Xcode 工程同步会在 prebuild 前重新生成这些资源，确保 clean prebuild 不会恢复 Expo 占位图标。
- 2026-07-11：图标视觉源调整后，重新通过 app icon parity、310 项 Web/mobile parity audit、186 项 mobile release-readiness、Expo Web smoke，以及聚焦 `IOS_SMOKE_SCENES=main` 的 Release/Hermes simulator smoke；iPhone 16 / iOS 26.5 上 1 个场景通过。

## 相关文档

- 全能力需求文档：`.agents/app-capability-requirements.zh-CN.md`
- 主实现台账：`.agents/expo-universal-app-requirements.md`
- 真机 QA：`.agents/ios-real-device-qa.md`
- 发布证据 manifest：`.agents/ios-release-evidence.zh-CN.md`
- 本地 Xcode 发布路径：`.agents/ios-local-xcode-release-path.zh-CN.md`
- EAS 发布路径：`.agents/ios-eas-release-path.zh-CN.md`
- 本地模型策略：`.agents/ios-local-model-runtime-strategy.md`
