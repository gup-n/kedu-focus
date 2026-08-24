import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseFeed = JSON.parse(fs.readFileSync(path.join(root, 'public', 'releases.json'), 'utf8'))
const androidGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8')
const releaseSource = fs.readFileSync(path.join(root, 'src', 'pwa', 'releases.ts'), 'utf8')
const version = pkg.version
const parts = version.split('.').map(Number)
const versionCode = parts[0] * 10_000 + parts[1] * 100 + parts[2]
const tag = process.env.GITHUB_REF_NAME

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`)
if (tag && tag !== `v${version}`) throw new Error(`Git tag ${tag} does not match package version ${version}`)
if (!androidGradle.includes(`versionName "${version}"`)) throw new Error(`Android versionName is not ${version}`)
if (!androidGradle.includes(`versionCode ${versionCode}`)) throw new Error(`Android versionCode is not ${versionCode}`)

const first = releaseFeed[0]
if (!first || first.version !== version) throw new Error('public/releases.json first release does not match package version')
if (!first.apkUrl || !first.apkUrl.includes(`/releases/download/v${version}/`) || first.apkUrl.includes('/releases/latest/')) {
  throw new Error('public/releases.json must use a version-specific APK URL')
}
if (!releaseSource.includes(`version: '${version}'`)) throw new Error('src/pwa/releases.ts first release does not match package version')
if (!releaseSource.includes(`/releases/download/v${version}/app-release.apk`)) throw new Error('src/pwa/releases.ts must use a version-specific APK URL')

console.log(`Release metadata valid: ${version} (${versionCode})`)
