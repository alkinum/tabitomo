# Safe Area 修正与验收

用户指出此前原生截图的品牌行压到状态栏。此前仅验证组件存在和页面可渲染，没有正确验收顶部实际坐标；历史截图不能作为 Safe Area 已通过的证据。本文件记录此次修正后的证据。

## 实现

- Mobile：根 Provider 使用系统初始 metrics；共用 `SafeAreaLayout` 根据实时四边 inset 对普通 View 明确设置 padding。主页面、pageSheet 与全屏预览分别由各自的 Provider 负责，内容底部不重复叠加 Home Indicator 边距。Device QA 也复用同一弹层。
- 键盘：主页面保留 KeyboardAvoidingView。原生 sheet 使用 UIKit 屏幕坐标计算与键盘的交集，解决 Fabric 的 modal-local JS 坐标与屏幕键盘坐标混用导致保存按钮被遮挡的问题。键盘显示时不再额外添加 Home Indicator 的底部 inset。
- Native：新增本地 Expo 模块 `apps/mobile/modules/tabitomo-layout`，只在主线程把指定 View 的 bounds 转成屏幕坐标；不假设 iPhone/iPad 弹层固定偏移。Podfile.lock 已同步；需重新构建原生 App。Expo Go/Web 预览保留标准键盘避让 fallback，不作为原生坐标验收依据。
- Web：页面与固定弹窗统一读取 CSS safe-area env；设置、首次配置、导入导出、帮助、确认、图片预览、相机控制和通知均处理安全边距。固定遮罩仅淡入，避免整体位移动画在过渡中侵入安全区。图片预览的标题与图片各占布局空间。
- Shared core：本次安全区修正不改变 settings schema、provider 调用、模型选择、密钥、导入导出、持久化或 CloudKit 契约。

## 验证

- 72 项 core tests、core/Web/mobile TypeScript、511 项 parity audit、Web production build 和 Expo Web smoke 通过。
- Chromium/WebKit 共 36 项布局与交互检查通过。新增 320×720 / 390×844 四边安全区回归；浏览器硬件 inset 为 0，因此测试注入 CSS inset 输入，不将其描述为真实 iPhone Safari 测量。
- iPhone 16 / iOS 27.0 Release simulator：浅色与深色首页、主输入键盘、设置页、设置键盘、关闭设置返回首页、全屏图片预览完成原生坐标断言。主页面实测顶部 59pt、底部 34pt，内容顶部为 67pt（含 8pt 间距）；sheet 顶部 screen Y 为 59pt，自身 top inset 为 0，避免重复留白。
- 键盘修正后，sheet 内容底部 screen Y 为 511pt，键盘顶部为 523pt，保留 12pt 间隔。断言直接读取 UIKit 屏幕坐标；早期仅使用 `measureInWindow` 的 modal-local 断言已被替换。
- 新模拟器首次会显示 QuickPath 教学页。smoke 已增加首个键盘场景预热重开；最终另一次聚焦运行通过 `main-keyboard` / `settings-keyboard`，已逐张查看实际系统按键画面，首页 Translate 和设置 Save 均完整位于键盘上方。

截图与几何 JSON 保存在 [`output/safe-area-review`](../output/safe-area-review/)。本次证据限于上述模拟器、浏览器尺寸和主题；没有宣称完成真机、iPad、第三方键盘或完整辅助功能验收。
