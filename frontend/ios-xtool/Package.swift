// swift-tools-version: 5.9
// The openGym iPhone shell as a SwiftPM package, for xtool (https://xtool.sh): the same web app
// (../dist) inside Capacitor's bridge, built, signed and installed from Linux, WSL or macOS
// without Xcode. The Xcode project in ../ios stays the canonical shell; this one reaches the
// plugins that ship as Swift packages (App, Filesystem, LocalNotifications, Share) plus the
// in-app print plugin. The two CocoaPods-only plugins (secure storage, MLKit barcode scanning)
// are not here, and the web app already falls back without them (docs/IOS_WITHOUT_XCODE.md).
//
// Build:  cd frontend && npm run build:ios-xtool && cd ios-xtool && xtool dev
import PackageDescription

let package = Package(
    name: "OpenGymShell",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "OpenGymShell", targets: ["OpenGymShell"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0"),
        // The plugins as npm installed them: the packages live at each module's root.
        .package(name: "CapacitorApp", path: "../node_modules/@capacitor/app"),
        .package(name: "CapacitorFilesystem", path: "../node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorLocalNotifications", path: "../node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorShare", path: "../node_modules/@capacitor/share"),
    ],
    targets: [
        .target(
            name: "OpenGymShell",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
            ]
        ),
    ]
)
