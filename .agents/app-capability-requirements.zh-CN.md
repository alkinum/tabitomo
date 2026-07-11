# tabitomo App 全能力需求文档

状态：实施跟进中
分支：`expo-universal-parity`
最后更新：2026-07-09
主平台：iOS Expo native app
参考实现：当前 React/Vite Web 版 tabitomo
配套迁移台账：`.agents/expo-universal-app-requirements.zh-CN.md`

## 1. 文档目的

这份文档用于跟进“整个 app 的能力”是否完整实现，而不是只记录 Expo 迁移过程。

后续讨论、排期、验收和发布判断都可以围绕这里的需求 ID 展开。每个 P0/P1 能力最终必须落到四种状态之一：

- 已实现并通过自动化和真机/真实 provider 证据。
- 已用 iOS 原生等价能力替代，并通过体验验收。
- 已明确延期，并记录不会阻断当前版本的原因。
- 被平台、模型、供应商或账号约束阻塞，并记录替代路径。

## 2. 产品目标

tabitomo 是面向旅行者、语言学习者和跨语言沟通场景的 AI 翻译助手。App 的第一屏就是可用的翻译工作台，不做营销落地页。

核心目标：

- 用户可以输入文本、说话或拍照，并快速得到可复制、可朗读、可理解的翻译结果。
- 用户可以在 Translation、Explanation、Quick Q&A 三种思维模式之间切换。
- 用户可以自带 OpenAI-compatible provider、OCR、VLM、ASR 配置，并通过加密配置文件/QR 在 Web 和 App 之间迁移。
- iOS 版本必须是 React Native/Expo 原生体验，不是 WebView 包壳。
- 本地能力在 iOS 上要有真实 native baseline：Apple Speech、Apple Vision，后续 custom model pack 再按证据推进。

## 3. 发布完成定义

当前 Expo iOS 版本只有同时满足以下条件，才可以认为“全能力对齐”完成：

1. Web 现有 P0/P1 用户能力在 iOS App 中已实现、原生替代、明确延期或有平台限制记录。
2. `apps/mobile` 使用 React Native UI 和原生权限/设备 API，不依赖 WebView 承载主体验。
3. 共享业务逻辑沉到 `packages/tabitomo-core`，覆盖语言、设置、provider 请求、prompt、OCR/VLM/ASR 协议、配置迁移和 model-pack 元数据。
4. 自动化门禁通过：core test、core typecheck、mobile typecheck、mobile parity audit、release-readiness、Expo web smoke、iOS simulator smoke、provider smoke dry-run。
5. 真实 provider 验证通过：Translation、Explanation、Quick Q&A、Japanese furigana、VLM、OCR、ASR。
6. 签名真 iPhone 或 TestFlight 验证通过：相机、相册、麦克风、TTS、Apple Speech、Apple Vision OCR、QR 扫描、文件导入、分享、SecureStore 持久化、Model pack storage、图片重复处理内存压力。
7. 导出的真机 Device QA JSON 通过校验，并进入 release evidence manifest。
8. 已决定 canonical iOS 发布路径：首个 RC 默认走 local Xcode；EAS scaffold 保留为后续/备选路径。
9. 本地模型策略有明确 release 决策：Apple baseline 够用，或进入 custom runtime prototype。

## 4. 需求优先级

| 优先级 | 含义 | 发布规则 |
| --- | --- | --- |
| P0 | 核心旅行翻译闭环；缺失会让 App 不成立 | 必须实现并通过真实验收 |
| P1 | Web parity、可信配置、本地能力、iOS 体验完整性 | 必须实现、替代或明确延期 |
| P2 | 增强体验、效率优化、未来增长能力 | 不阻断首个 TestFlight，但需要记录 |

### 4.1 跟进字段和状态规则

后续每次推进能力时，优先更新本文件对应需求 ID，而不是只在代码或聊天里记录结论。

状态口径：

| 状态 | 含义 | 允许用于发布判断 |
| --- | --- | --- |
| 未开始 | 尚未实现，也没有替代路径 | P0/P1 不允许 |
| 已实现初版 | 代码路径存在，基本 smoke 或静态检查通过 | 不能单独作为 RC 放行 |
| 已实现并自动化通过 | 本地自动化、parity audit、release-readiness 或 simulator smoke 有证据 | 可作为工程门禁证据，但不能替代真机/真实 provider |
| 待真机/真实 provider 验收 | simulator/mock 已通过，仍缺真实设备或真实服务证据 | P0/P1 放行前必须补齐或明确延期 |
| 已验收 | 真实 provider、签名 iPhone/TestFlight、Device QA report 和 release evidence 均满足对应需求 | 可作为 RC 放行证据 |
| 原生替代 | Web 能力在 iOS 上用 Apple/Expo/RN 原生能力替代，体验和失败态已验收 | 可放行，但必须保留替代说明 |
| 延期 | 不阻断当前 TestFlight，并记录原因、风险和后续条件 | 只允许 P1/P2，P0 需产品确认 |
| 阻塞 | 受账号、平台、模型、供应商或硬件限制，当前无法推进 | 需要记录解除条件和替代路径 |

每次更新需求时至少补三类信息：

- 代码入口：涉及的 Web、mobile、shared-core、native module 或脚本文件。
- 验收入口：对应的自动化命令、iOS smoke scene、Device QA check 或真实 provider smoke 项。
- 放行判断：当前是否阻断 TestFlight/RC；如果不阻断，原因是什么。

推荐推进顺序：

1. 先补 P0/P1 的 Web/mobile parity 缺口，并把静态锚点加入 `scripts/mobile-parity-audit.mjs`。
2. 再补 simulator Release/Hermes smoke，优先覆盖 Settings、Setup、Text、Image、Speech、Device QA 这类高风险表面。
3. 最后用真实 provider 和签名 iPhone 把 `待真机/真实 provider 验收` 项转为 `已验收`。

## 5. 功能需求

### 5.1 主翻译工作台

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-TEXT-001 | P0 | App 启动后第一屏就是主翻译工作台，支持文本输入、清空、执行、错误展示 | 已实现初版 | iOS simulator `main` scene；真机冷/热启动 QA 待完成 |
| APP-TEXT-002 | P0 | 支持源语言、目标语言选择和 swap，语言覆盖与 Web 对齐 | 已实现初版 | simulator language picker；真实 provider 语言 QA 待完成 |
| APP-TEXT-002A | P1 | App 第一屏默认语言与 Web 一致：中文 `zh` 到日文 `ja` | 已实现；shared-core 默认已对齐 Web，mobile 从 shared-core 读取 | core test + parity-audit/release-readiness 锚点 |
| APP-TEXT-003 | P0 | 文本停止输入后自动执行当前模式，并允许手动执行 | 已实现初版 | iOS `main` smoke；真实 UI 复核待完成 |
| APP-TEXT-004 | P0 | 新请求取消旧请求，避免旧结果覆盖新输入 | 已实现初版 | shared/mobile implementation；真实 provider 压测待完成 |
| APP-TEXT-005 | P0 | 翻译结果支持复制、TTS 朗读、清晰错误状态 | 已实现初版 | Device QA TTS 待真机完成 |
| APP-TEXT-006 | P0 | 保持 Web prompt/provider/output mode 行为，包括 Hunyuan-MT plain 输出约束 | 已实现初版 | `settings-hunyuan-output` smoke；真实 provider 待完成 |
| APP-TEXT-007 | P1 | 重复翻译可使用短期内存缓存，减少重复请求 | 已实现初版 | mobile implementation；无需单独发布阻断 |
| APP-TEXT-008 | P1 | 复制结果后，移动端按钮需要像 Web 一样给出短暂 `Copied` / Check 图标反馈，并在新结果出现时复位 | 已实现初版；新增 `resultCopied` 和复制复位 timer | parity audit 270 checks；聚焦 `main` iOS simulator smoke |

### 5.2 AI 解释与旅行问答

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-AI-001 | P0 | 支持 Translation、Explanation、Quick Q&A 三种模式切换 | 已实现初版 | Expo web smoke；iOS text-provider mock smoke |
| APP-AI-002 | P0 | Explanation 支持词、句、语法解释，并以流式结果显示 | 已实现初版 | iOS mock text-provider；真实 provider 待完成 |
| APP-AI-003 | P0 | Quick Q&A 面向旅行语言助手，语音转写后也能进入当前模式 | 已实现初版 | iOS mock text-provider；真机 ASR 端到端待完成 |
| APP-AI-004 | P1 | markdown 结果支持标题、列表、粗体、代码和长文本滚动 | 已实现初版 | simulator markdown/long-text scenes；视觉 QA 待完成 |
| APP-AI-005 | P1 | 日文 furigana 支持 ruby 风格显示，provider fallback 可用 | 已实现初版 | simulator furigana scene；真实 provider 待完成 |

### 5.3 语音输入与朗读

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-SPEECH-001 | P0 | iOS 麦克风权限、录音开始/停止和失败提示可用 | 已实现初版 | 真 iPhone 麦克风 QA 待完成 |
| APP-SPEECH-002 | P0 | Cloud ASR 使用用户配置的 provider 上传音频并回填文本 | 已实现初版 | iOS mock speech-provider；真实 ASR 待完成 |
| APP-SPEECH-003 | P1 | Web Speech API 在 iOS 用 Apple Speech 原生能力替代 | 已实现初版 | Device QA Apple Speech 待真机完成 |
| APP-SPEECH-004 | P1 | local speech provider 在支持语言下使用 Apple on-device Speech | 已实现初版 | 真机离线/语言覆盖 QA 待完成 |
| APP-SPEECH-005 | P1 | TTS 使用 iOS 原生朗读能力，主结果和 QA 表面可调用 | 已实现初版 | Device QA TTS 待完成 |
| APP-SPEECH-006 | P1 | 缺权限、缺 provider、网络失败、unsupported locale 都要有明确错误 | 已实现初版 | 真机错误态 QA 待完成 |
| APP-SPEECH-007 | P1 | Web realtime/VAD 设置在 iOS App 中不得伪装为已可用；当前 native 使用 record-then-transcribe，并保留配置兼容性 | 已实现初版；mobile toggle 禁用并显示 iOS 状态说明 | parity-audit/release-readiness 锚点；custom streaming runtime 待后续 |

### 5.4 图片、OCR 与 VLM

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-IMAGE-001 | P0 | 支持相机拍摄和相册导入 | 已实现初版 | 真 iPhone 相机/相册 QA 待完成 |
| APP-IMAGE-002 | P0 | 图片处理前有压缩/尺寸控制，避免 provider 和内存压力 | 已实现初版 | 真机重复处理内存 QA 待完成 |
| APP-IMAGE-003 | P0 | Cloud OCR 使用已适配的阿里云 Model Studio Qwen-OCR 识别文本与绝对坐标，并逐行覆盖翻译；不把通用 VLM/custom endpoint 宣称为坐标 OCR | 已实现初版；默认 `qwen3.5-ocr`，兼容 `qwen-vl-ocr-latest` | shared core `advanced_recognition` tests、Expo Web/iOS mock image-provider；真实 Qwen OCR/iPhone 图片 QA 待完成 |
| APP-IMAGE-004 | P0 | VLM 直接图片翻译支持流式 markdown 结果 | 已实现初版 | iOS mock image-provider；真实 VLM 待完成 |
| APP-IMAGE-005 | P1 | OCR overlay 显示译文标签，并支持全屏 translated image lightbox | 已实现初版 | iOS `image-lightbox` smoke；真实图片对照 Web 待完成 |
| APP-IMAGE-006 | P1 | local OCR 优先运行下载的 PP-OCR v5 Mobile，模型缺失/失效时使用 Apple Vision | 已实现初版 | native Pod build；R2 asset checks；真图菜单/招牌/收据 QA 待完成 |
| APP-IMAGE-007 | P1 | 旋转、低光、小字、长图失败时有可恢复提示 | 待真机验证 | 真实图片 QA |
| APP-IMAGE-008 | P1 | 从文本工作台进入图片翻译时，iOS 要像 Web 图片模式一样自动反转语言方向；离开图片上下文时恢复，避免默认 `zh → ja` 误用于拍摄日文菜单/招牌 | 已实现初版；新增 image language context | parity audit 265 checks；聚焦 `main,image` iOS simulator smoke |

### 5.5 设置、首次启动与配置迁移

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-SETTINGS-001 | P0 | Settings 覆盖 General AI、translation override、speech、OCR、VLM 字段 | 已实现初版 | parity audit；真机保存复核待完成 |
| APP-SETTINGS-002 | P0 | API key 必须进入 iOS SecureStore 或同等级安全存储 | 已实现初版 | 签名真机 kill/relaunch 待完成 |
| APP-SETTINGS-003 | P1 | 首次启动支持跳过、手动配置、快速填充、文件导入、QR 导入 | 已实现初版 | iOS setup scenes；真机文件/相机 QR 待完成 |
| APP-SETTINGS-004 | P1 | `.ttconfig` 加密导入导出与 Web 兼容 | 已实现初版 | config round-trip smoke；真机导入导出待完成 |
| APP-SETTINGS-005 | P1 | QR export/import 可用，报告和日志不得泄漏 payload/password/key | 已实现初版 | QR import callback smoke；真机相机 QR 解码待完成 |
| APP-SETTINGS-006 | P1 | 保存、导入、迁移 legacy settings 后字段归一化与 Web 一致 | 已实现初版 | core tests；真机导入 legacy config 待完成 |
| APP-SETTINGS-007 | P1 | 设置表单在移动端分组清晰，advanced 字段不阻断核心配置 | 已实现初版 | 视觉/可用性 QA 待完成 |
| APP-SETTINGS-008 | P1 | 移动端 Settings 需要提供接近 Web tab/group 的快速分组导航，避免长表单滚动成本过高 | 已实现初版；新增横向 section jump bar，可跳到 General、Translation、Speech、Image、Local、Config | parity audit 265 checks；聚焦 `settings` iOS simulator smoke |
| APP-SETTINGS-009 | P1 | 缺少 Translation、General AI、OCR、VLM 配置时，移动端主工作台要像 Web 一样给出内联 Open Settings 引导，并跳到对应设置分组 | 已实现初版；新增原生 `ConfigGuidanceCard` 和 Settings initial section jump | parity audit 265 checks；聚焦 `config-guidance` iOS simulator smoke |
| APP-SETTINGS-010 | P1 | Settings 与首次设置中的密码/API key 安全输入要像 Web 一样支持显示/隐藏，避免用户长密钥录入不可校验 | 已实现初版；`Field` 在 `secureTextEntry` 时显示 Eye/EyeOff 原生按钮 | parity audit 265 checks；聚焦 `settings,setup-manual,setup-import` iOS simulator smoke |
| APP-SETTINGS-011 | P0 | 签名 iOS build 默认把设置同步到 private CloudKit；SecureStore 继续作为离线缓存，按显式时间戳保留较新快照，CloudKit 不可用时本地保存不得失败 | 已实现初版；设置 payload 使用 CloudKit encrypted field，模型包二进制不进入 CloudKit | parity/release-readiness；签名 iPhone/TestFlight `icloud-settings` Device QA 待完成 |
| APP-SETTINGS-012 | P1 | 用户可关闭 iCloud 设置同步；关闭后仅保留本机设置且不上传/应用云端变化。重新开启时按 General AI、Translation、Speech、OCR、VLM 分组自动合并，较新修改优先，时间戳完全相同时当前设备优先 | 已实现并自动化通过；opt-out 为 device-local，不进入云 payload 或 `.ttconfig` | core settings-sync tests；mobile parity audit；签名 iPhone 冲突/离线/重启 QA 待完成 |

### 5.6 本地模型与设备端能力

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-LOCAL-001 | P1 | iOS local ASR 按设置确定性运行 sherpa-onnx Whisper Base 或 SenseVoice Small，缺失/失效时使用 Apple on-device Speech | 已实现初版 | native Pod build；Mobile typecheck；真机语言/性能 QA 待完成 |
| APP-LOCAL-002 | P1 | iOS local OCR 运行 ONNX Runtime PP-OCR v5 Mobile，缺失/失效时使用 Apple Vision | 已实现初版 | native Pod build；R2 asset checks；真图 OCR QA 待完成 |
| APP-LOCAL-003 | P1 | Settings 显示 Active ASR / Active OCR，并提供 Whisper Base、SenseVoice Small、PP-OCR v5 Mobile 的下载、更新、删除和状态 | 已实现并自动化通过；Mobile 不再暴露 path/manifest URL | mobile parity audit；`settings-local` iOS Settings smoke 已通过 |
| APP-LOCAL-004 | P1 | 固定模型资产支持下载、字节数校验、SHA-256、staging、native load 验证、替换、unload 后删除 | 已实现并自动化通过 | simulator tiny-model smoke；R2 远端资产 125 checks；真机 storage QA 待完成 |
| APP-LOCAL-005 | P1 | model-pack 元数据不得占用 SecureStore，非秘密状态写 Documents | 已实现初版 | simulator smoke；真机 QA 待完成 |
| APP-LOCAL-006 | P1 | sherpa-onnx iOS runtime 消费 Whisper/SenseVoice 下载文件并执行离线 ASR | 已实现初版 | isolated native build；签名 iPhone 推理/内存/延迟 QA 待完成 |
| APP-LOCAL-007 | P1 | ONNX Runtime Mobile 消费 PP-OCR det/rec/dict 并执行离线 OCR | 已实现初版 | isolated native build；签名 iPhone 旋转/低光/小字 QA 待完成 |
| APP-LOCAL-008 | P1 | Mobile 模型只从 `assets.tabitomo.alkinum.io` 固定目录下载，不允许用户输入本地 path 或任意 manifest；manifest 内文件也必须保持同源；模型文件不得进入 iCloud/settings export | 已实现并自动化通过；`tabitomo-assets` R2 bucket 和 TLS custom domain active，三组 int8/ONNX 资产已发布 | `pnpm test:mobile:model-assets` 125 checks；发布工具 `pnpm models:publish-mobile` |

### 5.7 Universal 与 Web parity

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-UNI-001 | P0 | iOS 主目标不允许 WebView wrapper | 已实现初版 | parity audit |
| APP-UNI-002 | P1 | Expo web export 不拖慢 iOS，但要能覆盖主要设置/导入/文本/图片 smoke | 已实现初版 | `pnpm test:mobile:web-smoke` |
| APP-UNI-003 | P1 | Web 新增 P0/P1 设置或能力后，移动端必须同步进入 parity audit | 持续要求 | 每次功能变更复核 |
| APP-UNI-004 | P2 | Android 不作为首发阻断项，但架构不应主动排斥后续支持 | 待后续 | 首发不阻断 |

### 5.8 安全、隐私与日志

| ID | 优先级 | 需求 | 当前状态 | 验收证据 |
| --- | --- | --- | --- | --- |
| APP-SEC-001 | P0 | 不记录 API key、Authorization header、完整 provider response、导入 payload | 已实现初版 | release evidence/report redaction checks |
| APP-SEC-002 | P0 | Device QA report 只导出脱敏摘要、时长、结果、app 身份字段、物理设备 provenance 和非敏感 metadata | 已实现初版 | `test:mobile:device-qa-report` sample；strict release evidence 拒绝 sample；validator 对非 sample 报告要求物理 iPhone；真机报告待完成 |
| APP-SEC-003 | P1 | 权限文案覆盖相机、相册、麦克风、语音识别等 iOS 能力 | 已实现初版 | release-readiness |
| APP-SEC-004 | P1 | BYOK endpoint/model 配置错误时提示明确，不吞错 | 已实现初版 | 真实 provider 错误态 QA 待完成 |

## 6. 架构需求

| ID | 优先级 | 需求 | 当前状态 |
| --- | --- | --- | --- |
| APP-ARCH-001 | P0 | Web 和 Mobile 共用 `packages/tabitomo-core` 的 provider/prompt/settings 逻辑 | 已实现初版 |
| APP-ARCH-002 | P0 | Web-only DOM、Worker、WASM bootstrapping 不进入 shared core | 已实现初版 |
| APP-ARCH-003 | P0 | Mobile 通过 Expo prebuild/dev-client 接入 native Speech/Vision 等模块 | 已实现初版 |
| APP-ARCH-004 | P1 | 自动化脚本必须覆盖 parity audit、release readiness、release evidence、device report validation | 已实现初版 |
| APP-ARCH-005 | P1 | 发布路径支持 local Xcode 和 EAS scaffold，但最终 RC 只能选择一个 canonical path | 已决策：首个 RC 默认 `local-xcode`；EAS scaffold 保留 |

## 7. 验收与测试矩阵

### 本地自动化门禁

这些命令必须持续通过：

```bash
rtk pnpm test:core
rtk pnpm --dir packages/tabitomo-core exec tsc --noEmit
rtk pnpm --dir apps/mobile typecheck
rtk pnpm test:mobile:parity-audit
rtk pnpm test:mobile:release-readiness
rtk pnpm test:mobile:device-qa-report
rtk pnpm test:mobile:release-evidence
rtk pnpm test:mobile:web-smoke
rtk pnpm test:provider-smoke
rtk pnpm test:mobile:ios-smoke
```

### 真实 provider RC 门禁

发布候选必须使用真实 credentials 跑：

```bash
rtk env TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke
```

覆盖项：

- Translation
- Explanation
- Quick Q&A
- Japanese furigana
- VLM image translation
- Cloud OCR
- Cloud ASR

ASR 需要提供 `TABITOMO_SPEECH_AUDIO_FILE`。

### 签名真机 RC 门禁

必须在签名 iPhone build 或 TestFlight 上：

1. 打开 `tabitomo://smoke?scene=device-qa`。
2. 跑完所有 Device QA checks。
3. 导出脱敏 JSON。
4. 校验报告：

```bash
rtk pnpm test:mobile:device-qa-report /path/to/tabitomo-ios-device-qa-report.json
```

5. 生成严格 release evidence：

```bash
rtk env TABITOMO_IOS_RELEASE_PATH=local-xcode TABITOMO_PROVIDER_SMOKE_REQUIRED=all \
  pnpm test:mobile:release-evidence -- \
  --strict \
  --device-report /path/to/tabitomo-ios-device-qa-report.json \
  --out output/tabitomo-ios-release-evidence.json
```

如选择 EAS，则 `TABITOMO_IOS_RELEASE_PATH=eas`。

## 8. 当前最高风险

1. 真实 provider 还没有在本工作区跑完整 all-required smoke。
2. 签名真 iPhone/TestFlight QA 还没有完成，尤其是 SecureStore 持久化、相机、麦克风、Apple Speech、Vision OCR、文件/分享、真实 QR 解码。
3. Apple Vision/Apple Speech baseline 是否足够覆盖旅行场景，需要真图和真语音验证。
4. Custom Core ML / whisper.cpp / sherpa-onnx / ONNX Runtime Mobile / PP-OCR native 仍是决策项，不应在没有证据前阻断首个 TestFlight。
5. 首个 RC 默认发布路径已定为 local Xcode；仍需在 RC 环境显式设置 `TABITOMO_IOS_RELEASE_PATH=local-xcode` 并完成签名 archive。

## 9. 下一步队列

1. 准备真实 provider env，跑 `TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke`。
2. 在 RC 环境显式设置 `TABITOMO_IOS_RELEASE_PATH=local-xcode`，执行本地签名 archive。
3. 做一个签名 iPhone build，执行 `.agents/ios-real-device-qa.md`，导出并校验 Device QA report。
4. 用真实菜单、招牌、收据图片对比 Web PP-OCR、iOS Vision、cloud OCR、VLM overlay/lightbox。
5. 用真实语音样本测试 cloud ASR、Apple Speech、on-device Speech，记录语言覆盖和失败态。
6. 根据真机证据决定 custom local runtime 是否进入下一阶段 prototype。
7. 用 strict release evidence 冻结 RC 证据包。

## 10. 关键决策记录

| 日期 | 决策 | 影响 |
| --- | --- | --- |
| 2026-07-09 | iOS Expo 版本必须是 native RN shell，不是 WebView wrapper | parity audit 持续检查 |
| 2026-07-09 | 首个 iOS baseline 使用 Apple Speech / Apple Vision，不默认捆绑 custom model | 降低首发包体和 license 风险 |
| 2026-07-09 | model-pack 先实现缓存、校验、安装、激活选择和删除；runtime adapter 后置 | 让本地模型 UI/存储链路可先验收 |
| 2026-07-11 | Mobile 取消用户 path/manifest 模式，固定从 tabitomo R2 下载；ASR 统一使用 sherpa-onnx，OCR 使用 ONNX Runtime，Apple 能力作为缺失/失效 fallback | 下载后的模型进入真实推理路径，设置中的引擎选择按固定模型 ID 生效 |
| 2026-07-09 | 真 provider 和签名真机 QA 是完成定义，不被 simulator mock 替代 | 防止“看起来可用”但不可发布 |
| 2026-07-09 | Mobile 图片输入进入独立图片工作台时清理旧文本运行、旧结果、furigana 和 overlay；取消相机/相册选择不清空原文本 | 对齐 Web 输入上下文切换语义，同时保留 mobile 操作按钮的容错 |
| 2026-07-09 | 首个 RC canonical 发布路径默认走 `local-xcode`；当未设置 `TABITOMO_IOS_RELEASE_PATH` 且本机 Xcode 可用、EAS CLI 不可用时，release evidence 记录 `selectionSource=default-local-xcode` | 移除发布路径未决项；strict release 仍必须提供真实 provider 和签名真机报告 |
| 2026-07-09 | Device QA report 增加 `expo-device` runtime provenance；非 sample 报告必须 `isPhysicalDevice=true` 且 `isSimulator=false` 才能通过 validator | 防止 simulator 或复制 sample 被误当成签名真机 release evidence |
| 2026-07-09 | iOS simulator smoke 的 canonical scene 切换机制是 Documents 里的 `tabitomo-smoke-scene.json` 输入文件 + `tabitomo-smoke-scene-ack.json` ack 文件；脚本等待 ack 后再截图 | 避免 `simctl openurl` 触发 iOS 系统确认弹窗，减少 scene 未切换时的误判 |
| 2026-07-09 | `expo-device` 这类 Expo 原生模块加入 JS 依赖后，必须同步 iOS Pods；本轮 Release/Hermes 白屏 root cause 是缺少 native `ExpoDevice` module，已在 `apps/mobile/ios` 执行 `rtk pod install` 安装 `ExpoDevice (57.0.0)` | 后续新增 Expo native dependency 时，必须把 pod install 和 Podfile.lock/ExpoModulesProvider 更新纳入检查 |
| 2026-07-09 | mobile Settings 增加横向 section jump bar，并用 `onLayout` 记录 General、Translation、Speech、Image、Local、Config 分组位置 | 补齐 Web 设置 tab/group 的移动端等价导航；parity audit 使用标题和 jump anchor 锚点，避免被 JSX props 变化误伤 |
| 2026-07-09 | mobile 安全输入统一在 `Field` 里提供 Eye/EyeOff 显示/隐藏按钮 | 补齐 Web Import/Export 和首次设置中的密码可见性体验，同时覆盖 Settings 与 Setup 的 API key/password 输入 |
| 2026-07-09 | mobile 从文本工作台进入 Camera/Album 图片翻译时进入 image language context，自动交换源/目标语言；清空或切回非图片文本模式时恢复方向 | 对齐 Web text/image 输入法切换时的语言自动反转语义，让默认 `zh → ja` 首屏仍适合文本输入，同时拍日文菜单/招牌时自动走 `ja → zh` |
| 2026-07-09 | mobile 结果复制按钮新增 `Copy → Copied` / Check 的 2 秒反馈，并在结果文本变化时复位 | 对齐 Web 结果区复制成功反馈，避免用户只能依赖 transient notice 判断复制是否成功 |
| 2026-07-11 | Expo iOS Xcode project/workspace 纳入源码管理；`app.json` + config plugin 作为 native project source of truth，统一 Automatic signing、Team `PB8H83VL3Z`、CloudKit capability、deployment target 和版本号 | clean prebuild 后签名/CloudKit 配置不漂移；Xcode 账号管理证书和 provisioning profile，脚本不保存签名凭据 |

## 11. 最新本地验收记录

2026-07-11 固定模型、Settings 与 iCloud 同步验收：

- `rtk pnpm test:core`：通过，38 tests；覆盖五个设置分组的时间戳合并、同时间戳本机优先和 legacy snapshot 迁移。
- `rtk pnpm test:mobile:model-assets`：通过，125 个远端 R2 资产检查；Whisper Base、SenseVoice Small、PP-OCR v5 Mobile 的 manifest、运行时必需文件、字节数、SHA-256 和 license metadata 均通过。
- `rtk pnpm test:mobile:web-smoke`：通过；实际选择 VLM `OCR settings`，验证 VLM 流式图片请求和 OCR 非流式识别共用同一 OCR model，并覆盖 320x720 无横向溢出。
- `rtk pnpm test:mobile:parity-audit`：通过，365 checks；包含固定资产域名、无 path/manifest 输入、PP-OCR 下载、iCloud opt-out/冲突说明、Image OCR reuse 和原生完整模型 smoke 状态。
- `rtk env IOS_SMOKE_SCENES=settings,settings-image,settings-config,settings-local pnpm test:mobile:ios-smoke`：通过；人工检查截图确认 Settings 延迟内容没有停在 spinner，Image 场景选中 `OCR settings` 并显示联动面板，Config 显示 iCloud opt-out，Offline 场景完整渲染。
- `rtk env IOS_SMOKE_SCENES=local-model-runtime-smoke IOS_SMOKE_KEEP_ARTIFACTS=1 pnpm test:mobile:ios-smoke`：通过；iOS Release 模拟器从固定 R2 下载并原生执行 Whisper Base（sherpa-onnx，149 ms）、SenseVoice Small（sherpa-onnx，36 ms）和 PP-OCR v5 Mobile（ONNX Runtime，30 ms、1 行）。结果只记录模型/runtime、时长和输出长度/行数，不记录识别内容、媒体或本地 URI。
- `rtk pnpm --dir apps/mobile typecheck`、`rtk pnpm build`、`rtk git diff --check`：通过。
- 签名 iPhone 的 iCloud opt-out/冲突/离线恢复和真实键盘帧率仍需真机 QA；下载模型的 sherpa-onnx / ONNX Runtime Mobile 推理 adapter 尚未实现，当前运行时继续使用 Apple Speech / Vision fallback。

2026-07-11 Xcode Managed Signing 工具链验收：

- `rtk pnpm ios:sync-project`：通过；Expo clean prebuild 后完成 CocoaPods 安装，恢复 source-controlled project/workspace、Podfile.lock、PrivacyInfo 和三个 tabitomo native module。
- `rtk pnpm test:mobile:ios-xcode-preflight`：通过，23 checks；Release/iphoneos 使用 `CODE_SIGN_STYLE=Automatic`、Team `PB8H83VL3Z`、空 provisioning profile specifier，并与 Expo version/build、iOS `16.4` 对齐。
- `rtk pnpm test:mobile:release-readiness`：通过，176 checks；覆盖原生工程、config plugin、同步/打开/build number/archive/upload 脚本、CloudKit Production export options、签名材料忽略规则和源码忽略规则。
- `rtk pnpm --dir apps/mobile typecheck`：通过。
- `rtk pnpm test:mobile:parity-audit`：通过，300 checks；Web/shared-core 行为未改动。
- `rtk pnpm ios:set-build-number 1`：通过；build number 写回 Expo source 后完整重建 project/workspace 和 Pods。
- `rtk pnpm ios:archive --build-number 1`：命令已进入 Xcode provisioning，因本机 Xcode 未登录 Apple Developer 账号而以 `No Accounts` / 缺少 `com.backrunner.tabitomo` profile 停止；工程配置无额外错误，登录 Team `PB8H83VL3Z` 后需重跑。
- `rtk env IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`：通过；source-controlled workspace 完成 Release simulator 全量编译、安装、启动、light/dark 首屏截图与 `main` scene ack。

2026-07-09 追加 native 验证：

- `rtk pnpm test:mobile:ios-xcode-preflight`：通过，20 checks；Release/iphoneos workspace、scheme、bundle id `com.backrunner.tabitomo`、iOS `16.4`、marketing version、build number 和 Info.plist 均对齐；本机尚未配置签名 team/profile，签名 archive 仍需 Apple credentials。
- `rtk pod install`（目录：`apps/mobile/ios`）：完成；安装 `ExpoDevice (57.0.0)` 并更新 iOS Pods/`ExpoModulesProvider.swift`，修复 Release app 启动时报 `[runtime not ready]: Error: Cannot find native module 'ExpoDevice'` 的白屏问题。
- `rtk pnpm --dir apps/mobile typecheck`：通过。
- `rtk env IOS_SMOKE_SCENES=device-qa pnpm test:mobile:ios-smoke`：通过；验证 `expo-device` native module 链接后 Release/Hermes simulator 可构建、安装、打开 `device-qa` scene，并经 `tabitomo-smoke-scene-ack.json` ack 后截图。
- `rtk pnpm test:mobile:ios-smoke`：通过，23 个 iOS simulator scenes；QR import `payloadLength=1784`，config round-trip `payloadLength=1752`，Hunyuan output `model=tencent/Hunyuan-MT-7B, outputMode=plain`，text/image/speech provider requests 为 `3/3/1`，model-pack tiny install `bytes=31`。当前 scene 矩阵已扩展到 24 个，新增 `config-guidance`。
- `rtk node --check scripts/ios-simulator-smoke.mjs`：通过；smoke 脚本当前依赖 scene 文件 + ack 文件确认 scene 已被 Release app 读取，不使用 `simctl openurl` 作为 scene 切换路径。
- `rtk pnpm test:mobile:release-readiness`：通过，125 checks。
- `rtk pnpm test:mobile:parity-audit`：通过，265 checks；新增 `sheetHeaderText`、`SettingsJumpBar`、`SETTINGS_JUMP_ITEMS`、Settings section jump anchor、`ConfigGuidanceCard`、`config-guidance` scene、secure field reveal、Web text/image language auto-swap 和 mobile image language context 锚点，防止 sheet header、Settings 分组导航、缺配置引导、安全输入显示/隐藏、图片语言方向回退。
- `rtk env IOS_SMOKE_SCENES=setup-choice,settings,qr-scanner,device-qa pnpm test:mobile:ios-smoke`：通过，4 scenes；覆盖本轮 sheet header 可读性修复在 Release/Hermes simulator 中可渲染。
- `rtk env IOS_SMOKE_SCENES=settings pnpm test:mobile:ios-smoke`：通过；确认新增 Settings section jump bar 后，Release/Hermes simulator 可构建、安装、打开 `settings` scene 并截图。
- `rtk env IOS_SMOKE_SCENES=settings,setup-manual,setup-import pnpm test:mobile:ios-smoke`：通过，3 scenes；确认 secure field reveal 改动后 Settings、手动首次设置和导入首次设置表面仍能在 Release/Hermes simulator 渲染并截图。
- `rtk pnpm test:mobile:device-qa-report`：通过 sample fixture；sample 仅用于校验器自身，strict release evidence 仍拒绝 sample。

2026-07-09 本地自动化验收：

- `rtk pnpm test:core`：通过，33 tests。
- `rtk pnpm --dir packages/tabitomo-core exec tsc --noEmit`：通过。
- `rtk pnpm --dir apps/mobile typecheck`：通过。
- `rtk pnpm test:mobile:release-readiness`：通过，125 checks。
- `rtk pnpm test:mobile:parity-audit`：通过，265 checks；本轮新增 Web text/image 语言自动反转与 mobile image language context 静态锚点。
- `rtk env IOS_SMOKE_SCENES=main,image pnpm test:mobile:ios-smoke`：通过，2 scenes；确认主工作台和图片预览场景在新增 image language context 后仍可在 Release/Hermes simulator 渲染。
- `rtk pnpm test:mobile:release-evidence`：通过，dev/non-strict；当前 `releasePath.selected=local-xcode`、`selectionSource=default-local-xcode`；provider env 未配置、真机 Device QA report 未提供。
- `rtk pnpm test:mobile:device-qa-report`：通过 sample fixture；strict release evidence 仍会拒绝 sample。
- `rtk pnpm test:provider-smoke`：dry-run 通过，0 passed / 7 skipped；真实 credentials 待配置。
- `rtk pnpm test:mobile:web-smoke`：通过，Expo web export + Playwright 主流程 smoke。
- `rtk env IOS_SMOKE_SCENES=main,image,image-lightbox pnpm test:mobile:ios-smoke`：通过，聚焦图片工作台变更。
- `rtk pnpm test:mobile:ios-smoke`：通过，23 个 iOS simulator scenes；当前 scene 矩阵已扩展到 24 个，新增 `config-guidance` 并已聚焦验证。
- `rtk env IOS_SMOKE_SCENES=config-guidance pnpm test:mobile:ios-smoke`：通过；确认缺 General AI 时主工作台原生渲染内联 `Open Settings` 引导卡。
- `rtk git diff --check`：通过。

2026-07-09 结果复制反馈 parity 验收：

- `rtk node --check scripts/mobile-parity-audit.mjs`：通过。
- `rtk pnpm test:mobile:parity-audit`：通过，270 checks；本轮新增 Web copy success state/timeout 与 mobile `resultCopied`、copy reset timer、`Copied` label 静态锚点。
- `rtk pnpm --dir apps/mobile typecheck`：通过。
- `rtk pnpm test:mobile:release-readiness`：通过，125 checks。
- `rtk env IOS_SMOKE_SCENES=main pnpm test:mobile:ios-smoke`：通过，1 scene；确认主工作台在结果复制反馈改动后仍可在 Release/Hermes simulator 渲染。
- `rtk git diff --check`：通过。
- `scripts/mobile-release-evidence.mjs` 已支持在本机 Xcode 可用且 EAS CLI 不可用时默认选择 `local-xcode`，并记录 `releasePath.selectionSource`。
- strict release evidence 负例已验证：在 provider readiness 伪造齐备且传入 checked-in sample Device QA report 时，脚本仍以 `Device QA report is the checked-in sample fixture` 失败。
- Device QA report 增加物理设备 provenance；`scripts/ios-device-qa-report-check.mjs` 对非 sample 报告要求物理 iPhone，不接受 simulator。

## 12. 相关文档

- Expo 迁移中文台账：`.agents/expo-universal-app-requirements.zh-CN.md`
- Expo 迁移英文台账：`.agents/expo-universal-app-requirements.md`
- 真机 QA 清单：`.agents/ios-real-device-qa.md`
- 本地模型策略：`.agents/ios-local-model-runtime-strategy.md`
- 发布证据说明：`.agents/ios-release-evidence.zh-CN.md`
- 本地 Xcode 发布路径：`.agents/ios-local-xcode-release-path.zh-CN.md`
- EAS 发布路径：`.agents/ios-eas-release-path.zh-CN.md`
