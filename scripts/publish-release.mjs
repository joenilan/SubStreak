import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import SftpClient from 'ssh2-sftp-client'

const appRoot = resolve(import.meta.dirname, '..')
// SubStreak lives at subathon_timer/apps/substreak, so its repo root is two up.
const parentRepoRoot = resolve(appRoot, '..', '..')
const releaseRoot = resolve(appRoot, 'release', 'windows')
const version = readFileSync(resolve(appRoot, 'VERSION'), 'utf8').trim()
const patchNotesSource = readFileSync(resolve(appRoot, 'PATCH_NOTES.md'), 'utf8')

// SSH creds are shared with the parent app's working publish setup (.env.raspi).
// SubStreak-specific overrides (signing key, slug) come from the local .env.
const sharedEnvFile = process.env.RPI_ENV_FILE ?? resolve(parentRepoRoot, '.env.raspi')
const localEnvFile = resolve(appRoot, '.env')

const localEnv = existsSync(localEnvFile) ? loadEnvFile(localEnvFile) : {}

const env = {
  ...(existsSync(sharedEnvFile) ? loadEnvFile(sharedEnvFile) : {}),
  ...localEnv,
  ...process.env,
}

// The signing key + password are SubStreak-specific and intentionally live in the
// local .env (substreak.key, empty password). The shell's process.env often carries
// the *parent* app's TAURI_SIGNING_* (subathon-timer.key + its password) from a prior
// session, and process.env wins the merge above — which silently signs with the wrong
// key, or fails with "Wrong password for that key" after a full build. So for these two
// vars only, the local .env is authoritative; a stray inherited value can never win.
// (Other vars like SSH creds still let process.env override, for CI flexibility.)
for (const key of ['TAURI_SIGNING_PRIVATE_KEY_PATH', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD']) {
  if (key in localEnv) env[key] = localEnv[key]
}

const host = requiredEnv(env, 'SSH_HOST')
const username = requiredEnv(env, 'SSH_USER')
const password = requiredEnv(env, 'SSH_PASSWORD')
const port = Number.parseInt(env.SSH_PORT ?? '22', 10)
const appSlug = env.RELEASE_APP_SLUG ?? 'substreak'
const baseDir = env.RPI_RELEASE_BASE_DIR ?? '/mnt/data/sites/apps/public/downloads'
const channel = env.RELEASE_CHANNEL ?? 'stable'
const remoteDir = `${baseDir.replace(/\/+$/, '')}/${appSlug}`

const setupName = `${appSlug}_${version}_x64-setup.exe`
const setupSigName = `${setupName}.sig`
const portableName = `${appSlug}_${version}_x64_portable.zip`
const msiName = `${appSlug}_${version}_x64_en-US.msi`
const manifestName = 'manifest.json'
const notesName = 'notes.md'
const latestName = 'latest.json'
const updaterName = 'updater.json'
const remoteLatestPath = `${remoteDir}/${latestName}`
const remoteArchiveRoot = `${remoteDir}/archive`
const downloadBase = `https://apps.zombie.digital/downloads/${appSlug}`

const notesMarkdown = extractVersionNotes(patchNotesSource, version)

// Sign the NSIS installer for Tauri's updater.
const setupPath = resolve(releaseRoot, setupName)
const privateKeyPath = env.TAURI_SIGNING_PRIVATE_KEY_PATH
const privateKeyPassword = env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? ''
if (!privateKeyPath) throw new Error('TAURI_SIGNING_PRIVATE_KEY_PATH env var is not set')
execSync(
  `bunx tauri signer sign --private-key-path "${privateKeyPath}" --password "${privateKeyPassword}" "${setupPath}"`,
  { stdio: 'inherit' },
)
const setupSig = readFileSync(resolve(releaseRoot, setupSigName), 'utf8').trim()

// Guard: the signature MUST come from the key whose pubkey is embedded in the app
// (tauri.conf.json plugins.updater.pubkey). If it doesn't, every installed app rejects
// the update with "update install failed". This silently happened on 0.1.3 when the
// parent .env.raspi key (subathon-timer.key) won the env merge instead of substreak.key.
const tauriConf = JSON.parse(readFileSync(resolve(appRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const configuredPubkey = tauriConf?.plugins?.updater?.pubkey
if (!configuredPubkey) throw new Error('No plugins.updater.pubkey found in src-tauri/tauri.conf.json')
const pubkeyId = minisignKeyId(configuredPubkey)
const signatureId = minisignKeyId(setupSig)
if (pubkeyId !== signatureId) {
  throw new Error(
    `Signing key mismatch — aborting before upload.\n` +
    `  Installer was signed by minisign key id: ${signatureId}\n` +
    `  tauri.conf.json pubkey expects key id:   ${pubkeyId}\n` +
    `Point TAURI_SIGNING_PRIVATE_KEY_PATH at the key matching the app pubkey ` +
    `(its .pub must equal plugins.updater.pubkey). For SubStreak this is substreak.key.`,
  )
}

// latest.json — site download-button format.
const latest = {
  version,
  channel,
  publishedAt: new Date().toISOString(),
  file: setupName,
  notes: summarizeNotes(notesMarkdown),
  notesFile: notesName,
  files: {
    setup: setupName,
    portable: portableName,
    msi: msiName,
  },
}

// updater.json — Tauri plugin format.
const updater = {
  version,
  notes: notesMarkdown.trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: setupSig,
      url: `${downloadBase}/${setupName}`,
    },
  },
}

const latestPath = resolve(releaseRoot, latestName)
const updaterPath = resolve(releaseRoot, updaterName)
const notesPath = resolve(releaseRoot, notesName)

writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`)
writeFileSync(updaterPath, `${JSON.stringify(updater, null, 2)}\n`)
writeFileSync(notesPath, `${notesMarkdown.trim()}\n`)

const uploadPaths = [
  setupName,
  setupSigName,
  `${setupName}.sha256`,
  portableName,
  `${portableName}.sha256`,
  msiName,
  `${msiName}.sha256`,
  manifestName,
  latestName,
  updaterName,
  notesName,
].map((name) => resolve(releaseRoot, name))

for (const path of uploadPaths) {
  readFileSync(path)
}

const sftp = new SftpClient()

try {
  await sftp.connect({ host, port, username, password })
  await sftp.mkdir(remoteDir, true)
  await archiveCurrentTopLevelRelease(sftp)

  for (const localPath of uploadPaths) {
    const remotePath = `${remoteDir}/${basename(localPath)}`
    await sftp.put(localPath, remotePath)
  }
} finally {
  await sftp.end().catch(() => {})
}

console.log(`Published SubStreak ${version} to ${remoteDir}`)
for (const localPath of uploadPaths) {
  console.log(`- ${basename(localPath)}`)
}

async function archiveCurrentTopLevelRelease(sftp) {
  const latestExists = await sftp.exists(remoteLatestPath)
  if (!latestExists) return

  const latestSource = await sftp.get(remoteLatestPath)
  const previousRelease = JSON.parse(bufferToString(latestSource))
  const previousVersion = previousRelease?.version
  if (!previousVersion || previousVersion === version) return

  const archiveDir = `${remoteArchiveRoot}/${previousVersion}`
  await sftp.mkdir(archiveDir, true)

  const entries = await sftp.list(remoteDir)
  for (const entry of entries) {
    if (entry.name === 'archive' || entry.type !== '-') continue
    const from = `${remoteDir}/${entry.name}`
    const to = `${archiveDir}/${entry.name}`
    if (await sftp.exists(to)) await sftp.delete(to)
    await sftp.rename(from, to)
  }
}

// Extract the 8-byte minisign key id (hex) from a base64-encoded minisign
// pubkey or .sig file (Tauri stores both as a single base64 blob). The key id is
// bytes 2..10 of the first non-comment payload line.
function minisignKeyId(base64FileContents) {
  const text = Buffer.from(base64FileContents, 'base64').toString('utf8')
  const payloadLine = text
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith('untrusted comment:') && !line.startsWith('trusted comment:'))
  if (!payloadLine) throw new Error('Could not parse minisign payload line')
  return Buffer.from(payloadLine.trim(), 'base64').subarray(2, 10).toString('hex')
}

function loadEnvFile(path) {
  const source = readFileSync(path, 'utf8')
  const parsed = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    parsed[key] = value
  }
  return parsed
}

function requiredEnv(env, key) {
  const value = env[key]
  if (!value) throw new Error(`Missing required release env: ${key}`)
  return value
}

function extractVersionNotes(source, targetVersion) {
  const sections = source.replaceAll('\r\n', '\n').split(/\n(?=## )/)
  const section = sections.find((s) => {
    const firstLine = s.split('\n')[0]
    return new RegExp(`^##\\s+${escapeRegExp(targetVersion)}\\s*$`).test(firstLine)
  })
  if (!section) throw new Error(`Unable to find patch notes for version ${targetVersion}`)
  return section.trimEnd()
}

function summarizeNotes(notesMarkdown) {
  const bullet = notesMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('- '))
  return bullet ? bullet.slice(2) : `SubStreak ${version}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function bufferToString(value) {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  throw new Error('Unsupported SFTP response when reading latest.json')
}
