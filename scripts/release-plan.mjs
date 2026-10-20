/** Validate release identity and select npm distribution tags before publication. */
import { appendFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseArgs, isDeepStrictEqual } from 'node:util'

const packageName = '@scasella/dsh-loom'
const repository = 'scasella/dsh-loom'
const repositoryUrl = `git+https://github.com/${repository}.git`
const channels = new Set(['alpha', 'beta', 'rc', 'next'])
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/u

/** Resolve a tag or manual dry run against every package version source.
 * @param input GitHub event identity, package manifests, and compiled-face version literals.
 * @returns Validated version, Git tag, npm tag, archive filename, and publication eligibility.
 */
export function resolveRelease(input) {
  const { manifest, lockfile, hostVersion, clientVersion, ref, eventName } = input
  if (input.repository !== repository) throw new Error(`Release repository must be ${repository}`)
  if (manifest.name !== packageName || manifest.private === true) throw new Error(`Release package must be public ${packageName}`)
  if (manifest.repository?.url !== repositoryUrl) throw new Error('Package repository.url must match the GitHub trusted publisher')
  const version = manifest.version
  const match = typeof version === 'string' ? versionPattern.exec(version) : null
  if (match === null) throw new Error('Release version must be SemVer without build metadata')
  const channel = match[4]?.split('.')[0] ?? 'latest'
  if (match[4] !== undefined && !channels.has(channel)) throw new Error('Prerelease channel must be alpha, beta, rc, or next')
  for (const [label, value] of [
    ['lockfile package', lockfile.version], ['lockfile root', lockfile.packages?.['']?.version],
    ['Host metadata', hostVersion], ['Client metadata', clientVersion],
  ]) if (value !== version) throw new Error(`${label} version must match package.json ${version}`)
  if (lockfile.name !== packageName || lockfile.packages?.['']?.name !== packageName) throw new Error('Lockfile package names must match package.json')
  const tag = `v${version}`
  let publish
  if (eventName === 'push') {
    if (ref !== `refs/tags/${tag}`) throw new Error(`Release tag must exactly match ${tag}`)
    publish = true
  } else if (eventName === 'workflow_dispatch') {
    if (ref !== 'refs/heads/main') throw new Error('Manual release checks must run from main')
    publish = false
  } else throw new Error('Only tag pushes or manual dry runs can enter the release workflow')
  return { version, tag, distTag: channel, filename: `scasella-dsh-loom-${version}.tgz`, publish }
}

/** Read one explicit package metadata version from a Host or browser build source.
 * @param source Source containing exactly one literal version property.
 * @returns The version that the compiled plugin metadata will expose.
 */
export function metadataVersion(source) {
  const versions = [...source.matchAll(/\bversion:\s*['"]([^'"]+)['"]/gu)]
  if (versions.length !== 1) throw new Error('Expected exactly one literal metadata version')
  return versions[0][1]
}

/** Reject an artifact whose package manifest differs from the checked source.
 * @param expected Source package.json fields.
 * @param packed Manifest read from the checked tarball without extracting it to the checkout.
 */
export function validatePackedManifest(expected, packed) {
  if (!isDeepStrictEqual(expected, packed)) throw new Error('Checked archive package.json differs from the release source')
}

async function main() {
  const { values } = parseArgs({ options: { 'packed-manifest': { type: 'string' } } })
  const root = fileURLToPath(new URL('../', import.meta.url))
  const json = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'))
  const manifest = await json('package.json')
  const result = resolveRelease({
    repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, eventName: process.env.GITHUB_EVENT_NAME,
    manifest, lockfile: await json('package-lock.json'),
    hostVersion: metadataVersion(await readFile(resolve(root, 'src/index.ts'), 'utf8')),
    clientVersion: metadataVersion(await readFile(resolve(root, 'scripts/build-client.mjs'), 'utf8')),
  })
  if (values['packed-manifest'] !== undefined) validatePackedManifest(manifest, await json(values['packed-manifest']))
  if (process.env.GITHUB_OUTPUT !== undefined) await appendFile(process.env.GITHUB_OUTPUT,
    Object.entries(result).map(([name, value]) => `${name}=${String(value)}\n`).join(''))
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
