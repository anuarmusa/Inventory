# Which phone-app technology suits offline use, barcode scanning and notifications?

Research for issue #3. It feeds the decision ticket "Choose the tech stack" (#8). Researched 2026-11-17 against official docs and first-party package pages. Every claim cites its source. Where I could not confirm something from a primary source, the text says so.

**Constraints from the brief:** one household, Android and iPhone, home server reachable only on the LAN, the app works offline for hours and syncs on return, camera EAN/UPC and QR scanning, notifications for low stock and near expiry scheduled on the phone, Android APK side-loaded from a page on the home server (no Play Store), a single maintainer who prefers TypeScript, and a Windows dev PC.

Candidates: **React Native with Expo**, **Capacitor (with or without Ionic UI)**, a **pure PWA**, and **Flutter** as a non-TypeScript baseline.

---

## 1. React Native with Expo (TypeScript)

**Offline database.** `expo-sqlite` gives a persistent SQLite database on Android, iOS and web, with sync and async APIs. Drizzle ORM and Knex integrations are documented. Optional SQLCipher encryption is available on native, but not in Expo Go. There is no built-in server sync service. The low-level building blocks are the SQLite session extension (`createChangesetAsync` / `applyChangesetAsync`) and change listeners. [expo-sqlite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)

**Barcode/QR.** `expo-camera` detects barcodes in the live preview (`barcodeScannerSettings`, `onBarcodeScanned`). The supported types include `ean13`, `ean8`, `upc_a`, `upc_e` and `qr`. One iOS caveat applies only to scanning from an image URL (`scanFromURLAsync`), which is QR-only on iOS. The optional system scanner UI (`launchScanner`) needs iOS 16+. [expo-camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)

**Local notifications.** `expo-notifications` schedules local notifications with no push server. The triggers are time-interval, date, daily and monthly on both platforms, plus weekly and yearly on Android and calendar on iOS. Android 8+ needs a notification channel. On Android 13 the permission prompt only appears after a channel exists. Exact timing on Android 12+ needs `SCHEDULE_EXACT_ALARM`; without it, notifications arrive "at an approximate time". `RECEIVE_BOOT_COMPLETED` is added automatically so notifications survive a reboot. Local notifications also work in Expo Go. [expo-notifications docs](https://docs.expo.dev/versions/latest/sdk/notifications/)

**Signed APK on Windows, no Play Store, no paid cloud.**
- `eas build --local` (EAS's build steps on your own machine) **does not support Windows**. Only macOS and Linux are supported, and WSL "is not officially tested". [EAS local builds](https://docs.expo.dev/build-reference/local-builds/)
- Bypassing EAS works on Windows. Run `npx expo prebuild` to generate the `android/` project, then use plain Gradle. React Native officially supports Android development on Windows (JDK 17 recommended, Android Studio, Node ≥ 22.11) but not iOS ("A Mac is required to build projects with native code for iOS"). [RN environment setup, Windows](https://reactnative.dev/docs/set-up-your-environment?os=windows&platform=android)
- Expo documents creating an upload keystore with `keytool`, wiring it into `android/app/build.gradle` `signingConfigs.release`, and building with Gradle. That guide shows `bundleRelease`, which produces an AAB. [Expo local production builds](https://docs.expo.dev/guides/local-app-production/) Expo's APK guide lists `:app:assembleRelease` as a Gradle command that produces an APK. [Build APKs](https://docs.expo.dev/build-reference/apk/) `npx expo run:android --variant release` builds a release variant locally, but that build is unsigned. [Local app development](https://docs.expo.dev/guides/local-app-development/)
- EAS cloud can also produce APKs (`android.buildType: "apk"`, or `distribution: "internal"`). [Build APKs](https://docs.expo.dev/build-reference/apk/) The free plan allows "Up to 15 Android and 15 iOS builds" in a low-priority queue, with waits that can exceed 90 minutes at peak. Starter costs $19/month. [Expo pricing](https://expo.dev/pricing) The pricing page does not say whether the 15 builds reset monthly.

**iOS build.** iOS builds on EAS run "on macOS runners hosted in Expo's macOS cloud", and EAS can generate and manage iOS provisioning profiles. [EAS Build intro](https://docs.expo.dev/build/introduction/) **This is the only option here that builds an iOS binary without owning a Mac.** It is covered by the free tier quoted above. Device or store builds still need Apple credentials. EAS states that "Apple Developer Program membership is required to build for the Apple App Store" ($99/yr). [EAS setup](https://docs.expo.dev/build/setup/), [Apple Developer Program](https://developer.apple.com/programs/) Ad hoc internal distribution "requires a paid Apple Developer account", needs each device's UDID registered, and is capped at 100 iPhones per year. [Internal distribution](https://docs.expo.dev/build/internal-distribution/) A local iOS build without EAS needs Xcode. [Local app development](https://docs.expo.dev/guides/local-app-development/)

**Maintenance.** Expo's first-party modules cover all three device features (camera/barcode, notifications, SQLite), so one vendor's SDK release cadence governs them. Expo Go is described as "a limited playground", and real apps use development builds. [Expo workflow overview](https://docs.expo.dev/workflow/overview/) I did not research SDK upgrade cadence.

---

## 2. Capacitor (optionally with Ionic UI) (TypeScript)

**Offline database.** `@capacitor-community/sqlite` supports iOS, Android, Electron and Web. On web, it emulates SQLite with `jeep-sqlite`/`sql.js` stored in IndexedDB. Native builds can encrypt with SQLCipher; web cannot. It is community-maintained, now by Robin Genz (Capawesome). [capacitor-community/sqlite README](https://github.com/capacitor-community/sqlite)

**Barcode/QR.** There are two options.
- The official `@capacitor/barcode-scanner` wraps OutSystems barcode libraries. Android uses ZXing or ML Kit (minSdk 26) and iOS uses Apple Vision. Formats include EAN-13/8, UPC-A/E and QR. Note: "Apple Vision doesn't distinguish UPC_A from EAN_13". [Capacitor barcode-scanner](https://capacitorjs.com/docs/apis/barcode-scanner)
- Capawesome's ML Kit plugin supports 13 formats on Android and iOS, including EAN-8/13, UPC-A/E and QR. It needs iOS ≥ 15.5 and is CocoaPods-only. Its 8.x line supports Capacitor 8. [Capawesome ML Kit barcode scanning](https://capawesome.io/plugins/mlkit/barcode-scanning/)

**Local notifications.** The official `@capacitor/local-notifications` schedules with `at`, `on` (cron-like) or `every`. On Android 12+ it needs `SCHEDULE_EXACT_ALARM` for exact timing and falls back to inexact if the user declines. With `allowWhileIdle`, notifications can fire during Doze, at most once per 9 minutes per app. [Capacitor local notifications](https://capacitorjs.com/docs/apis/local-notifications)

**Signed APK on Windows.** Android needs Android Studio ≥ 2025.2.1, SDK API 24+ and Node 22+. Android Studio supplies the JDK. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) `npx cap build android` takes `--keystorepath`, `--keystorealias`, the keystore passwords and `--androidreleasetype APK|AAB`, and "builds a signed AAB, APK, or IPA". [cap build](https://capacitorjs.com/docs/cli/commands/build) No cloud service is involved.

**iOS build.** "To build iOS apps, you will need macOS". Capacitor 8 requires Xcode 26.0+. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) Ionic's own cloud build service, Appflow, has "discontinued new customer sales", and existing users keep access only "through December 31, 2027". Ionic Framework and Capacitor "will remain free and open source". [Ionic announcement](https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products) So iOS with Capacitor means either owning a Mac or using a third-party macOS CI. I did not research the cost of such a CI.

**Maintenance.** The app is a web app (any TS framework) inside a native shell. SQLite and the ML Kit scanner come from community/Capawesome plugins rather than one first-party SDK. The UI code can also run as a plain web page, which matters if the server-hosted download page or a browser fallback ever wants the same UI.

---

## 3. Pure PWA (TypeScript)

**Offline database.** IndexedDB (or SQLite-in-WASM) behind a service worker that caches the app ("Cache on install, for the static UI and behavior"). [web.dev offline cookbook](https://web.dev/articles/offline-cookbook) On Safari/iOS, storage is "best-effort" by default and can be evicted under storage pressure or after a period without user interaction. `navigator.storage.persist()` is granted by heuristics, and being a Home Screen web app is one factor, but **WebKit does not guarantee persistence**. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) Unsynced offline edits could therefore be lost on iPhone.

**Secure context required.** Service workers only register in secure contexts. `http://` on a LAN IP is not one; only HTTPS, `localhost` and loopback addresses are. [MDN Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) The home server would need HTTPS with a certificate each phone trusts.

**Barcode/QR.** The native `BarcodeDetector` API is in Chrome Android since 83. In Safari 17 it sits behind a "Shape Detection API" flag, iOS mirrors Safari, and Firefox does not have it. [MDN browser-compat-data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json), [MDN Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) An iPhone PWA would need a JS/WASM decoder (e.g. ZXing). Libraries like this exist; for example, mobile_scanner's web backend uses zxing-wasm. [mobile_scanner](https://pub.dev/packages/mobile_scanner)

**Local notifications: the blocker.** The web had a proposal for scheduled local notifications, the Notification Triggers API, but "development … has ended". [Chrome Notification Triggers](https://developer.chrome.com/docs/web-platform/notification-triggers) What remains is Web Push. On iOS it needs a Home Screen web app on iOS 16.4+, and it is delivered through the Apple Push Notification service. [WebKit: Web Push on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) A LAN-only server that the phone cannot reach while away can't push, so **a PWA cannot reliably raise a near-expiry alert while the phone is away from home**. (The phone itself can still show a notification while the app is open.)

**APK / iOS build.** No build toolchain or Mac is needed, and installation is "Add to Home Screen". There is no APK. Wrapping the PWA as an Android package (for example as a Trusted Web Activity) is possible but out of scope and not researched.

---

## 4. Flutter (Dart, the non-TS baseline)

**Offline database.** `drift` is a reactive persistence library "built on top of SQLite" that runs on Android, iOS, desktop and web. [drift](https://pub.dev/packages/drift)

**Barcode/QR.** `mobile_scanner` uses CameraX/ML Kit on Android and AVFoundation/Apple Vision on iOS, with EAN-8/13, UPC-A/E and QR. [mobile_scanner](https://pub.dev/packages/mobile_scanner)

**Local notifications.** `flutter_local_notifications` provides `zonedSchedule`. Exact alarms on Android need the exact-alarm permission. Rescheduling after a reboot needs `RECEIVE_BOOT_COMPLETED` plus a boot receiver. The plugin also documents the iOS 64-pending limit (see Cross-cutting). [flutter_local_notifications](https://pub.dev/packages/flutter_local_notifications)

**Signed APK on Windows.** Flutter documents the whole keystore setup with Windows PowerShell commands, then `flutter build apk --split-per-abi`. [Flutter Android deployment](https://docs.flutter.dev/deployment/android)

**iOS build.** "You must use a device running macOS". `flutter build ipa` needs Xcode, and App Store or TestFlight needs the Apple Developer Program. [Flutter iOS deployment](https://docs.flutter.dev/deployment/ios)

**Maintenance.** Flutter needs a second language (Dart). That rules out sharing TypeScript types and validation with a TS server, which is the brief's stated preference.

---

## Cross-cutting facts that affect any native choice

- **iOS caps pending local notifications at 64.** Apple's `UILocalNotification` documentation says "the system keeps the soonest-firing 64 notifications … and discards the rest". [Apple UILocalNotification](https://developer.apple.com/documentation/uikit/uilocalnotification) Per Apple's developer forums, the same cap holds for `UNNotificationRequest`. [Apple Developer Forums](https://developer.apple.com/forums/thread/811171) A per-item expiry notification design can exceed this, while a daily digest notification does not.
- **Android exact alarms.** `SCHEDULE_EXACT_ALARM` "is not pre-granted to fresh installs of apps targeting Android 13" and can be revoked by the user. Inexact alarms (`set()`, `setAndAllowWhileIdle()`) fire "within one hour of the supplied trigger time" on Android 12+, which is enough for stock and expiry reminders. By default, all alarms are cancelled on reboot unless they are re-registered on `BOOT_COMPLETED`. [Android: schedule alarms](https://developer.android.com/develop/background-work/services/alarms/schedule)
- **Apple free account.** Without the paid program, Xcode on-device installs expire after 7 days, with 3 devices and 3 apps per device, and need a Mac running Xcode. [Apple: compare memberships](https://developer.apple.com/support/compare-memberships/)

## Interaction with the iPhone delivery route (being researched separately)

- **Ad hoc or TestFlight** needs the $99/yr Apple Developer Program ([Apple](https://developer.apple.com/programs/), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)). It also needs either a Mac (Capacitor, Flutter, bare React Native) or EAS cloud (Expo, with no Mac needed).
- **Free 7-day Xcode signing** needs a Mac, which makes it a non-starter on a Windows-only setup whatever the framework.
- **A PWA on iPhone** avoids Apple fees and the Mac. It costs reliable offline scheduled notifications, native barcode detection and guaranteed storage persistence, and it needs trusted HTTPS on the LAN.
- **Hybrid option:** Capacitor (and, with extra web config, Expo via `expo-sqlite` web) can serve the same TS code as a native Android APK and as a web app. That leaves an iPhone PWA fallback open if the delivery research rules out paid Apple distribution.

## Comparison table

| | Expo (RN) | Capacitor | PWA | Flutter |
|---|---|---|---|---|
| Language | TypeScript | TypeScript (any web framework) | TypeScript | Dart |
| Offline DB | `expo-sqlite` (first-party), Drizzle | `@capacitor-community/sqlite` (community) | IndexedDB / WASM SQLite; iOS eviction possible | `drift` |
| EAN/UPC/QR scan | `expo-camera` (first-party) | Official plugin or Capawesome ML Kit | Chrome Android native; iOS needs JS/WASM decoder | `mobile_scanner` |
| Scheduled local notifications | Yes (`expo-notifications`) | Yes (official plugin) | **No** (Triggers API ended; Web Push needs reachable server + APNs) | Yes (`flutter_local_notifications`) |
| Signed APK on Windows, no cloud | Yes via `prebuild` + Gradle; **`eas build --local` unsupported on Windows** | Yes (`npx cap build android`) | N/A (no APK) | Yes (`flutter build apk`) |
| iOS build without a Mac | **Yes, EAS cloud** (free tier 15 iOS builds, low priority) | No (Mac; Appflow ends 2027) | Yes (no build) | No (Mac) |
| iOS install needs paid Apple ($99/yr) | Yes for ad hoc/TestFlight | Yes for ad hoc/TestFlight | No | Yes for ad hoc/TestFlight |
| Needs trusted HTTPS on LAN | No (native HTTP to LAN is a separate ATS question, not researched) | No (same caveat) | **Yes** (service workers) | No (same caveat) |
| Plugin ownership | Mostly one vendor (Expo) | Mix of Ionic official + community | Browser standards | Mix of pub.dev publishers |

## Trade-offs that matter for "Choose the tech stack"

1. **Notifications rule out a pure PWA as the main app.** No web API schedules notifications offline, and Web Push can't reach a phone that is away from a LAN-only server. A PWA could only be an iPhone fallback with weaker alerts.
2. **No Mac → Expo is the only TS option that produces an iOS binary**, via EAS cloud's free tier. Capacitor and Flutter need a Mac, or a paid third-party macOS CI, for iOS. If a Mac is available, this advantage disappears.
3. **Android APK on Windows works for all three native options.** With Expo it means skipping `eas build --local` and using `prebuild` + Gradle.
4. **TS end to end** favours Expo or Capacitor over Flutter, because it allows shared types and validation with a TypeScript server.
5. **Plugin ownership:** Expo gives first-party camera, notifications and SQLite. Capacitor relies on community plugins for SQLite and the stronger scanner, and Ionic's commercial cloud is being wound down.
6. **The 64-notification iOS cap and inexact Android alarms** apply to every native option. Plan for a digest-style alert schedule rather than one notification per item.

## Open questions not answered here

- Whether native apps can talk plain HTTP to a LAN IP under iOS App Transport Security, or whether the server needs HTTPS anyway. Not researched; this affects every native option and should go to the sync or server ticket.
- Whether the EAS free-tier build allowance resets monthly. The pricing page is silent.
- What third-party macOS CI costs for Capacitor or Flutter.
