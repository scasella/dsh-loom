/** Private model-settings transfer fixture loaded by the unmodified official adapter. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { stock } from '../test-support/features-host.mjs'

const profile = (model, key) => ({
  api: 'openai-completions', baseURL: 'https://example.invalid/v1', apiKeyEnv: key,
  models: [{ id: model, name: model, input: ['text'] }],
})

function stockCopy(config) {
  const result = structuredClone(config)
  for (const provider of Object.values(result.providers)) {
    delete provider.openRouterProvider
    for (const model of [...provider.models ?? [], ...Object.values(provider.modelOverrides ?? {})]) {
      delete model.assistantPrefill
      delete model.tokenLogprobs
    }
  }
  return result
}

function fields(schema, ...steps) {
  const json = schema.toJSON()
  let node = json.refs[json.uid]
  for (const step of steps) node = json.refs[step === 'inner' ? node.inner : node.dict[step]]
  return Object.keys(node.dict)
}

test('stock settings transfer removes every Loom-only model declaration while retaining provider and credential references', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'loom-model-transfer-'))
  const { Context } = await stock('@deepseek-ai/cordis')
  const ctx = new Context()
  try {
    const pi = await stock('@deepseek-ai/dsh-llm-pi-ai')
    assert.ok(!fields(pi.Config, 'providers', 'inner').includes('openRouterProvider'))
    for (const declarations of ['models', 'modelOverrides']) {
      const keys = fields(pi.Config, 'providers', 'inner', declarations, 'inner')
      assert.ok(!keys.includes('assistantPrefill'))
      assert.ok(!keys.includes('tokenLogprobs'))
    }
    const existing = profile('existing-model', 'EXISTING_TEST_REFERENCE')
    const configured = profile('continuation-model', 'CONTINUATION_TEST_REFERENCE')
    configured.models[0].assistantPrefill = 'tool-free'
    configured.models[0].tokenLogprobs = { maxTopLogprobs: 5 }
    configured.openRouterProvider = { order: ['deepseek'], allowFallbacks: false }
    const overrides = {
      apiKeyEnv: 'CATALOG_TEST_REFERENCE',
      modelOverrides: { 'deepseek-flash': { name: 'Catalog override', assistantPrefill: 'tool-free', tokenLogprobs: { maxTopLogprobs: 5 } } },
    }
    const entries = [
      { id: 'llm-pi-ai', config: { providers: { existing } } },
      { id: 'loom-compat-llm-pi-ai', config: { providers: { continuation: configured, deepseek: overrides } } },
    ]
    const fixture = path.join(root, 'cordis.patch.yml')
    const backup = path.join(root, 'cordis.patch.backup.yml')
    const original = JSON.stringify(entries, null, 2) + '\n'
    await writeFile(fixture, original, { mode: 0o600 })
    await writeFile(backup, original, { mode: 0o600 })
    const loaded = JSON.parse(await readFile(fixture, 'utf8'))
    const copied = stockCopy(loaded[1].config)
    // Reconcile the new routes without overwriting the independent stock provider.
    loaded[0].config = { providers: { ...loaded[0].config.providers, ...copied.providers } }
    await writeFile(fixture, JSON.stringify(loaded, null, 2) + '\n', { mode: 0o600 })
    assert.equal(await readFile(backup, 'utf8'), original)
    assert.deepEqual(loaded[1], entries[1], 'keep the compatibility entry for rollback')
    assert.deepEqual(loaded[0].config.providers.existing, existing)
    const validated = pi.Config(loaded[0].config).providers.get()
    assert.equal(validated.continuation.apiKeyEnv, 'CONTINUATION_TEST_REFERENCE')
    assert.equal(validated.deepseek.apiKeyEnv, 'CATALOG_TEST_REFERENCE')
    assert.deepEqual(validated.continuation.models.map(model => model.id), ['continuation-model'])
    assert.ok(!('openRouterProvider' in validated.continuation))
    assert.ok(!('assistantPrefill' in validated.continuation.models[0]))
    assert.ok(!('tokenLogprobs' in validated.deepseek.modelOverrides['deepseek-flash']))
    const registry = await stock('@deepseek-ai/dsh-typert-registry')
    const llm = await stock('@deepseek-ai/dsh-llm')
    await ctx.plugin(registry.default ?? registry)
    await ctx.plugin(llm.default)
    const references = []
    ctx.provide('credentials', { resolve: async reference => { references.push(reference); return { value: 'fixture-only-not-a-real-key' } } })
    await ctx.plugin(pi, loaded[0].config)
    assert.deepEqual((await ctx.llm.listModels('existing')).map(model => model.id), ['existing-model'])
    assert.deepEqual((await ctx.llm.listModels('continuation')).map(model => model.id), ['continuation-model'])
    assert.ok((await ctx.llm.listModels('deepseek')).some(model => model.name === 'Catalog override'))
    assert.deepEqual(references.sort(), ['CATALOG_TEST_REFERENCE', 'CONTINUATION_TEST_REFERENCE', 'EXISTING_TEST_REFERENCE'])
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
