/** Inspect npm's selected distribution files before a Loom tarball is published. */
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const required = [
  'package.json', 'README.md', 'README.zh.md', 'COMPATIBILITY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'cordis.patch.yml', 'dist/index.js',
  'docs/README.md', 'docs/README.zh.md', 'docs/guide.md', 'docs/guide.zh.md', 'docs/configuration.md', 'docs/configuration.zh.md',
]
const privatePath = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.netrc|\.ssh|\.artifacts|auth(?:\.[^/]*)?|credentials(?:\.[^/]*)?|fixtures?|vendor|src|source)(?:\/|$)/iu
const machinePath = /(?:\/(?:Users|home)\/[^\s"'<>\\]+|\/private\/(?:tmp|var\/folders)\/[^\s"'<>\\]+|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/])/u
const sourceImport = /(?:^|[\/])(?:vendor|src|source)(?:[\/]|$)|^@loom\//u
const secretPatterns = [
  /\bsk-(?:or-v1-)?[A-Za-z0-9_-]{20,}\b/u,
  /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{24,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{24,}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
]

/**
 * Validate selected paths and text without writing an archive or exposing matched secrets.
 * @param files - npm-selected paths and their bytes.
 * @returns every publication refusal, without the sensitive matched content.
 */
export function inspectPackage(files) {
  const problems = []
  const paths = new Set(files.map(file => file.path))
  for (const name of required) if (!paths.has(name)) problems.push(`Missing required distribution file: ${name}`)
  const clients = files.filter(file => /^dist\/compat\/[^/]+\/client\.js$/u.test(file.path))
  if (clients.length === 0) problems.push('No compiled browser faces are selected by npm pack')
  for (const file of files) {
    if (isAbsolute(file.path) || /^[A-Za-z]:/u.test(file.path) || file.path.split(/[\\/]/u).includes('..')) {
      problems.push(`Invalid archive path: ${file.path}`)
    }
    if (privatePath.test(file.path) || /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/u.test(file.path)) {
      problems.push(`Private or source file selected by npm pack: ${file.path}`)
    }
    if (!/\.(?:[cm]?js|json|ya?ml|md|txt|svg|map)$/iu.test(file.path) && !/^(?:LICENSE|NOTICE)$/u.test(file.path)) continue
    const content = Buffer.isBuffer(file.content) ? file.content.toString('utf8') : file.content
    if (machinePath.test(content)) problems.push(`Local machine path in ${file.path}`)
    if (secretPatterns.some(pattern => pattern.test(content))) problems.push(`Credential material in ${file.path}`)
    if (file.path === 'cordis.patch.yml') {
      for (const match of content.matchAll(/\.\/dist\/[A-Za-z0-9_./-]+\.js/gu)) {
        const target = posix.normalize(match[0])
        if (!paths.has(target)) problems.push(`Missing configured distribution file: ${target}`)
      }
    }
    if (!/\.[cm]?js$/iu.test(file.path)) continue
    const imports = content.matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\b(?:import|require)\s*\(\s*)["']([^"']+)["']/gu)
    for (const match of imports) {
      const specifier = match[1]
      if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(specifier) || specifier.startsWith('file:') || sourceImport.test(specifier)) {
        problems.push(`Unresolved source or absolute import in ${file.path}`)
      } else if (specifier.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(file.path), specifier))
        if (!paths.has(target)) problems.push(`Missing imported distribution file: ${target}`)
      }
    }
  }
  const manifestFile = files.find(file => file.path === 'package.json')
  if (manifestFile !== undefined) {
    try {
      const manifest = JSON.parse(manifestFile.content.toString())
      if (manifest.name !== '@scasella/dsh-loom') problems.push('Unexpected published package name')
      if (manifest.engines?.dsh !== '0.2.1-rc.2') problems.push('Package must require the exact supported official DSH version')
      if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('Missing Loom bundle patch declaration')
      for (const dependencies of [manifest.dependencies, manifest.peerDependencies]) {
        for (const [name, version] of Object.entries(dependencies ?? {})) {
          if (/^(?:workspace|link|file):/u.test(version)) problems.push(`Local dependency specifier for ${name}`)
        }
      }
    } catch (error) {
      problems.push('Packaged package.json is not valid JSON')
    }
  }
  return problems
}

/** Read npm's own dry-run selection, with package scripts disabled and a disposable cache. */
async function selectedFiles(root) {
  const cache = await mkdtemp(join(tmpdir(), 'loom-pack-cache-'))
  try {
    const outcome = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: cache, npm_config_ignore_scripts: 'true' },
    })
    if (outcome.error) throw new Error('npm pack selection failed', { cause: outcome.error })
    if (outcome.status !== 0) throw new Error(`npm pack selection failed with exit ${String(outcome.status)}`)
    const result = JSON.parse(outcome.stdout)
    if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]?.files)) throw new Error('npm pack returned an unexpected file list')
    const files = []
    for (const entry of result[0].files) {
      if (typeof entry.path !== 'string' || isAbsolute(entry.path) || entry.path.split(/[\\/]/u).includes('..')) throw new Error('npm pack returned an unsafe file path')
      files.push({ path: entry.path.replaceAll('\\', '/'), content: await readFile(join(root, entry.path)) })
    }
    return files
  } finally {
    await rm(cache, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const files = await selectedFiles(root)
  const problems = inspectPackage(files)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    process.exitCode = 1
  } else {
    console.log(`Checked ${files.length} npm-selected files; no private files, credential matches, local machine paths, or source imports`)
  }
}
