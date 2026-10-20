/** Verify a Loom tarball through an unchanged official Harness installation. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = dirname(dirname(fileURLToPath(import.meta.url)))
const help = 'Usage: node scripts/verify-stock.mjs --runtime <official dsh package directory> --tarball <Loom.tgz> [--web-smoke] [--all-tests] [--timeout-ms <1..600000>]'

/** Parse explicit verification inputs before acquiring resources.
 * @param args Command-line arguments without the Node executable and script.
 * @returns Validated paths, child deadline, Web startup check, and full-suite selection.
 */
export function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!['--runtime', '--tarball', '--timeout-ms', '--web-smoke', '--all-tests', '--help'].includes(name)) throw new Error(`Unknown argument ${JSON.stringify(name)}. ${help}`)
    if (values.has(name)) throw new Error(`Duplicate argument ${name}`)
    if (name === '--web-smoke' || name === '--all-tests' || name === '--help') values.set(name, true)
    else {
      const value = args[++index]
      if (value === undefined || value.startsWith('--') || value.includes('\0')) throw new Error(`Missing or invalid value for ${name}`)
      values.set(name, value)
    }
  }
  if (values.has('--help')) {
    if (values.size !== 1) throw new Error('--help cannot be combined with verification arguments')
    return { help: true }
  }
  for (const name of ['--runtime', '--tarball']) if (!values.has(name)) throw new Error(`Required argument ${name}. ${help}`)
  const timeoutText = values.get('--timeout-ms') ?? '180000'
  if (!/^\d+$/u.test(timeoutText)) throw new Error('--timeout-ms must be an integer from 1 to 600000')
  const timeoutMs = Number(timeoutText)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new Error('--timeout-ms must be an integer from 1 to 600000')
  for (const name of ['--runtime', '--tarball']) if (/^[a-z][a-z\d+.-]*:\/\//iu.test(values.get(name))) throw new Error(`${name} must be a local filesystem path`)
  if (!values.get('--tarball').endsWith('.tgz')) throw new Error('--tarball must name a .tgz file')
  return { runtime: resolve(values.get('--runtime')), tarball: resolve(values.get('--tarball')), timeoutMs, webSmoke: values.has('--web-smoke'), allTests: values.has('--all-tests') }
}

/** Resolve installed-candidate tests before acquiring verification resources.
 * @param directory Source test directory whose regular test files may be executed.
 * @param allTests When true, select every .test.mjs file; otherwise select features.test.mjs only.
 * @returns Absolute test paths in stable filename order; refuses an empty selection or missing feature test.
 */
export async function resolveTestFiles(directory, allTests) {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs')).map(entry => entry.name)
  const selected = allTests ? names.sort() : names.filter(name => name === 'features.test.mjs')
  if (selected.length === 0 || !selected.includes('features.test.mjs')) throw new Error('Verification requires tests/features.test.mjs')
  return selected.map(name => resolve(directory, name))
}

/** Remove URL credentials, authentication query values, and common credential tokens from diagnostic output.
 * @param value Child output or an error message.
 * @returns Text safe to print without a Web authentication link.
 */
export function redactOutput(value) {
  return String(value)
    .replace(/https?:\/\/[^\s<>"']+/gu, (text) => {
      try {
        const url = new URL(text)
        url.username = ''
        url.password = ''
        if (url.search !== '') url.search = '?redacted'
        if (url.hash !== '') url.hash = '#redacted'
        return url.href
      } catch (error) {
        return '[redacted URL]'
      }
    })
    .replace(/\b(?:sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}|gh(?:p|o|u|s|r)_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,})\b/gu, '[redacted credential]')
}

function inside(root, path) {
  const suffix = relative(root, path)
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
}

async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }

async function validateInputs(options) {
  const runtime = await realpath(options.runtime)
  if (!(await lstat(runtime)).isDirectory()) throw new Error('--runtime must name the installed @deepseek-ai/dsh package directory')
  const expected = await json(join(project, 'package.json'))
  const manifest = await json(join(runtime, 'package.json'))
  if (manifest.name !== '@deepseek-ai/dsh' || manifest.version !== expected.engines.dsh) throw new Error(`Expected official @deepseek-ai/dsh ${expected.engines.dsh}`)
  const modules = dirname(dirname(options.runtime))
  if (basename(modules) !== 'node_modules') throw new Error('--runtime must be inside a complete official npm installation: <install>/node_modules/@deepseek-ai/dsh')
  const stockModules = await realpath(modules)
  if (!inside(stockModules, runtime)) throw new Error('The runtime must be installed inside its node_modules tree, rather than linked to a source checkout')
  for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-session', '@deepseek-ai/cordis']) {
    await readFile(join(stockModules, name, 'package.json'))
  }
  const cliRelative = typeof manifest.bin === 'object' ? manifest.bin.dsh : undefined
  if (typeof cliRelative !== 'string' || isAbsolute(cliRelative)) throw new Error('The official runtime has no supported dsh CLI entry')
  const cli = await realpath(resolve(runtime, cliRelative))
  if (!inside(runtime, cli) || !(await lstat(cli)).isFile()) throw new Error('The dsh CLI entry must be a file within its installed package')
  const tarball = await realpath(options.tarball)
  if (!(await lstat(tarball)).isFile()) throw new Error('--tarball must be a regular .tgz file')
  const tarballBytes = await readFile(tarball)
  const tarballDigest = createHash('sha256').update(tarballBytes).digest('hex')
  const testFiles = await resolveTestFiles(join(project, 'tests'), options.allTests)
  return { ...options, runtime, stockModules, tarballBytes, tarballDigest, cli, testFiles, packageName: expected.name, packageVersion: expected.version }
}

async function snapshotTree(root) {
  const files = new Map()
  async function visit(directory, prefix) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      if (entry.name === '.cache' && (prefix === '' || basename(directory) === 'node_modules')) continue
      const local = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const path = join(directory, entry.name)
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) {
        if (!inside(root, await realpath(path))) throw new Error(`Verification requires dependencies contained in the official installation; external link: ${local}`)
        files.set(local, `link:${await readlink(path)}`)
      } else if (stat.isDirectory()) {
        files.set(local, `directory:${stat.mode & 0o777}`)
        await visit(path, local)
      } else if (stat.isFile()) {
        files.set(local, `${stat.mode & 0o777}:${createHash('sha256').update(await readFile(path)).digest('hex')}`)
      } else throw new Error(`Unsupported installed-runtime filesystem entry: ${local}`)
    }
  }
  await visit(root, '')
  return files
}

function digestTree(files) {
  const hash = createHash('sha256')
  for (const [path, digest] of files) hash.update(path).update('\0').update(digest).update('\n')
  return hash.digest('hex')
}

function unchanged(before, after) {
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path))
  if (changed.length > 0) throw new Error(`Official runtime changed (${changed.length} entries): ${changed.slice(0, 10).join(', ')}`)
}

function environment(root) {
  const env = {}
  for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT']) if (process.env[name] !== undefined) env[name] = process.env[name]
  return {
    ...env, HOME: join(root, 'user'), USERPROFILE: join(root, 'user'),
    TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'),
    DSH_HOME: join(root, 'dsh'), DSH_AGENTS_HOME: join(root, 'agents'),
    XDG_CACHE_HOME: join(root, 'cache'), XDG_CONFIG_HOME: join(root, 'config'),
    npm_config_cache: join(root, 'cache/npm'), npm_config_store_dir: join(root, 'cache/pnpm'),
    npm_config_userconfig: join(root, 'empty.npmrc'), COREPACK_HOME: join(root, 'cache/corepack'),
    COREPACK_ENABLE_AUTO_PIN: '0', DEEPSEEK_API_KEY: '', OPENROUTER_DEEPSEEK_API_KEY: '',
    DSH_TELEMETRY_DISABLED: '1', CI: '1', NO_COLOR: '1',
  }
}

function startChild(args, { cwd, env, children }) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: false })
  let output = ''
  let spawnError
  const listeners = new Set()
  const capture = data => {
    output = (output + data.toString('utf8')).slice(-2 * 1024 * 1024)
    for (const listener of listeners) listener(output)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.on('error', error => { spawnError = error })
  const closed = new Promise(resolve => child.once('close', (exitCode, signal) => {
    children.delete(handle)
    resolve({ exitCode, signal, spawnError, output })
  }))
  const handle = { child, closed, output: () => output, listeners, env }
  children.add(handle)
  return handle
}

async function stopChild(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) return handle.closed
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(handle.child.pid), '/t', '/f'], { stdio: 'ignore', shell: false, env: handle.env })
    await new Promise(resolve => { killer.once('error', resolve); killer.once('close', resolve) })
  } else {
    try { process.kill(-handle.child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  const force = setTimeout(() => {
    try {
      if (process.platform === 'win32') handle.child.kill('SIGKILL')
      else process.kill(-handle.child.pid, 'SIGKILL')
    } catch (error) { if (error.code !== 'ESRCH') console.error(`Owned child termination failed: ${redactOutput(error.message)}`) }
  }, 10_000)
  try { return await handle.closed } finally { clearTimeout(force) }
}

async function runChild(args, context, signal) {
  const handle = startChild(args, context)
  const stop = () => { void stopChild(handle) }
  signal?.addEventListener('abort', stop, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; void stopChild(handle) }, context.timeoutMs)
  if (signal?.aborted) stop()
  try {
    const result = await handle.closed
    if (timedOut || signal?.aborted || result.spawnError || result.exitCode !== 0 || result.signal !== null) {
      throw new Error(`Command failed: timedOut=${timedOut}, aborted=${signal?.aborted ?? false}, signal=${String(result.signal)}, exitCode=${String(result.exitCode)}\n${redactOutput(result.output).slice(-8000)}`)
    }
    return result.output
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

async function smokeWeb(input, context, signal) {
  const handle = startChild([input.cli, 'web', '--port', '0', '--no-open'], context)
  let timer
  let listener
  let abort
  const ready = new Promise((resolve, reject) => {
    listener = output => {
      const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/u.exec(output)
      if (match) resolve(new URL(match[1]))
    }
    abort = () => { reject(new Error('Web readiness check was interrupted')) }
    handle.listeners.add(listener)
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => reject(new Error('Web readiness timed out')), context.timeoutMs)
    void handle.closed.then(result => reject(new Error(`Web exited before readiness: signal=${String(result.signal)}, exitCode=${String(result.exitCode)}\n${redactOutput(result.output).slice(-8000)}`)))
    if (signal.aborted) abort()
  })
  try {
    const url = await ready
    if (url.port === '0') throw new Error('Web readiness reported an unbound port')
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
    if (!response.ok) {
      const location = response.headers.get('location')
      if (![302, 303].includes(response.status) || location === null || new URL(location, url).origin !== url.origin) {
        throw new Error(`Web readiness returned HTTP ${response.status} without a same-origin authentication redirect`)
      }
    }
    await response.body?.cancel()
    console.log('Official dsh Web profile reached readiness on an allocated loopback port')
  } finally {
    clearTimeout(timer)
    handle.listeners.delete(listener)
    signal.removeEventListener('abort', abort)
    await stopChild(handle)
  }
}

/** Install, exercise, remove, and verify one tarball without modifying the official runtime.
 * @param options Parsed local verification inputs; allTests selects the full source suite, otherwise eight feature tests run.
 * @returns Completes after owned children exit, profile rollback passes, and temporary files are removed.
 */
export async function verifyStock(options) {
  const input = await validateInputs(options)
  console.log('Hashing the original official runtime and its installed dependencies')
  const before = await snapshotTree(input.stockModules)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'loom-stock-verify-')))
  const children = new Set()
  const controller = new AbortController()
  const onSignal = () => { controller.abort() }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  const failures = []
  let baseline
  const env = environment(root)
  const context = { cwd: root, env, children, timeoutMs: input.timeoutMs }
  const manifestPath = join(env.DSH_HOME, 'profiles/web/package.json')
  try {
    for (const directory of ['user', 'tmp', 'agents', 'cache', 'config']) await mkdir(join(root, directory), { recursive: true })
    const archive = join(root, 'loom.tgz')
    await writeFile(archive, input.tarballBytes)
    console.log(`Verifying tarball SHA-256 ${input.tarballDigest} in a temporary profile`)
    await runChild([input.cli, 'plugin', '--profile', 'web', 'version-exemptions'], context, controller.signal)
    baseline = await json(manifestPath)
    await runChild([input.cli, 'plugin', '--profile', 'web', 'add', archive], context, controller.signal)
    const installedManifest = await json(manifestPath)
    assert.ok(installedManifest.dsh?.profile?.bundles?.includes(input.packageName), 'The original CLI did not activate the Loom bundle')
    const installedPackage = join(dirname(manifestPath), 'node_modules', ...input.packageName.split('/'))
    const installed = await json(join(installedPackage, 'package.json'))
    assert.equal(installed.name, input.packageName)
    assert.equal(installed.version, input.packageVersion, 'The tarball version differs from this checkout')
    console.log('Loom installed and activated through the original dsh plugin command')
    const testOutput = await runChild(['--test', ...input.testFiles], {
      ...context, env: { ...env, LOOM_INSTALLED_PACKAGE: installedPackage, LOOM_STOCK_NODE_MODULES: input.stockModules },
    }, controller.signal)
    console.log(redactOutput(testOutput).trim())
    if (input.webSmoke) await smokeWeb(input, context, controller.signal)
  } catch (error) {
    failures.push(error)
  } finally {
    for (const handle of [...children]) {
      try { await stopChild(handle) } catch (error) { failures.push(error) }
    }
    const quiescent = children.size === 0
    if (!quiescent) failures.push(new Error(`Owned processes did not stop; temporary resources retained at ${root}`))
    if (quiescent && baseline !== undefined) {
      try {
        const manifest = await json(manifestPath)
        if (manifest.dependencies?.[input.packageName] !== undefined || manifest.dsh?.profile?.bundles?.includes(input.packageName)) {
          await runChild([input.cli, 'plugin', '--profile', 'web', 'remove', input.packageName], context)
        }
        const restored = await json(manifestPath)
        assert.deepEqual(restored.dsh?.profile?.bundles, baseline.dsh?.profile?.bundles, 'Removing Loom did not restore the original profile bundle list')
        assert.equal(restored.dependencies?.[input.packageName], undefined, 'Removing Loom retained its direct dependency')
        console.log('Original profile bundle list restored through dsh plugin remove')
      } catch (error) { failures.push(error) }
    }
    if (quiescent) {
      try {
        unchanged(before, await snapshotTree(input.stockModules))
        console.log(`Official runtime unchanged: ${before.size} filesystem entries, SHA-256 ${digestTree(before)} (node_modules/.cache excluded)`)
      } catch (error) { failures.push(error) }
      try { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch (error) { failures.push(error) }
    }
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  if (failures.length > 0) throw new AggregateError(failures, failures.map(error => redactOutput(error.message)).join('\n'))
  console.log('Stock verification passed; temporary profile and owned processes removed; no model API calls')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) console.log(help)
    else await verifyStock(options)
  } catch (error) {
    console.error(redactOutput(error.message))
    process.exitCode = 1
  }
}
