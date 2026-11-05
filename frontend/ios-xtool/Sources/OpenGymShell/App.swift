// The whole native side of the xtool shell: one window with Capacitor's bridge view controller,
// which loads `public/index.html` from the app bundle with `capacitor.config.json` beside it
// (both copied in by xtool.yml `resources`), and forwards deep links to Capacitor.
//
// No storyboard, no scene manifest: xtool writes the Info.plist from Support/Info.plist and the
// window is made here. Everything the app does is the same React build the Xcode shell runs.
import UIKit
import Capacitor

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0x0c / 255, green: 0x0e / 255, blue: 0x12 / 255, alpha: 1)
        window.rootViewController = CAPBridgeViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    // Deep links and Universal Links reach the web app through Capacitor's App plugin.
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
