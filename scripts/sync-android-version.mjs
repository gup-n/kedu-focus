import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const parts = version.split('.').map(Number)
if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 99)) {
  throw new Error(`Android version requires x.y.z parts between 0 and 99: ${version}`)
}
const versionCode = parts[0] * 10_000 + parts[1] * 100 + parts[2]
const buildFile = path.join(root, 'android', 'app', 'build.gradle')
let contents = fs.readFileSync(buildFile, 'utf8')
contents = contents.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
contents = contents.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)
fs.writeFileSync(buildFile, contents)
console.log(`Android version synchronized: ${version} (${versionCode})`)
