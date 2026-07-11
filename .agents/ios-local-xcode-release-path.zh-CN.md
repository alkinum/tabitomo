# tabitomo iOS 本地 Xcode 发布路径

状态：首个 RC canonical path 默认采用本地 Xcode；原生工程已纳入源码管理并启用 Xcode Managed Signing；本机仍需登录 Apple Developer 账号，然后执行真实 iPhone QA
脚本：`pnpm test:mobile:ios-xcode-preflight`
Workspace：`apps/mobile/ios/tabitomo.xcworkspace`

## 目的

这个路径用于在本机用 Xcode workspace 构建、签名、安装和 archive Expo iOS app。它适合：

- 快速验证 prebuilt native project 没有和 `app.json` 漂移。
- 在真实 iPhone 上安装本地签名 build 做 Device QA。
- 在不使用 EAS 的情况下走 Xcode Organizer / Transporter / App Store Connect 交付。

当前决策：首个 RC 默认走 `local-xcode`。`pnpm test:mobile:release-evidence` 在未设置 `TABITOMO_IOS_RELEASE_PATH`、本机 Xcode 可用且 EAS CLI 不可用时，会记录 `releasePath.selected=local-xcode` 和 `releasePath.selectionSource=default-local-xcode`。RC/CI 环境仍建议显式设置 `TABITOMO_IOS_RELEASE_PATH=local-xcode`。

## 工程与签名的 source of truth

- `apps/mobile/app.json` 保存 bundle id、build number、CloudKit entitlements 和默认 Apple Team `PB8H83VL3Z`。
- `apps/mobile/plugins/withXcodeManagedSigning.js` 在每次 Expo prebuild 后为 signable target 写入 `CODE_SIGN_STYLE=Automatic`、Team ID、空 profile specifier 和 Automatic provisioning。
- `apps/mobile/ios/tabitomo.xcodeproj`、shared scheme、workspace、Podfile 和 Podfile.lock 纳入源码管理；Pods、build、xcuserdata、证书、profile 和私钥继续忽略。
- 不要手工固定证书或 provisioning profile。账号、managed certificate 和 profile 由 Xcode > Settings > Accounts 与 Signing & Capabilities 管理。
- 原生项目需要刷新时运行 `pnpm ios:sync-project`。该命令执行 Expo prebuild、恢复 App Store export options 并运行 `pod install`。

## Preflight 覆盖

`pnpm test:mobile:ios-xcode-preflight` 会检查：

- `apps/mobile/ios/tabitomo.xcworkspace` 存在。
- `xcodebuild`、`xcrun` 和 iOS SDK 可用。
- workspace 暴露 `tabitomo` scheme。
- Release/iphoneos build settings 可读取。
- `PRODUCT_BUNDLE_IDENTIFIER` 为 `com.backrunner.tabitomo`。
- `IPHONEOS_DEPLOYMENT_TARGET` 为 `16.4`。
- `MARKETING_VERSION` 与 Expo version 一致。
- `CURRENT_PROJECT_VERSION` 与 Expo iOS buildNumber 一致。
- `SDKROOT` 指向 iPhoneOS SDK。
- `PRODUCT_NAME`、Info.plist display name、Info.plist version/build、App Store encryption flag 与 release 配置一致。
- Xcode target 和 Expo 源配置都使用 Team `PB8H83VL3Z`、Automatic signing，且没有固定 provisioning profile。

## 常用命令

本地 preflight：

```bash
pnpm test:mobile:ios-xcode-preflight
```

刷新 Xcode project、workspace 和 Pods：

```bash
pnpm ios:sync-project
```

打开正确的 CocoaPods workspace：

```bash
pnpm ios:open
```

把 build number 同步到 `app.json` 和 Xcode project：

```bash
pnpm ios:set-build-number 2
```

使用 Xcode-managed signing 创建 archive：

```bash
pnpm ios:archive --build-number 2
```

直接 archive 并上传到 App Store Connect/TestFlight：

```bash
pnpm ios:upload-testflight --build-number 2
```

archive/upload 默认传 `-allowProvisioningUpdates`，让已登录的 Xcode 账号创建或下载 managed signing assets。需要其他 Team 时传 `--team-id YOUR_TEAM_ID` 或设置 `TABITOMO_DEVELOPMENT_TEAM`。CI 的 `-authenticationKeyPath`、`-authenticationKeyID`、`-authenticationKeyIssuerID` 可放在脚本参数 `--` 之后；`.p8`、`.p12`、`.mobileprovision` 和任何 Apple 凭据不得提交。

当前机器执行 `pnpm ios:archive --build-number 1` 已进入 Xcode provisioning 阶段，但因 Xcode > Settings > Accounts 尚未登录可访问 `PB8H83VL3Z` 的 Apple Developer 账号而停止，并明确报告 `No Accounts`。登录账号并确认 Apple Developer 后台已有 `com.backrunner.tabitomo` App ID 与 CloudKit capability 后，直接重跑同一命令即可；不需要修改或提交证书/profile。

也可以在 Xcode 中选择 `tabitomo` scheme、`Any iOS Device`，检查 Signing & Capabilities 后执行 Product > Archive，并通过 Organizer 上传。

生成 release evidence：

```bash
TABITOMO_IOS_RELEASE_PATH=local-xcode \
TABITOMO_PROVIDER_SMOKE_REQUIRED=all \
pnpm test:mobile:release-evidence -- \
  --strict \
  --device-report /path/to/tabitomo-ios-device-qa-report.json \
  --out output/tabitomo-ios-release-evidence.json
```

## 放行规则

本地 Xcode preflight 通过不等于 Expo parity 完成。

release-candidate 还必须满足：

- 使用真实 provider credentials 跑完 `TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke`。
- 用签名构建安装到真实 iPhone。
- 真机执行 `.agents/ios-real-device-qa.md` 并导出脱敏报告。
- `pnpm test:mobile:device-qa-report /path/to/report.json` 通过。
- `pnpm test:mobile:release-evidence -- --strict --device-report /path/to/report.json` 通过。

当前本机 preflight 已能证明 Release build settings、Automatic signing 和 Expo 配置对齐；Apple Developer/App Store Connect 后台仍需存在 `com.backrunner.tabitomo` App ID、`iCloud.com.backrunner.tabitomo` CloudKit container 和对应 App Store Connect app record。真机安装、SecureStore kill/relaunch 和真实 provider/device flows 仍是最终放行门槛。
