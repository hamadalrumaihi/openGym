# openGym on an iPhone without a Mac: xtool, cloud macOS, AltStore, the PWA

What this fork found when asked whether [xtool](https://xtool.sh) (the Linux/WSL "Xcode
replacement") can build, sign and install the Capacitor iOS app, what the alternatives cost, and
what to use day to day. Every claim below says how it was checked. Nothing here was run on a real
iPhone from this repository; the sections that need one say so.

## The short answer

| Goal | Use | Why |
|---|---|---|
| Train with openGym on the iPhone today, keep it updated, no Mac, no Apple fee | **The PWA** (Safari → Share → Add to Home Screen) | Already works, offline, web push on iOS 16.4+, updates on every deploy, no signing, no expiry. Every running feature, Garmin and Strava included, lives in the web app and the server. |
| A real app icon that installs from a file, without paying Apple | **Unsigned .ipa from GitHub Actions** (this PR) → sign and install with **Sideloadly** or **AltStore** on any Windows PC, or **SideStore** on the phone | The build is verified on GitHub's macOS runner. A free Apple ID signs it for 7 days at a time; it must be refreshed weekly from the same PC or from SideStore. |
| Over-the-air updates, 90-day builds, no PC in the loop | **Apple Developer Program ($99/year) + the TestFlight job** in the same workflow | Cloud signing through an App Store Connect API key, upload from the runner, install and update through the TestFlight app. Needs the membership and a one-time secrets setup. |
| Sign and install from your own Linux/WSL box, no Mac, no PC app | **xtool as the installer**: `xtool install openGym-<version>-unsigned.ipa` on the .ipa from GitHub Actions | What xtool verifiably does well today. A Capacitor user documented exactly this split (cloud Mac build, `xtool install` from WSL) in xtool issue #310. Free Apple ID, 7-day signing, phone on USB. |
| Build the shell itself on Linux/WSL with xtool | **The SwiftPM shell** in `frontend/ios-xtool` | Implemented and partly verified (manifest, dependency resolution and resource staging on Linux); the iOS compile is not, and the one published attempt to build a Capacitor app with xtool failed on Capacitor's binary xcframeworks (issue #310, xtool 1.21). Treat it as an experiment, not the path. |

Garmin and Strava need none of this: both integrations are on the server and in the web app
([docs/RUNNING.md](RUNNING.md)), so the PWA and every shell above get them for free. No native
Swift code is needed for them, and none was written.

## 1. What xtool is, checked against its source

xtool (`github.com/xtool-org/xtool`, cloned and read for this note) does three things:

1. **Builds a SwiftPM package into an iOS app.** `xtool dev` runs `swift package dump-package`,
   plans a bundle from the package's library product (`Sources/PackLib/Planner.swift`), builds it
   with the Darwin Swift SDK it generated from `Xcode.xip`, and packs it (`Packer.swift`): the
   binary, SwiftPM resource bundles, `binaryTarget` frameworks, an Info.plist it writes itself
   (merged with your `infoPath`), an icon, entitlements, and any files or folders listed under
   `resources:` in `xtool.yml`, copied to the root of the `.app`.
2. **Signs and installs.** `xtool setup` logs in to Apple Developer Services with either an App
   Store Connect API key (paid programme) or an Apple ID password (free; uses private Apple APIs,
   the docs suggest a throwaway Apple ID), creates the certificate and provisioning profile, and
   installs over USB through `usbmuxd`. On Windows it runs inside WSL with USB passthrough
   (`usbipd`) or an iTunes relay.
3. **Talks to Apple Developer Services** (`xtool ds`, `xtool auth`).

What it does **not** do, verified in the source and the issue tracker: it never reads an
`.xcodeproj` or `.xcworkspace` (issue #144 "Ability to build Xcode Projects" is open; the
maintainer called it planned on 10 Sep 2026 and "not yet" on 11 Oct 2026), and it has no
CocoaPods support (issue #364 states the mismatch for React Native). Its release notes say the
move to SwiftBuild in 1.20 "should resolve xcframework issues", which is a hope, not a
confirmation. Its `XcodeProjects` module is used the other
way round, to *generate* an Xcode project from the SwiftPM plan for people who do have Xcode
(`XcodePacker.swift`). `xtool.yml` (`PackSchema.swift`) knows `bundleID`/`orgID`, `product`,
`infoPath`, `entitlementsPath`, `iconPath`, `resources`, and `extensions`. Nothing else.

### Can it build `frontend/ios`?

**No.** The Capacitor shell is an Xcode workspace with a Podfile (`frontend/ios/App/Podfile`):
Capacitor, Cordova and the six plugins arrive as CocoaPods. xtool cannot consume either, and
`npx cap sync` runs `pod install`, which needs macOS. That is the whole answer for the existing
project; nothing short of a rewrite of its build makes xtool take it.

### Can it build a SwiftPM version of the same shell? Mostly, and it is in this PR

Capacitor 6+ also ships as Swift packages (`capacitor-swift-pm`, with the Capacitor and Cordova
runtimes as `Capacitor.xcframework` / `Cordova.xcframework` binary targets) and supports an SPM
mode in which native plugins are found by class name through `packageClassList` in
`capacitor.config.json` (`@capacitor/cli/dist/util/iosplugin.js`). Of openGym's six plugins:

| Plugin | Swift package? | In the xtool shell |
|---|---|---|
| `@capacitor/app`, `filesystem`, `local-notifications`, `share` | yes (`Package.swift` at the module root) | yes |
| in-app `PrintPlugin` (ios/App/App) | the Objective-C `CAP_PLUGIN` macro form | ported to `CAPBridgedPlugin` form in `ios-xtool/Sources` |
| `@aparajita/capacitor-secure-storage` | no, CocoaPods only | no; the app's own fallback keeps secrets in memory for the session (`lib/coach-secrets.js`) |
| `@capacitor-mlkit/barcode-scanning` | no, CocoaPods only, Google binary frameworks | no; the gym check-in QR import falls back to the web decoder (`lib/scan-web.js`), as in the browser |

So `frontend/ios-xtool` is a SwiftPM package with `xtool.yml`, one `App.swift` (a window with
`CAPBridgeViewController`, deep links forwarded through `ApplicationDelegateProxy`), the print
plugin, `Support/Info.plist` and the icon; `npm run build:ios-xtool` builds the web app for the
mobile shell and stages `Resources/public` (with `cordova.js` the way `cap copy` does) and
`Resources/capacitor.config.json` carrying the bundle id from `xtool.yml` and the
`packageClassList`.

**Verified on Linux (this environment, Swift 6.1.2):** `swift package dump-package` accepts the
manifest; `swift package resolve` resolves `capacitor-swift-pm` 7.6.10 (downloading both
xcframeworks) and `ion-ios-filesystem` 1.1.4, and the four plugin packages from `node_modules`.
`npm run build:ios-xtool` stages the resources.

**Not verified:** compiling for iOS and running on a phone. Both need the Darwin SDK that xtool
extracts from `Xcode.xip`, which Apple serves only after an Apple ID login in a browser, and the
phone on USB at the machine running xtool. **Known risk:** the one published attempt to build a
Capacitor app with xtool (issue #310, 10 Oct 2026, xtool 1.21.0, WSL2, SDK from Xcode 27.1)
failed twice: the SDK's `actool` is an arm64 Mach-O that cannot run on x86_64 Linux (the shell
avoids this by using a PNG icon and no asset catalogue), and SwiftPM then reported "There is no
XCFramework found" for the plugins' binary frameworks, which is the same `capacitor-swift-pm`
binary-target path this shell depends on. No maintainer has replied. If the first `xtool dev`
stops there, the shell is blocked until xtool's SwiftBuild path handles binary targets on
Linux; the reporter's working fallback was the cloud build plus `xtool install`, section 2.

### Prerequisites and procedure (from xtool's installation guide)

1. Linux, or Windows with WSL 2 and USB passthrough (`usbipd`, or the iTunes relay described in
   xtool issue #19), or macOS.
2. Swift 6.4 from swift.org; `usbmuxd` (`apt install usbmuxd libimobiledevice-utils`).
3. `Xcode.xip` (Xcode 27.1 at the time of writing) downloaded from
   <https://developer.apple.com/download/all/?q=Xcode> after logging in with an Apple ID and
   accepting Apple's licence. The SDK xtool generates from it is about 3 GB (`--slim`) to 7 GB.
   `xtool setup` installs it; `swift sdk list` then shows `darwin`. A prebuilt image exists
   (`ghcr.io/xtool-org/xtool:<version>`, since 1.18.1) but still needs your `Xcode.xip`.
4. `xtool.AppImage` from the GitHub releases, on your `PATH` as `xtool`.
5. `xtool setup`: login mode **Password** (any Apple ID, 2FA prompt, private APIs) or **API
   Key** (paid programme, App Store Connect team key with the App Manager role); then the path to
   `Xcode.xip`.
6. Phone: Settings → Privacy & Security → **Developer Mode** on (iOS 16+), trust the computer.
7. Build and run: `cd frontend && npm run build:ios-xtool && cd ios-xtool && xtool dev`. Change
   `bundleID` in `xtool.yml` first: an App ID is unique across all Apple teams, so the Xcode
   shell's `ch.duartesantos.opengym` cannot be registered again by your team (with a free
   account xtool also prefixes the id, because free accounts cannot share bundle ids).
8. Or skip the build: `xtool install openGym-<version>-unsigned.ipa` with the artifact from the
   GitHub Actions run (section 2) signs it with your Apple ID and installs it. On iOS 17 and
   later `xtool launch` does not work (issue #44, the new RemoteXPC debug protocol); tap the icon.

Apple's limits for a free Apple ID, from Apple's developer-account help: up to 10 App IDs and
3 devices, each expiring after 7 days, and 3 apps installed per device; provisioning profiles
expire 7 days from issuance, after which the app must be rebuilt or reinstalled. xtool keeps
the Apple session token (never the password) and the team id in `~/.config/xtool`.

Updates: run the same two commands again; `xtool dev` reinstalls over the previous build and
keeps the app's data (same bundle id, same team). Free Apple ID signing expires after seven
days, after which the app refuses to open until it is reinstalled from the same machine; a paid
membership gives a year.

Licensing note for the reader to weigh. Apple's "Xcode and Apple SDKs Agreement"
(apple.com/legal/sla/docs/xcode.pdf) says the software "is authorized only for execution on an
Apple-branded product running macOS", that "You are expressly prohibited from separately using
the Apple SDKs or attempting to run any part of the Apple Software on non-Apple-branded
hardware" (§2.5), and "You agree not to, install, use or run the Apple Software or Apple
Services on any non-Apple-branded computer or device" (§2.7). xtool's position (its author on
the Swift Forums) is that it ships no Apple code and asks you to download and accept the
agreement yourself. This fork makes no claim about how that applies to building on Linux; it
is a reason to prefer the GitHub Actions path, which runs on Apple hardware, for anything you
build and keep.

## 2. The cloud macOS path, verified on this pull request

`.github/workflows/ios.yml` runs on `macos-15`:

- **`unsigned`**: `npm ci`, `npm run build:mobile` (which runs `cap sync` and `pod install`),
  `xcodebuild archive` with signing disabled, zipped as `openGym-<version>-unsigned.ipa` with a
  SHA-256, kept as an artifact for 30 days. The same recipe as the GitLab `build:ios` job, which
  needs a self-registered Mac runner; this one needs nothing. It runs on version tags, by hand,
  and on pull requests that touch the shells. **Verified:** the first run on PR #5 built
  `openGym-1.4.1-unsigned.ipa` (208 MB with the exercise media) in under four minutes on
  `macos-15` (run 41988732911, artifact `openGym-ios-unsigned`).
- **`testflight`**: only when the repository variable `IOS_TESTFLIGHT` is `true` and the four
  secrets exist: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` (the `.p8`, base64) and
  `APPLE_TEAM_ID`. It archives with `-allowProvisioningUpdates` and the API key, so Xcode's
  cloud signing creates the certificate and profile and nothing is ever exported from a Mac,
  then `xcodebuild -exportArchive` with `destination: upload` sends the build to App Store
  Connect. Install and every later update come through the TestFlight app. **Not verified:**
  needs the paid membership and an app record created once in App Store Connect under the
  shell's bundle id. The job is written from Apple's documented `xcodebuild` options.

GitHub's macOS minutes are free for a public repository, as this one is (GitHub's billing
page: standard hosted runners are free in public repositories; otherwise macOS is billed at
about ten times the Linux rate). Codemagic gives personal accounts 500 free macOS minutes a
month and Bitrise a free hobby tier, if the repository ever goes private.

Installing the artifact without a Mac: download the zip from the run, unzip the `.ipa`, then
either `xtool install` it from Linux/WSL (section 1, step 8), or Sideloadly / AltStore on a
Windows PC, or SideStore on the phone (section 3).

## 3. The alternatives, side by side

| | What you need | Validity | Updates | Watch out for |
|---|---|---|---|---|
| **PWA** | Safari (iOS 16.4+ for web push, per WebKit's announcement) | no expiry | automatic on each deploy | no native plugins (print, secure storage, local notifications; web push instead); iOS evicts storage of rarely used web apps, which is why the server sync exists |
| **Sideloadly** (Windows 7+/macOS app) | a PC with the non-Store iTunes, the unsigned `.ipa`, a free Apple ID | 7 days (free, with an auto-re-sign daemon) / 1 year (paid) | re-sideload; Wi-Fi after one USB setup | the PC must be on each week |
| **AltStore Classic** (AltServer on Windows/macOS) | a PC on the same Wi-Fi, free Apple ID | "apps installed with AltStore expire after 7 days", refreshed while the PC is reachable | AltStore refreshes in the background | "only 3 sideloaded apps installed at a time"; AltStore PAL (no expiry, no limit) is EU, Japan and Brazil only |
| **SideStore** (AltStore fork, no PC after setup) | one computer once, then its VPN profile (StikDebug on iOS 17.4+) | 7 days, refreshed from the phone | from the phone | 3 apps including itself, 10 App IDs a week; community reports iOS 26.4 broke the refresh in March 2026 |
| **xtool as installer** | Linux/WSL box with the phone on USB, Swift, the `.ipa` from GitHub Actions | 7 days (free) / 1 year (paid) | `xtool install` again | needs `Xcode.xip` only for building, not for installing; `xtool launch` is broken on iOS 17+ |
| **xtool building the SPM shell** | the above plus `Xcode.xip` and the 3-7 GB SDK | same | `xtool dev` again | drops two CocoaPods-only plugins; blocked if the Capacitor xcframeworks fail on Linux as in issue #310 |
| **GitHub Actions + TestFlight** | $99/year, API key secrets | 90 days per build | TestFlight app, over the air | needs an App Store Connect app record; builds expire, so release at least quarterly |

What needs Apple credentials, and which: a free Apple ID for xtool (password mode), Sideloadly,
AltStore and SideStore; the paid Apple Developer Program for xtool in API-key mode, for
TestFlight, and for anything that lasts longer than a week.

## 4. Where Swift earns its place, and where it does not

Capacitor already bridges the web app to the native features openGym uses (file persistence,
local notifications, share sheet, the print sheet, secure storage, the QR camera). The running
side, Garmin and Strava were built in JavaScript and on the server on purpose: they work in the
PWA, in the Xcode shell, in the xtool shell and in the Android app at once, and a native
rewrite would buy nothing for them. The two places native Swift would be a genuine benefit are:

- a HealthKit bridge, so runs recorded by the Forerunner (which reach Apple Health through
  Garmin Connect) could be read without any account, and workouts written to Health; that is
  a Capacitor plugin (`@capacitor-community/health` or a 150-line plugin of our own), not a
  rewrite, and it is only reachable through a signed app with the HealthKit entitlement;
- a Watch or Live Activity surface, which is Swift/SwiftUI by nature and out of scope here.

`frontend/ios-xtool` is the place to add such a plugin as a Swift package target when the time
comes; it stays usable from the Xcode shell too, because Capacitor's SPM plugins work in both.

## 5. Status of each piece

| Piece | State |
|---|---|
| Investigation of xtool against this repository | done, from its source |
| GitHub Actions unsigned build | implemented, verified on PR #5 |
| GitHub Actions TestFlight job | implemented from Apple's documented options, needs the membership to run |
| xtool as the installer for the Actions artifact | documented from xtool's docs and a user's report (issue #310); not run from this repository |
| xtool SwiftPM shell | implemented; manifest, dependency resolution and resource staging verified on Linux; iOS compile and device install not verified, and at risk from the xcframework failure in issue #310 |
| Sideloadly / AltStore / SideStore | documented from their own documentation; nothing to implement |
| The PWA | unchanged, recommended |
