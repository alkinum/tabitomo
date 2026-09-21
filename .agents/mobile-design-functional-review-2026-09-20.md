# Mobile 设计与功能 review（2026-09-20）

**Safe Area 验收修正**：用户指出旧截图的品牌行压到状态栏，此前视觉检查遗漏了这个问题。现已改为显式系统 inset 布局、modal-local Provider 和 UIKit 屏幕坐标键盘避让；以新的几何断言和截图替代此前对安全区的判断。详见 [Safe Area 修正记录](safe-area-review-2026-09-20.md)。

本轮检查覆盖主工作台、三种文本模式、语言选择、相机/相册与 OCR/Vision、结果与朗读、首次配置、AI 授权/模型发现、设置分类、加密配置、扫码、离线模型管理、SecureStore/CloudKit 和原生语音生命周期。对照 Web、shared core 和既有验收脚本；保留正在同一工作区进行的 OCR provider 修改。

## 已修正的问题

| 优先级 | 发现 | 调整 |
| --- | --- | --- |
| P1 | 翻译中清空/切模式把请求 ref 清空，但没有恢复 busy；finally 无法再解除禁用 | 统一取消与 busy 恢复，输入变更立即取消旧请求，避免旧结果回写 |
| P1 | 图片重跑没有完整 loading/catch/cancellation，底部按钮仍执行文本翻译 | 图片使用独立 AbortController；主按钮按当前内容执行，模式切换重跑现有图片，清空/改方向取消旧图片任务 |
| P1 | 未配置 Vision 时先拦截图片选取，用户无法进入图片页选择可用 OCR | 先选图片，再提供对应模式的配置引导；图片保留以便切换或重试 |
| P1 | Explanation/Q&A 误套用源/目标语言不能相同的翻译限制 | 仅 Translation 保留此限制，与 Web 对齐 |
| P1 | Settings / setup 保存 Promise 失败没有反馈，可重复点击 | 显示 Saving，阻止保存期间关闭/重复保存，保留草稿和错误，支持重试 |
| P1 | 原生扫码 Modal 是设置 pageSheet 的兄弟节点，呈现关系不正确 | 扫码放到当前 sheet 内，并复用统一弹层与权限拒绝恢复路径 |
| P2 | 录音后才发现 Cloud ASR 缺少 endpoint/model/key；原生启动错误可能未捕获 | 录音前校验连接，保护重复启动，统一失败恢复；麦克风拒绝不遗留 busy |
| P2 | 原生 Speech 旧任务迟到的回调可能修改下一次录音 | 使用 generation 隔离 session，并在主队列接收识别事件 |
| P2 | 朗读无停止状态、切结果继续读旧内容、复制失败没有提示 | Listen/Stop audio 状态、结果变化停止朗读、复制错误可见 |
| P2 | 开启 iCloud 会保存正在编辑但未按 Save 的 draft；偏好写入失败内存状态仍改变 | 同步仅使用已保存设置；偏好持久化成功后再更新内存状态 |
| P2 | 下载中重开 Settings 清掉下载 busy 标记，允许重复操作 | 保留正在进行的模型操作状态 |

## 设计调整

- 保留 shared indigo light/dark palette、iOS 原生 segmented control、material 和 pageSheet。没有将 iOS 改成 WebView。
- `controlStyles.ts` 统一 Settings、setup、AIConnection 的输入、选择和主要按钮；输入有产品 focus 状态，主要操作 48pt，紧凑操作至少 44pt。
- 通用 AI 的 Connection / Translation 分组独立展示；缺配置引导进入真正需要的分组。
- 首次配置在底部提供 Start translating，语音/图片保留为可选路径；删除让用户误以为必须完成三步的进度条。
- 图片界面显示 Photo、预览、Vision/OCR 模式和统一 Translate 操作，不再同时展示可编辑的空文本框和重复的图片重跑按钮。
- 处理进度进入结果区域；流式文本已有内容时继续显示进度。错误保留在结果中，不随短暂通知消失。
- 配置引导使用完整 Open Settings 文本按钮；移除结果区的小卡片嵌套。设置页使用同一背景/分组层次。
- 表单 ScrollView 使用 handled keyboard taps 与拖动收键盘。语言和模式切换在语音操作期间受保护。
- 普通弹层可通过背景退出；扫码使用相同弹层、安全区和 reduce-motion 行为。

## 行为合同与平台影响

| 层 | 影响 |
| --- | --- |
| Web | 本轮 review 对照其取消、同语言助手、图片主操作和设置行为；保留并一起验证同工作区 OCR 修改 |
| Mobile | 本文所列 UI、异步状态、设置保存、媒体工作流与可访问性修正 |
| Shared core | review 没有新增 settings 字段或改变加密 config 格式；复用现有连接校验、provider signal 和设计 tokens |
| Native | Apple Speech session 隔离；pageSheet/扫码生命周期调整；SecureStore 同步开关的成功时序修正 |
| Tests | 更新 parity anchors；新增真实 Expo UI 的受控慢请求、取消、同语言助手、保存失败重试、图片重跑/失败恢复回归 |

## 验证记录

| 验证 | 结果 |
| --- | --- |
| `pnpm test:core` | 56/56 通过，含同工作区的 OCR provider 测试 |
| Shared core / Mobile TypeScript | `pnpm --dir packages/tabitomo-core exec tsc --noEmit`、`pnpm --dir apps/mobile typecheck` 通过 |
| `pnpm test:mobile:parity-audit` | 444 项通过 |
| `pnpm test:mobile:web-smoke` | 通过；包括新增取消、迟到结果隔离、同语言助手、保存失败重试、图片重跑/失败恢复回归 |
| `pnpm build` | 通过；既有 OpenCV 的 crypto/fs browser externalization 提示仍存在 |
| Web Playwright | 隔离端口运行 60 场景，首轮 58 通过；2 个 Mobile Safari 启动超时场景用独立进程重试后通过 |
| iOS Release simulator | iPhone 16 / iOS 27 构建、安装、启动及 16 个指定场景通过；最后的原生弹层高度修正后，Settings / setup-manual / language-picker 3 场景再通过 |
| 视觉检查 | Expo 390×844、320×720 明暗主题；11 个设置/配置/语言表面共 44 张截图，以及工作台三模式/结果截图；原生设置、首次配置、语言、扫码、Markdown、图片/大图、缺配置引导 |
| `git diff --check` | 通过 |

`scripts/mobile-interaction-review.mjs` 由 `test:mobile:web-smoke` 调用，使用 synthetic provider，不消费用户 API 配额。原生扫码导入回调 smoke 验证了加密 payload 导入链路（payloadLength=1824）；unsigned simulator 的 SecureStore entitlement 限制不视为签名设备持久化验证成功。

Web E2E 曾误连已占用 4173 端口上的其他项目；已为 Playwright 添加显式 `127.0.0.1`、strict port、不复用现有 server 和 `TABITOMO_E2E_PORT`，上述有效结果使用隔离端口 44873/44874。原生第一次安装遭遇 simctl 卡住，重建隔离 simulator 后完成有效运行。截图脚本增加 scene ACK 后的呈现等待；最后三个场景已人工核对实际画面，不能仅以截图文件存在判定视觉通过。

截图存放在 [`output/mobile-review`](../output/mobile-review/) 与 [`output/playwright`](../output/playwright/)。代表性原生画面：[设置](../output/mobile-review/native/smoke-settings.png)、[首次配置](../output/mobile-review/native/smoke-setup-manual.png)、[语言选择](../output/mobile-review/native/smoke-language-picker.png)。修改前画面保留为 `before-*.png`。

## 尚不能由本轮自动化证明的项目

- 签名 iPhone 的 CloudKit 账号/entitlement、双设备冲突、离线重装恢复。
- 实际麦克风音频、Apple Speech final transcript、真实相机 QR、照片低光/旋转、TTS 音频路由和 provider 的质量/时延。
- 原生键盘场景遇到 iOS 首次键盘提示，观察到避让后的布局；尚未以此证明实际连续输入、候选词栏和第三方键盘体验。
- 动态大字体、VoiceOver 完整走查仍需设备辅助功能验收；44pt 目标和语义标签不等于完成无障碍认证。
- `App.tsx` 仍包含大量 simulator/Device QA 场景。后续可将 QA harness 和设置模块拆分，以减少产品代码的维护面；本轮避免大规模无行为收益的迁移。

这些边界不影响本轮已验证的 UI 和状态修复，但不能据此宣称已经通过发布级真机验收。

## 同日跟进：减少常驻说明文字

按用户反馈，默认界面只保留标题、字段/动作标签与当前状态。删除品牌口号、设置和首次配置副标题、选择按钮下的重复描述、空状态宣传句，以及 Web 结果区/页脚口号。空状态保留一句提示；权限、配置缺失、模型兼容性、下载和错误状态继续可见。

- Mobile 页头从 88pt 收到 68pt，首次配置选择从 92pt 收到 60pt。AI 连接移除 Quick connect 与账户说明，Provider 保留为字段标签。
- OCR/本地模型、iCloud 和加密配置规则使用已有帮助入口，去掉正文中重复的常驻说明。离线检查不再显示“点击后能检查什么”的描述，仅展示已有结果或实际状态。
- Web 同步精简设置、首次配置、连接和 OCR 表单；设置原理与密钥说明收进现有帮助弹层。导入密码说明缩为实际操作提示。
- 本次仅影响 Web/Mobile 呈现与原生页面布局；shared settings、provider 请求、加密格式及原生模块没有新增修改。既有 smoke 复用，parity 文案锚点改为共享选项来源。

验证：56 项 core 测试、core/mobile typecheck、444 项 parity audit、Web build 和 Expo web smoke 通过。Chromium / Mobile Safari 的 12 项布局检查通过；查看 320×720 / 390×844 明暗主题截图。iPhone 16 / iOS 27 Release simulator 的 `main`、`settings`、`setup-manual`、`settings-image` 四场景通过并核对截图。首次配置选择按钮的最后高度调整另以 Expo 画面复核。

本次截图另存于 [`output/copy-review`](../output/copy-review/)，包括 [原生主界面](../output/copy-review/native/smoke-main.png)、[原生设置](../output/copy-review/native/smoke-settings.png) 和 [320px 首次配置](../output/copy-review/setup-choice-320-light.png)。

## 同日跟进：克制的界面与 Apple HIG

按用户要求，Translate / Explain / Ask、Open Settings 和 OpenRouter 连接按钮使用文字标签，删除装饰箭头。工作台标题和空状态移除星星等装饰图形；相机、录音、复制、朗读、换向等具有操作含义的图标保留。主操作使用同一实色填充，去除按钮渐变、发光与立体底边；按压以透明度反馈，页面改用中性底色，统一主要容器圆角与内边距。

Apple 官方参考（2026-09-20 读取）：[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)。对应实现：

- 操作区域至少 44pt；帮助按钮由 32pt 改为实际 44pt，不依赖额外 hitSlop。主要按钮保持至少 48pt。
- iOS 常规字号保留系统 segmented control、pageSheet、Switch 和安全区；原生材料仅用于导航/操作控件。继续尊重减少透明度和减少动态效果。
- 较大 Dynamic Type 下，主操作工具栏分行、模式选项纵向排列、设置分类横向滚动。表单与正文继续使用 React Native 字体缩放，没有全局限制字体放大。
- 保留靛蓝品牌方向，将填充色微调为 `#5856d6`，白字静态对比度由 4.47:1 提升到 5.65:1。暗色选中项文字在 activeSurface 上由 4.26:1 提升到 6.37:1；两主题主要次级文字、输入提示亦检查到至少 4.5:1。此处是指定不透明色对的计算结果，不代表所有系统材料、图像背景和无障碍状态已经逐项认证。

平台影响：Web 与 Mobile 同步按钮、标题、空状态和配色；shared core 仅修改设计 tokens；native bridge/业务请求/配置协议未改。parity audit 增加大字号布局锚点和装饰图标禁用检查，iOS smoke 新增可选 `IOS_SMOKE_CONTENT_SIZE`。

已通过：56 项 core 测试、core/mobile typecheck、449 项 parity audit、Web build、Expo web smoke、12 项 Chromium/Mobile Safari 布局检查；另核对最终 320/390 明暗 Web/Expo 截图及纯文字 Translate 按钮。截图存放于 [`output/apple-ui-review`](../output/apple-ui-review/)。

本次原生 Release 构建通过，但视觉验收被模拟器服务阻塞：首次运行安装卡住；另一隔离实例出现 `launchd failed to respond`；再次重试完成安装后，`simctl launch` 超时，尚未得到新页面截图。已结束 UI 测试重试；清理请求也曾超时，最终确认本次隔离实例已关闭并删除。不能把此前版本的原生截图或本次构建成功算作当前普通字号/大字号的视觉通过；尤其 Dynamic Type、VoiceOver 完整走查仍待正常模拟器或签名设备验收。本次没有声明“全面符合 Apple 所有规范”或发布放行。


## 同日跟进：直接 API Key 与自动协议兼容

按用户要求，Web 与 Expo 的设置、首次配置均删除 OpenRouter 浏览器授权、一次性验证码与 Chat/Responses 选择器。OpenAI 预设合并成单个选项；连接表单顺序统一为 Provider → Endpoint → API key → Model → Load available models，仍支持手填模型和图片模型筛选。切换 provider 清除跨服务密钥，取消设置保留原值。

- shared core：文本、流式问答、VLM 与兼容 OCR 统一经过 Chat/Responses 自动请求层，仅在接口不存在/不支持时最多切换一次，并在内存中短暂记住 endpoint/model 对应接口。鉴权、余额、限流、未知模型、网络失败、取消及已经开始的输出流不重放请求。Responses 图片使用 `input_text` / `input_image`；推理 delta 不混入用户结果，失败/不完整状态明确报错。
- settings/import/export：保留已有 `apiFormat` 字段作内部偏好，默认和 `.ttconfig` 加密格式不变；旧 Chat、Responses、Anthropic 配置和密钥原样往返。CloudKit/SecureStore 不需要新增迁移。
- native：继续使用 React Native 安全输入、原生 sheet、系统键盘；本轮没有改原生模块、entitlement 或同步实现。
- 官方格式参考：[Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[Images and vision](https://developers.openai.com/api/docs/guides/images-vision)（本轮实际读取）。本次仅按产品要求取消 OAuth，不据此声称 OpenRouter 官方完全不支持 OAuth。

已通过 64 项 core 测试、core/mobile typecheck、461 项 parity audit、Web build、Expo web smoke（含直接 API key 保存重开、模型筛选、Chat → Responses 自动回退），以及 Chromium/Mobile Safari 的 24 项布局/行为检查；自动回退新增后又聚焦通过两浏览器的 OpenRouter 完整流程。核对 320/390 明暗主题连接表单截图，位于 `output/playwright/expo-connection-form-*.png`。iOS Release 构建与聚焦 simulator smoke 均通过：main 明暗首屏、settings、setup-manual。首次运行暴露冷启动基线截图过早、捕获系统桌面的问题；脚本已改为等待 main scene ack 后拍摄基线，并将基线与请求场景分别进行去重，复跑通过。最新原生截图已核对并存于 `output/api-connection-review/native/`。本轮恢复了普通字号的上述页面视觉验收；大字号与 VoiceOver 全量走查仍未覆盖。真实付费 provider 调用未执行。

## 同日跟进：设置页单层标签布局

按用户要求，设置分类从拥挤的分段按钮与 AI 内的二级切换，改为单层导航。共享 `settingsNavigation.ts` 统一 AI / Translate / Speech / Image / Offline / Data 的名称和顺序；Translation 初始跳转直接进入独立标签。

- Mobile：顶部文字标签横向滚动，选中项自动进入视野，48pt 最小触摸高度，支持系统字体缩放与减少动态效果；切换时收起键盘。分类与保存/取消不随表单滚动。保留原生 pageSheet、安全区、分组表单和系统开关，删除连接表单底部多余分隔线。
- Web：700px 以上采用侧边分类栏，手机采用与 Mobile 一致的文字标签；表单独立滚动、操作栏固定。移除标题装饰图标、嵌套连接卡片与 Data 入口的重复说明。标签增加 ARIA tab/panel 关联、选中状态、单点 Tab 焦点及方向键/Home/End 导航。
- Data：Web 将导入导出嵌入标签内容；离开标签会清理扫码摄像头，并阻止卸载后的相机异步任务继续导入。Native 保留 iCloud 与配置传输。浏览器的离线选项继续位于 Speech/Image；原生模型包管理单列 Offline，属于平台运行时差异。
- 草稿/配置：所有设置字段、默认值、provider 调用、SecureStore/CloudKit 和加密文件格式保持现有契约。切换分类保留未保存的设置；保存失败保留草稿。发现并修复 Web 历史配置 schema 漏掉 Jina 的问题，防止正确导出的 Jina 配置在导入校验时被拒绝。

最终验证：64 项 core 测试、core/Web/mobile TypeScript、472 项 parity audit、Web production build、Expo Web smoke 通过。Chromium / Mobile Safari 共 33 项浏览器检查通过，1 项 WebKit 模拟摄像头检查按设计跳过；Chromium 的合成摄像头用例验证离开 Data 后所有媒体轨道结束。新增回归覆盖键盘标签导航、草稿跨页与保存、独立滚动/固定操作栏、加密文件下载再导入并保留 Jina。第一次浏览器检查有两个 WebKit 启动超时，独立复跑通过，最终完整运行全部通过。

Expo Web 核对 320×720 / 390×844 明暗主题的 AI、Translate、Image、Data 页面；Web 同时检查 1440px 侧边导航。iPhone 16 / iOS 27 Release 构建、安装、启动和 `settings`、`settings-image`、`settings-config`、`settings-hunyuan-output` 四场景通过并核对画面。首次复用先前临时构建目录遇到写入权限错误，改用新的隔离构建目录后完成。本轮原生截图位于 [`output/settings-tabs-review/native`](../output/settings-tabs-review/native/)，[三页预览](../output/settings-tabs-review/native-settings-overview.png)。Hunyuan 场景中的诊断段落仅存在于测试预览。

边界：本轮没有执行付费真实 provider、真实相机 QR 解码、签名设备 CloudKit 或完整 VoiceOver/最大 Dynamic Type 验收；模拟器 iCloud 状态显示不可用，不视为同步验收成功。界面调整不等于 Apple 发布规范全量认证。

## 同日修正：iCloud 等系统开关偏上

用户指出原生开关错位。根因确认于 React Native 0.86 `Libraries/Components/Switch/Switch.js`：iOS 分支默认附加 `alignSelf: 'flex-start'`，覆盖 `toggleRow.alignItems: 'center'`。此前浏览器截图没有暴露这个原生默认样式差异。

在共用 `SettingToggle` 的系统 Switch 上明确应用 `alignSelf: 'center'`、`flexShrink: 0`。iCloud、Show thinking、本地语音开关及首次配置中的同类控件共同修正；保留系统固有尺寸，不设置人工位移或缩放。Web Radix 开关原本居中，未改；shared core、设置值、CloudKit 和存储行为均未改。

验证：64 项 core 测试、core/mobile TypeScript、473 项 parity audit、Web build、Expo smoke 通过。Expo 在 320/390 明暗主题检查 iCloud / Show thinking 开关与所在行的中心及边界，并验证 Show thinking 可反复切换。iPhone 16 / iOS 27 Release simulator 的 settings-config、settings-image 两场景通过；已查看修正后的原生截图，确认 iCloud 开关从顶部恢复到行中心。截图与[前后对比](../output/switch-alignment-review/icloud-before-after.png)位于 `output/switch-alignment-review/`。这是原生布局验收，不代表签名设备 CloudKit 或完整辅助功能验收。
