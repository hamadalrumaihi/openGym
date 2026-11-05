// The in-app print plugin (ios/App/App/PrintPlugin.swift) in Swift-package form: the Objective-C
// CAP_PLUGIN macro of the Xcode shell becomes CAPBridgedPlugin's method list, and the class is
// found by name through `packageClassList` in capacitor.config.json (scripts/ios-xtool-prepare.mjs).
// Same JS contract: registerPlugin('Print').printHtml({ html, name }).
import Foundation
import Capacitor
import UIKit

@objc(PrintPlugin)
public final class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printHtml", returnType: CAPPluginReturnPromise),
    ]

    @objc func printHtml(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("html is required")
            return
        }
        let jobName = call.getString("name") ?? "openGym"
        DispatchQueue.main.async {
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = jobName
            controller.printInfo = info
            // The document carries its own @page margins; keep the formatter's insets at 0.
            let formatter = UIMarkupTextPrintFormatter(markupText: html)
            formatter.perPageContentInsets = .zero
            controller.printFormatter = formatter
            controller.present(animated: true) { _, completed, error in
                if let error { call.reject(error.localizedDescription) } else { call.resolve(["completed": completed]) }
            }
        }
    }
}
