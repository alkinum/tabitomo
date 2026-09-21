# Web / iPhone 设计与模型接入修订

2026-09-08。本次目标是让翻译、解释、问答的入口更清楚，统一两端的靛蓝配色，并允许用户选择自己的模型与服务。

## 已实现的产品决策

- `packages/tabitomo-core/src/designTokens.ts` 管理浅色、深色语义色；Web CSS 与原生 React Native 消费同一份值。主色为 `#6366f1`，浅色背景为靛蓝、淡紫、淡粉，深色使用靛蓝墨色。
- Web 桌面使用原文／结果双栏，手机纵向排列；原生 App 保留安全区、原生相册／相机／语音及滚动布局。减少重复边框、嵌套卡片和大面积粗体，保留轻微平面阴影与按压反馈。
- Translate / Explain / Q&A 位于语言选择之前。说明与问答只需结果语言；Web 切换文本模式保留已输入内容。错误、空态、等待、复制和朗读有明确状态。
- 首次设置和后续设置都能连接 OpenRouter、手填兼容服务，或导入加密配置。连接并选择模型后可直接 Start translating，语音／图片选项可稍后调整。
- 默认云模型 ID 留空；不自动指定 TeleAI、Qwen 或 ModelScope 的模型。显式选择的旧配置仍可导入。语音类型为 `openai-compatible`，旧枚举仅在配置导入边界迁移；SiliconFlow 与旧 HY-MT 专用接入已删除。

## 凭据与模型选择

OpenRouter 直接填写 API key，不提供 OAuth/code 交换界面。iOS 保存沿用 SecureStore / 既有 CloudKit 路径，Web 沿用本机设置存储。

模型列表由用户点击后向所选服务的 `/models` 读取；可搜索、按提供方声明的图像能力筛选，也始终可手填 ID。没有能力元数据时显示为未知，不猜测模型支持视觉。模型列表不是可用额度或实际推理成功的保证。

Ollama（通常 `http://电脑局域网地址:11434/v1`）、LM Studio（通常 `http://电脑局域网地址:1234/v1`）和其他兼容服务可连接。明确的 localhost／局域网地址允许 API key 留空。手机的 localhost 指手机自身。Web 还受浏览器 CORS／混合内容限制；原生 iOS 声明局域网用途和局域网 ATS 例外，真实 iPhone 权限和服务器可达性需实测。不开放任意 HTTP 的全局 ATS 例外。

语音接口允许独立 endpoint、model 和 key；只在服务基地址完全相同时复用已有凭据，避免把 General AI key 发给另一个语音服务。切换预设服务会清空旧 key。

当前翻译接入契约见 [通用翻译模型与 Hy-MT2](translation-models.zh-CN.md)。

## OCR / 视觉能力边界

| 路径 | 输出 | 当前实现 |
| --- | --- | --- |
| Local PP-OCR v6 Small | 文字与坐标 | Web worker；iOS 原生 runtime，模型缺失／不可运行时 Apple Vision 兜底 |
| General AI OCR | 文字 | 复用主 AI 的协议、地址、模型与 key，需要支持图像输入 |
| Custom vision OCR | 文字 | 任意兼容 Chat Completions 视觉模型，包括本地服务器 |
| 显式 Qwen OCR | 文字与坐标 | 保留 Model Studio `advanced_recognition` 适配，模型可编辑，旧配置兼容 |
| Vision translation | 直接图片翻译 | General AI、自定义视觉连接，或复用 OCR 视觉连接 |

普通视觉模型提取的文字不伪造几何坐标。只有带实际位置数据的 OCR 才绘制覆盖层。iOS 复用本地 OCR 的 VLM 选项仍是 OCR＋文本翻译回退，并非本机 VLM 推理。

## 本地模型取舍

本次接续工作区已有的 PP-OCR v6 Small runtime 迁移，没有替用户发布或替换远端模型资产。

| 模型 | 决定 | 原因与限制 |
| --- | --- | --- |
| PP-OCR v6 Small，约 30 MiB | 保留已接入的端侧文字检测／识别路径 | 需用菜单、招牌、收据与 Apple Vision 对照；版本更新本身不能证明更准 |
| Whisper Base int8，约 153 MiB | 保留通用多语 ASR 起点 | 已有 sherpa-onnx 适配；不同口音、噪声与设备性能待真机验证 |
| SenseVoice Small，约 228 MiB | 提供中／粤／英／日／韩的可选路径 | 已接入 ITN 及语言选项；语言范围与 Whisper 不同 |
| Qwen3-VL-2B-Instruct | 本地服务器候选 | Apache-2.0，模型卡描述 32 种 OCR 语言；适合作为多语视觉候选，当前没有 App 内原生 VLM runtime |
| SmolVLM2-500M-Video-Instruct | 小型视觉实验候选 | Apache-2.0，模型卡标记英语；1.8GB GPU 视频推理描述不是 iPhone 内存实测，不能当成中日文 OCR 默认替代 |
| Moonshine Tiny（原版） | 英语低延迟 ASR 候选 | MIT，原版模型是英语，不替代中／日／粤旅行场景 |
| Whisper large-v3-turbo | 桌面／服务器多语 ASR 候选 | 更大模型可通过兼容语音服务接入；未把它作为手机默认下载 |

模型卡依据：

- <https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct>
- <https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct>
- <https://huggingface.co/UsefulSensors/moonshine-tiny>
- <https://huggingface.co/openai/whisper-large-v3-turbo>
- 运行时支持：<https://github.com/k2-fsa/sherpa-onnx>

下一次调整手机默认模型需同一批素材、同一设备对比：中日英及粤语分组 CER/WER，OCR 漏行率／阅读顺序／位置误差，热启动与冷启动延迟，峰值内存、长时间使用、能耗、下载体积、许可证。评估记录按 `.agents/ios-local-model-runtime-strategy.md` 与真机 QA 文档填写；本次没有新的准确率或手机性能结论。

## 验证边界

共享协议测试覆盖 PKCE、过期与错误脱敏、模型发现、本地免密、ASR 凭据隔离及加密配置往返。Web 和 Expo Web smoke 使用模拟 provider，不代表真实账户授权、额度、供应商模型可用性、CORS 或真机网络权限已经验证。原生模拟器截图也不替代签名 iPhone 的相机、麦克风、CloudKit 及端侧模型质量验证。

## 本次实现验证

- Web 的翻译、解释、问答、云端语音和图像请求复用 shared core，移除重复 SDK 调用路径；Markdown 输出使用安全的 React 渲染并保留 GFM 表格。
- 核心 48 项测试通过；Web、core、mobile TypeScript 检查通过；parity audit 415 项通过。
- Chromium / WebKit 共 20 项检查通过：1440、390、320 宽度，明暗主题，无水平溢出，授权交换与模型筛选，当前模式语音问答，自定义 OCR 无坐标结果。
- Expo Web smoke 通过：配置导入导出、首次设置、模式、VLM、Qwen OCR、自定义 OCR、OpenRouter 模拟授权与筛选、390×844／320×720。
- Xcode 27 / iOS 27 Release 模拟器四个场景通过：main、settings、settings-image、setup-manual。启动采用 UIScene，Expo prebuild 插件保持此配置，并将依赖最低部署版本与 App 对齐；最终模拟器测试未使用部署版本命令行覆盖。Release 产物保留自定义局域网权限用途文本。
- 截图保存在 `output/playwright/`。真实 OpenRouter 账户授权、签名 iPhone 的局域网权限／CloudKit／端侧模型准确率和性能仍未在本次模拟测试中验证。


## 移动端质感修订（2026-09-08，后续反馈）

本轮影响品牌文案、视觉层级、输入工具布局与设置选择器；沿用现有设置格式、翻译模式、provider 接口和保存语义。

- Web / iPhone 品牌只显示 tabitomo；翻译空态的圆角方块正向摆放。保留吉祥物，移除手机背景的重复装饰图案。
- Shared core 继续统一 `#6366f1` 主色，降低背景渐变、卡片边线的饱和度，采用更轻的结果底色；深色模式使用独立的文字、表面和选中色。
- 两端的模式栏改为浅色滑块，语言选择合成一个控件组，交换图标改为水平方向。辅助图标和标题降低字重及色彩强度，输入区焦点体现在整张卡片边线。
- 手机把 Clear 放在输入卡片右上角，底部保留语音、相机、相册，主操作显示动作文字和箭头。小屏单独压缩空态留白，保留控件触摸区域；结果工具靠近卡片底部。
- 设置、首次配置与 Markdown 正文恢复正常字重，细分标题／标签／正文的层级。手机 provider 选择采用可展开列表，选完自动收起；Web 保留原生 select。这是针对手机空间的呈现差异，选项和凭据清除规则保持一致。
- Expo Web smoke 增加输入操作的尺寸、边界和重叠检查，以及 provider 列表收起检查；截图覆盖 390×844、320×720 明暗模式、翻译结果和设置选项。Web 继续覆盖 Chromium / WebKit。


本轮验证完成：核心 48 项测试；Web / core / mobile TypeScript；parity audit 418 项；Chromium / WebKit 20 项；Expo Web smoke；Vite 构建；iOS 27 Release 模拟器 main、settings、settings-image、setup-manual 四个场景全部通过。实际检查了 390×844、320×720 的明暗界面，以及原生设置／首次配置截图。截图更新在 `output/playwright/`。

iOS 验证期间系统盘空间不足，测试构建缓存已迁至 `/Volumes/BRData/tmp/tabitomo-ui-polish/DerivedData`，重新构建后使用默认系统临时目录创建模拟器并完成测试。本轮没有新的真机能力或模型质量验证结论。


## iOS 原生交互与材质（2026-09-08，移动端继续修订）

用户进一步要求移动端更贴合 iOS，而非复刻 Web 的平面卡片。本轮平台差异是明确的设计决策：Web 与 native 继续共用品牌语义色和业务协议，native 使用 UIKit 控件、系统材质与原生页面呈现。

- 新增 `NativeChrome.tsx`：iOS 26+ 且运行时 API 与系统设计均可用时使用 Expo Liquid Glass。旧版 iOS 使用系统 chrome blur；开启 Reduce Transparency 时使用实色。监听 Reduce Motion，原生弹层关闭自定义滑入动画、便携模式栏跳过弹簧动画。选择与主要动作加入系统 haptics。
- 翻译、解释、问答以及设置分类使用 UIKit `UISegmentedControl`；Expo Web 保留可访问的 React 控件供开发和 smoke 使用，不将其截图当作原生材质效果的证据。
- 首页合并为连续的输入／结果面板，语言栏、设置入口及底部工具栏采用原生材质。工具栏从输入框中移到屏幕底部；主操作使用靛蓝渐变和柔和投影。输入控件维持 44pt 触摸尺寸，空态方块保持正向。
- 键盘显示时收起副标题、模式栏并缩小顶部区域，减少底部安全区留白；外层 KeyboardAvoidingView 统一让工具栏随键盘抬起，避免与 ScrollView 重复增加键盘 inset。移除缓存命中提示，减少编辑流程中的实现细节。
- 设置、语言选择和首次配置使用 iOS pageSheet，系统负责页面层次与下拉关闭，React 的 onRequestClose 保持显示状态同步；非 iOS 保留完整进出场的弹层。设置内容采用 inset grouped form，语言列表提供搜索、无结果提示和选择勾。
- 新增 Expo SDK 匹配的 `expo-glass-effect`、`expo-blur`、`expo-haptics`、`@react-native-segmented-control/segmented-control`，通过 pod install 接入现有 iOS 工程，没有重新生成工程或改变最低 iOS 16.4 版本。
- Smoke 增加原生 `main-keyboard` 场景，实际聚焦输入框；新建 iOS 27 模拟器仍显示 QuickPath 首次使用引导，因此该场景确认键盘区域出现后输入框与工具栏的布局，不代表已实际键入或验证系统键盘教程后的所有操作。Expo smoke 检查语言搜索、重新打开时清空搜索、320/390 布局及工具栏边界。原生渲染与触感真实性分开记录：模拟器不能证明真实 haptic 手感或完整手势使用体验。


本轮验收：核心 48 项、parity audit 429 项、core/mobile 类型检查、Vite 构建与 Expo Web smoke 通过。最终 iOS 27 Release 原生渲染 8 个场景通过：main、main-keyboard、settings、settings-image、setup-manual、language-picker、markdown、longtext；已检查对应截图。390×844 / 320×720 明暗布局与 44pt 工具栏检查通过。截图见 `output/playwright/ios-*.png`，新增原生模块需重新构建 App；旧版本系统材质回退及真实触觉手感仍需对应设备验证。
