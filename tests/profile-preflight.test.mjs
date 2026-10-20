/** Profile migration refusals and verification input checks leave existing settings unchanged. */
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { parseOptions, resolveTestFiles } from '../scripts/verify-stock.mjs'

const dir = await mkdtemp(join(tmpdir(), 'loom-profile-test-'))
const output = join(dir, 'preflight.mjs')
await build({ entryPoints: [new URL('../src/profile-preflight.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: output })
const { assertCompatibleOverrides } = await import(pathToFileURL(output).href)
after(() => rm(dir, { recursive: true, force: true }))

test('permits clean profiles and unrelated configuration', () => {
  assert.doesNotThrow(() => assertCompatibleOverrides([]))
  assert.doesNotThrow(() => assertCompatibleOverrides([{ id: 'other', config: { value: 1 } }]))
  assert.doesNotThrow(() => assertCompatibleOverrides([{ id: 'llm', disabled: true }]))
})
test('refuses unmigrated values without including their contents', () => {
  const patches = [{ id: 'llm-pi-ai', config: { credential: 'private-value' } }]
  const before = structuredClone(patches)
  assert.throws(() => assertCompatibleOverrides(patches), error => error.message.includes('llm-pi-ai') && !error.message.includes('private-value'))
  assert.deepEqual(patches, before)
})
test('accepts retained originals with complete explicitly migrated overrides', () => {
  assert.doesNotThrow(() => assertCompatibleOverrides([
    { id: 'llm-pi-ai', config: {} }, { id: 'loom-compat-llm-pi-ai', config: {} },
  ]))
})
test('requires disabled stock providers while replacements run', () => {
  assert.throws(() => assertCompatibleOverrides([{ id: 'ui-chat', disabled: false }]), /cannot enable/)
})
test('checks inserted user rows without changing the source list', () => {
  assert.throws(() => assertCompatibleOverrides([{ insert: [{ id: 'ui-chat', config: {} }] }]), /configuration migration/)
})

test('refuses migrated overrides that still assert a stock module name', () => {
  assert.throws(() => assertCompatibleOverrides([
    { id: 'llm-pi-ai', config: {} },
    { id: 'loom-compat-llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: {} },
  ]), /stock name assertions/)
})

test('stock verifier defaults to feature checks and explicitly selects the full suite', () => {
  const args = ['--runtime', 'official/node_modules/@deepseek-ai/dsh', '--tarball', 'loom.tgz']
  const defaults = parseOptions(args)
  assert.deepEqual(defaults, { runtime: resolve(args[1]), tarball: resolve('loom.tgz'), timeoutMs: 180000, webSmoke: false, allTests: false })
  assert.deepEqual(parseOptions([...args, '--all-tests', '--web-smoke', '--timeout-ms', '600000']), { ...defaults, allTests: true, webSmoke: true, timeoutMs: 600000 })
  assert.deepEqual(parseOptions(['--help']), { help: true })
})

test('stock verifier refuses unknown, repeated, valued boolean and incomplete inputs', () => {
  const args = ['--runtime', 'official/node_modules/@deepseek-ai/dsh', '--tarball', 'loom.tgz']
  for (const suffix of [['--everything'], ['--all-tests', '--all-tests'], ['--all-tests', 'true'], ['--web-smoke', '--web-smoke'], ['--timeout-ms', '0'], ['--timeout-ms', '600001'], ['--timeout-ms', '1.5']]) {
    assert.throws(() => parseOptions([...args, ...suffix]), /Unknown argument|Duplicate argument|must be an integer/)
  }
  assert.throws(() => parseOptions(['--all-tests']), /Required argument --runtime/)
  assert.throws(() => parseOptions([...args, '--help']), /cannot be combined/)
  assert.throws(() => parseOptions(['--runtime', '--all-tests']), /Missing or invalid value/)
})

test('stock verifier discovers every regular test in stable order and retains the feature-only default', async () => {
  const directory = await mkdtemp(join(dir, 'selection-'))
  await writeFile(join(directory, 'z-extra.test.mjs'), '')
  await writeFile(join(directory, 'features.test.mjs'), '')
  await writeFile(join(directory, 'a-first.test.mjs'), '')
  await writeFile(join(directory, 'helper.mjs'), '')
  await mkdir(join(directory, 'directory.test.mjs'))
  assert.deepEqual(await resolveTestFiles(directory, false), [join(directory, 'features.test.mjs')])
  assert.deepEqual(await resolveTestFiles(directory, true), ['a-first.test.mjs', 'features.test.mjs', 'z-extra.test.mjs'].map(name => join(directory, name)))
})

test('stock verifier refuses missing feature coverage before installing the candidate', async () => {
  const directory = await mkdtemp(join(dir, 'missing-feature-'))
  await assert.rejects(resolveTestFiles(directory, true), /requires tests\/features.test.mjs/)
  await writeFile(join(directory, 'other.test.mjs'), '')
  await assert.rejects(resolveTestFiles(directory, false), /requires tests\/features.test.mjs/)
  await assert.rejects(resolveTestFiles(directory, true), /requires tests\/features.test.mjs/)
})
