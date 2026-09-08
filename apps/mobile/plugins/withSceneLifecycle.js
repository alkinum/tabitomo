const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// UIKit requires scene lifecycle adoption for applications linked with the iOS 27 SDK.
// Keep the adapter in AppDelegate.swift so prebuild does not need a new Xcode source entry.
const sceneDelegate = `

@objc(TabitomoSceneDelegate)
class TabitomoSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    var launchOptions = appDelegate.reactLaunchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = ["UIApplicationLaunchOptionsUserActivityKey": activity]
    }
    appDelegate.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = delegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = delegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'TabitomoSceneDelegate',
        }],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes('class TabitomoSceneDelegate:')) return mod;
    const legacyStart = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?launchOptions: launchOptions\)\s+#endif/;
    if (!legacyStart.test(source)) throw new Error('Scene lifecycle plugin: Expo AppDelegate startup changed; review native window initialization.');
    source = source.replace('var window: UIWindow?', 'var window: UIWindow?\n  var reactLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?');
    source = source.replace(legacyStart, '    reactLaunchOptions = launchOptions');
    mod.modResults.contents = source + sceneDelegate;
    return mod;
  });
};
