# 翻译模型接入契约（2026-09-20）

Web 和 Expo 的设置、首次配置共用同一套行为：复用 General AI，或为翻译单独配置 OpenAI-compatible 服务。专用连接提供供应商选择、API key、显式加载 `/models`、搜索模型及手填 Model ID。已删除旧版 HY-MT/Hunyuan-MT 的专用接入，以及 SiliconFlow 的 AI、翻译、TeleSpeech ASR 预设。供应商不提供列表或返回错误时保留手填路径。切换供应商清空其密钥及模型，General AI 配置保持独立。

新选择的专用翻译模型默认 `plain`，减少专用模型必须生成 JSON 的要求；`structured` 放在 More options。Chat/Responses 自动兼容，不增加用户协议选项。旧版模型识别、强制纯文本、Structured 禁用、尾部括号删除和专用 iOS smoke 均已删除。Hy-MT2 单独识别，plain 使用完整目标语言名和单条 user 指令；structured 仍可用，不强制 API 的 `response_format`，保留译文原有括号内容。未知模型走通用翻译 prompt。

语音 provider 类型统一为 `openai-compatible`；仅配置读入边界将旧 `siliconflow` 值迁移为通用类型，保留用户显式填写的 endpoint/model/key，不包含 SiliconFlow 运行时分支或默认配置。没有新增字段或改变加密格式。已有显式输出选择仍保留；MT2 缺省输出选择按模型归一为 plain。加密 `.ttconfig` 可跨端保留 endpoint、key、任意模型 ID 和输出选择。General AI 复用继续支持其已有协议，包括 Anthropic；单独翻译连接当前接入的是 OpenAI-compatible API，不是任意签名制机器翻译 RPC。

## 已核对资料

- [腾讯 Hy-MT2 官方模型卡](https://huggingface.co/tencent/Hy-MT2-7B)：单条 user 翻译指令、完整语言名、格式/结构保留与指令翻译能力。
- [OpenRouter 公共模型目录](https://openrouter.ai/api/v1/models)：本次确认包含 `tencent/hy-mt2-1.8b`、`tencent/hy-mt2-7b`、`tencent/hy-mt2-30b-a3b`。目录会变化，界面实时读取，不把这些名称写死为默认值。

## 验证边界

共享测试覆盖模型族区分、实际请求体、独立凭据、旧配置兼容、General AI 复用及加密往返。浏览器测试覆盖两端设置/首次配置、目录选择、手填回退、保存重载和 320×720 / 390×844 明暗布局。iOS 保留 `settings-hymt2`，并以通用语音请求和加密配置往返验证新 provider 类型。

公开目录可访问不代表付费推理、延迟或翻译质量已经验收；本次测试使用合成密钥和 mock 响应，没有调用用户的付费模型。

删除后验证：72 项 core 测试、Web/core/mobile TypeScript、497 项 parity audit、Expo web 全量 smoke、Web production build、Chromium/WebKit 共 42 项 UI/行为回归通过；复核 320×720 和 390×844 明暗界面。供应商列表与当前表单截图见 `output/provider-removal-review/provider-review.png`。

iOS 本轮已通过 MT2 原生表单渲染与通用 ASR 请求（1 次 multipart 上传）。首次批量运行在第三场景的 `simctl launch` 阶段卡住，应用尚未进入配置测试；终止该启动后，独立 Release simulator 重跑配置往返通过（`payloadLength=1800`）。这三个场景合计覆盖新模型表单、通用语音调用和加密配置原生保存/重载；不是付费 provider 或签名真机验收。
