// Stage the web build for the xtool shell (frontend/ios-xtool): copy dist/ to Resources/public
// the way `cap copy` fills ios/App/App/public (cordova.js from @capacitor/core beside an empty
// cordova_plugins.js), and write Resources/capacitor.config.json with the bundle id from
// xtool.yml and the `packageClassList` Capacitor's SPM mode uses to find native plugins by
// class name. Run after `VITE_MOBILE=1 vite build` + the media staging (package.json build:ios-xtool).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const shell = resolve(root, 'ios-xtool')
const out = resolve(shell, 'Resources')
if (!existsSync(resolve(dist, 'index.html'))) { console.error('ios-xtool-prepare: no dist/index.html; run the mobile build first'); process.exit(1) }

// The native plugins this shell links (Package.swift), by their Objective-C class names.
const packageClassList = ['AppPlugin', 'FilesystemPlugin', 'LocalNotificationsPlugin', 'SharePlugin', 'PrintPlugin']

const yml = readFileSync(resolve(shell, 'xtool.yml'), 'utf8')
const bundleID = /^bundleID:\s*(\S+)/m.exec(yml)?.[1]
if (!bundleID) { console.error('ios-xtool-prepare: xtool.yml has no bundleID'); process.exit(1) }

rmSync(out, { recursive: true, force: true })
mkdirSync(resolve(out, 'public'), { recursive: true })
cpSync(dist, resolve(out, 'public'), { recursive: true })
copyFileSync(resolve(root, 'node_modules/@capacitor/core/cordova.js'), resolve(out, 'public/cordova.js'))
writeFileSync(resolve(out, 'public/cordova_plugins.js'), '')

const base = JSON.parse(readFileSync(resolve(root, 'capacitor.config.json'), 'utf8'))
const config = { ...base, appId: bundleID, packageClassList }
delete config.android
writeFileSync(resolve(out, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n')
console.log(`ios-xtool-prepare: staged ${resolve(out, 'public')} and capacitor.config.json (${bundleID}, ${packageClassList.length} plugins)`)
