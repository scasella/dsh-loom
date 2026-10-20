/** Profile migration refusals protect existing settings without changing them. */
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'

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
