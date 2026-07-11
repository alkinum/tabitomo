# tabitomo iOS EAS 发布路径

状态：EAS scaffold 已建立，等待 EAS CLI 登录、Apple Developer/App Store Connect 账号确认和签名真机 QA
配置文件：`eas.json`
忽略规则：`.easignore`

## 目的

这个路径用于把 Expo iOS app 从本地 parity 实现推进到可安装的签名构建、内部测试和最终 TestFlight/App Store 交付。

当前仓库同时保留两条 iOS 交付路径：

- 本地 Xcode：已有 `apps/mobile/ios/tabitomo.xcworkspace`，适合本机 archive、调试签名和快速真机安装。
- EAS：新增 `eas.json`，适合团队共享构建、内部分发、生产构建和后续 submit。

`TABITOMO_IOS_RELEASE_PATH` 最终只能在 release-candidate 证据中选一个 canonical path：`local-xcode` 或 `eas`。

## EAS Profiles

`eas.json` 当前定义：

- `development`：dev-client 内部分发构建。
- `development-simulator`：继承 `development`，生成 iOS Simulator 构建。
- `preview`：Release 内部分发构建，用于签名真机 Device QA 或团队验收。
- `preview-simulator`：继承 `preview`，生成 Release simulator 构建。
- `production`：生产构建，开启 native build number auto-increment。
- `submit.production.ios`：iOS submit profile 占位，不写入账号级 ID。

账号级信息不写入仓库：

- Apple Team ID
- App Store Connect App ID
- ASC API key
- provisioning/certificate secrets
- Expo account token

这些值应由 EAS 交互式 credential flow、EAS secret 或 CI secret 注入。

## 常用命令

先跑本地 gate：

```bash
pnpm test:core
pnpm --dir apps/mobile typecheck
pnpm test:mobile:parity-audit
pnpm test:mobile:release-readiness
pnpm test:mobile:web-smoke
pnpm test:mobile:ios-smoke
```

开发 simulator build：

```bash
eas build --platform ios --profile development-simulator
```

内部真机 build：

```bash
eas build --platform ios --profile preview
```

生产 build：

```bash
eas build --platform ios --profile production
```

提交到 App Store Connect：

```bash
eas submit --platform ios --profile production
```

生成 release evidence：

```bash
TABITOMO_IOS_RELEASE_PATH=eas \
TABITOMO_PROVIDER_SMOKE_REQUIRED=all \
pnpm test:mobile:release-evidence -- \
  --strict \
  --device-report /path/to/tabitomo-ios-device-qa-report.json \
  --out output/tabitomo-ios-release-evidence.json
```

## 放行规则

EAS 构建成功不等于 Expo parity 完成。

release-candidate 必须同时满足：

- `pnpm test:mobile:release-readiness` 通过。
- `pnpm test:mobile:parity-audit` 通过。
- `TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke` 用真实 provider credentials 通过。
- EAS `preview` 或 `production` 构建安装到真实 iPhone。
- 真机打开 `tabitomo://smoke?scene=device-qa`，运行所有 Device QA checks，导出脱敏 JSON。
- `pnpm test:mobile:device-qa-report /path/to/report.json` 通过。
- `pnpm test:mobile:release-evidence -- --strict --device-report /path/to/report.json` 通过。

在这些证据齐备前，EAS 只证明发布路径已配置，不证明功能/UI 已完全对齐 Web。
