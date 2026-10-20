/** Focused compatibility checks against an independently installed, official Harness runtime. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const project = path.resolve(import.meta.dirname, '..')
const stockModules = process.env.LOOM_STOCK_NODE_MODULES ?? path.resolve(project, '../upstream-install/node_modules')
let temporary
let privateLlm
let stockLlm
let Context
let sdkVersion

before(async () => {
  temporary = await mkdtemp(path.join(project, '.llm-proof-'))
  const output = path.join(temporary, 'dist/shared/proof.mjs')
  const local = 'vendor/harness/packages/llm'
  await build({
    stdin: {
      contents: `
        export * from './${local}/llm/src/index.ts';
        export { default as LlmRuntime } from './${local}/llm/src/index.ts';
        export { PiAiAdapter } from './${local}/llm-pi-ai/src/adapter.ts';
        export { resolveProfiles } from './${local}/llm-pi-ai/src/config.ts';
        export { TokenLogprobCapture } from './${local}/llm-pi-ai/src/logprobs.ts';
        export { markDeepSeekPrefix } from './${local}/llm-pi-ai/src/prefix.ts';
      `,
      resolveDir: project,
      sourcefile: 'llm-compat-proof.ts',
      loader: 'ts',
    },
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: false } },
    logLevel: 'silent',
    plugins: [{
      name: 'official-stock-proof',
      setup(builder) {
        builder.onResolve({ filter: /^@loom\/stock\// }, async (args) => {
          const resolved = await builder.resolve(args.path.slice('@loom/stock/'.length), {
            resolveDir: stockModules,
            kind: args.kind,
            pluginData: { stock: true },
          })
          if (resolved.errors.length) return { errors: resolved.errors }
          return { path: resolved.path, external: true }
        })
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-llm(?:\/.*)?$/ }, (args) => {
          if (args.pluginData?.stock) return
          const suffix = args.path.slice('@deepseek-ai/dsh-llm'.length)
          const file = suffix === '' ? 'index' : suffix.slice(1)
          return { path: path.join(project, local, 'llm/src', `${file}.ts`) }
        })
        builder.onResolve({ filter: /^(?:@deepseek-ai\/|@earendil-works\/|zod$)/ }, async (args) => {
          if (args.pluginData?.stock) return
          const resolved = await builder.resolve(args.path, {
            resolveDir: stockModules,
            kind: args.kind,
            pluginData: { stock: true },
          })
          if (resolved.errors.length) return { errors: resolved.errors }
          return { path: resolved.path, external: true }
        })
      },
    }],
  })
  privateLlm = await import(pathToFileURL(output).href)
  stockLlm = await import(pathToFileURL(path.join(stockModules, '@deepseek-ai/dsh-llm/lib/index.js')).href)
  ;({ Context } = await import(pathToFileURL(path.join(stockModules, '@deepseek-ai/cordis/lib/index.js')).href))
  sdkVersion = JSON.parse(await readFile(path.join(stockModules, '@earendil-works/pi-ai/package.json'), 'utf8')).version
})

after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true })
})

function messages() {
  return [{ role: 'user', content: [{ type: 'text', text: 'Continue' }] }]
}

async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

async function withRuntime(extra, run) {
  const ctx = new Context()
  await ctx.plugin(privateLlm.LlmRuntime)
  class Adapter extends stockLlm.LlmAdapter {
    calls = 0
    async resolveModel(provider, model) { return { provider, id: model, name: model, ...extra } }
    async *stream() { this.calls += 1; yield { type: 'finish', reason: { kind: 'stop' } } }
  }
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['proof'], adapter)
  try { await run(ctx.llm, adapter) } finally { await ctx.fiber.dispose() }
}

test('shares stock error/provider identities and the exact request marker functions', () => {
  for (const key of ['LlmError', 'LlmAdapter', 'HarnessError', 'markAgentLoopRequest', 'isAgentLoopRequest']) {
    assert.equal(privateLlm[key], stockLlm[key], key)
  }
  const error = new privateLlm.LlmError('proof', 'PROOF')
  assert.ok(error instanceof stockLlm.LlmError)
  assert.ok(error instanceof stockLlm.HarnessError)
  assert.equal(privateLlm.isHarnessError(error), true)
})

test('keeps stock attribution when the shared bundle has no adjacent package manifest', () => {
  assert.equal(privateLlm.APP_IDENTITY, stockLlm.APP_IDENTITY)
  assert.equal(privateLlm.userAgent, stockLlm.userAgent)
  assert.equal(privateLlm.attributionHeaders, stockLlm.attributionHeaders)
  assert.deepEqual(privateLlm.attributionHeaders(), { 'user-agent': stockLlm.userAgent() })
})

test('recognizes stock-marked requests and rejects their auxiliary prefixes', () => {
  const request = stockLlm.markAgentLoopRequest({ provider: 'proof', model: 'm', messages: messages(), assistantPrefix: 'Once' })
  assert.equal(privateLlm.isAgentLoopRequest(request), true)
  assert.throws(() => privateLlm.assertLlmRequestCapabilities(request, { assistantPrefill: 'tool-free' }),
    error => error instanceof stockLlm.LlmError && error.code === 'INVALID_REQUEST')
  const other = privateLlm.markAgentLoopRequest({ messages: [] })
  assert.equal(stockLlm.isAgentLoopRequest(other), true)
})

test('retains probability-aware prepared-call checks with a stock adapter', async () => {
  await withRuntime({ tokenLogprobs: { maxTopLogprobs: 5 }, assistantPrefill: 'tool-free' }, async (llm, adapter) => {
    const call = await llm.prepareCall({ provider: 'proof', model: 'm', topLogprobs: 0 })
    assert.deepEqual(call.tokenLogprobs, { maxTopLogprobs: 5 })
    assert.equal(call.assistantPrefill, 'tool-free')
    assert.equal(Object.isFrozen(call.tokenLogprobs), true)
    assert.throws(() => call.stream({ ...call.config, messages: messages(), topLogprobs: 1 }),
      error => error instanceof stockLlm.LlmError && error.code === 'INVALID_PREPARED_CALL')
    await collect(call.stream({ ...call.config, messages: messages() }))
    assert.equal(adapter.calls, 1)
  })
})

test('refuses unsupported counts and tool history before dispatch', async () => {
  await withRuntime({ tokenLogprobs: { maxTopLogprobs: 2 }, assistantPrefill: 'tool-free' }, async (llm, adapter) => {
    for (const count of [-1, 0.5, 3]) {
      await assert.rejects(llm.prepareCall({ provider: 'proof', model: 'm', topLogprobs: count }),
        error => error instanceof stockLlm.LlmError && error.code === 'INVALID_REQUEST')
    }
    const call = await llm.prepareCall({ provider: 'proof', model: 'm' })
    for (const extra of [
      { tools: [] }, { toolHistory: { tools: [], updates: [] } },
      { messages: [{ role: 'tool', toolCallId: 'tool', content: [] }] },
    ]) {
      assert.throws(() => call.stream({ ...call.config, messages: messages(), assistantPrefix: 'Once', ...extra }),
        error => error instanceof stockLlm.LlmError && error.code === 'INVALID_REQUEST')
    }
    assert.equal(adapter.calls, 0)
  })
})

test('requires resolved thinking off before an auxiliary prefix reaches the adapter', async () => {
  await withRuntime({ assistantPrefill: 'tool-free', reasoning: {
    efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }], defaultEffort: 'high',
  } }, async (llm, adapter) => {
    const thinking = await llm.prepareCall({ provider: 'proof', model: 'm' })
    assert.throws(() => thinking.stream({ ...thinking.config, messages: messages(), assistantPrefix: 'Once' }),
      error => error instanceof stockLlm.LlmError && error.code === 'INVALID_REQUEST')
    assert.equal(adapter.calls, 0)
    const off = await llm.prepareCall({ provider: 'proof', model: 'm', reasoningEffort: 'off' })
    await collect(off.stream({ ...off.config, messages: messages(), assistantPrefix: 'Once' }))
    assert.equal(adapter.calls, 1)
  })
})

test('round-trips captured probabilities without annotating reasoning', () => {
  const capture = new privateLlm.TokenLogprobCapture(() => assert.fail('capture unexpectedly degraded'))
  capture.observe({ choices: [{ delta: { content: 'hello' }, logprobs: { content: [{ token: 'hello', logprob: -0.1, top_logprobs: [{ token: 'hello', logprob: -0.1 }] }] } }] })
  capture.delta(1)
  const probabilities = capture.finish(1, 'hello')
  const accumulator = new privateLlm.AssistantStreamAccumulator()
  const chunks = [
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thought' } },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'hello' }, logprobs: probabilities },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  chunks.forEach((chunk, time) => accumulator.push({ time, chunk }))
  const records = JSON.parse(JSON.stringify(accumulator.snapshot()))
  assert.deepEqual(privateLlm.assistantStreamBlockLogprobs(records), [undefined, probabilities])
  assert.deepEqual(stockLlm.expandAssistantStream(records).find(row => row.chunk.type === 'block-end' && row.chunk.index === 1).chunk.logprobs, probabilities)
})

test('does not retain missing or misaligned provider probabilities', () => {
  const reasons = []
  const capture = new privateLlm.TokenLogprobCapture(reason => reasons.push(reason))
  capture.observe({ choices: [{ delta: { content: 'hello' } }] })
  capture.delta(0)
  assert.equal(capture.finish(0, 'hello'), undefined)
  capture.observe({ choices: [{ delta: { content: 'hello' }, logprobs: { content: [{ token: 'different', logprob: -1 }] } }] })
  capture.delta(1)
  assert.equal(capture.finish(1, 'hello'), undefined)
  assert.deepEqual(reasons, ['missing token probabilities', 'token text does not match the completed block'])
})

test('marks only an exact final DeepSeek assistant prefix', () => {
  const result = privateLlm.markDeepSeekPrefix({ messages: [{ role: 'assistant', content: 'Once', reasoning_content: 'private' }] }, 'Once')
  assert.deepEqual(result.messages, [{ role: 'assistant', content: 'Once', prefix: true }])
  assert.throws(() => privateLlm.markDeepSeekPrefix({ messages: [{ role: 'assistant', content: 'Different' }] }, 'Once'),
    error => error instanceof stockLlm.LlmError && error.code === 'INVALID_REQUEST')
})

test('uses the official installed SDK for real prefix and probability serialization', async (t) => {
  const sdkPath = path.join(stockModules, '@earendil-works/pi-ai/dist/api/openai-completions.js')
  const sdkHash = createHash('sha256').update(await readFile(sdkPath)).digest('hex')
  t.diagnostic(`official stock pi-ai ${sdkVersion}; openai-completions SHA256 ${sdkHash}`)
  const requests = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body))
    const events = [
      { choices: [{ delta: { role: 'assistant', content: '' }, index: 0, finish_reason: null }] },
      { choices: [{ delta: { content: 'hello' }, index: 0, finish_reason: null, logprobs: { content: [{ token: 'hello', logprob: -0.1, top_logprobs: [{ token: 'hello', logprob: -0.1 }] }] } }] },
      { choices: [{ delta: {}, index: 0, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    for (const mode of ['trailing-message', 'deepseek-prefix']) {
      const profiles = privateLlm.resolveProfiles({ proof: {
        api: 'openai-completions', baseURL: 'https://loom-proof.invalid/v1',
        compat: { supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: 'openrouter' },
        openRouterProvider: { order: ['deepseek'], allowFallbacks: false },
        models: [{ id: 'm', tokenLogprobs: { maxTopLogprobs: 5 }, assistantPrefill: mode, reasoningEfforts: { off: null, high: 'high' } }],
      } })
      const auth = {
        credentials: { read: async () => undefined, list: async () => [], modify: async () => undefined, delete: async () => undefined },
        authContext: { env: async () => undefined, fileExists: async () => false },
      }
      const adapter = new privateLlm.PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => 'loom-proof-key', auth })
      assert.ok(adapter instanceof stockLlm.LlmAdapter)
      const output = await collect(adapter.stream({ provider: 'proof', model: 'm', messages: messages(), assistantPrefix: 'Once', topLogprobs: 5, stop: ['END'], reasoningEffort: 'off', cacheSessionId: 'family', sessionId: 'child' }))
      assert.equal(output.at(-1).reason.kind, 'stop', JSON.stringify(output.at(-1)))
      const body = requests.at(-1)
      assert.equal(body.logprobs, true)
      assert.equal(body.top_logprobs, 5)
      assert.deepEqual(body.provider, { order: ['deepseek'], allow_fallbacks: false })
      assert.deepEqual(body.reasoning, { enabled: false })
      assert.deepEqual(body.stop, ['END'])
      assert.equal(body.messages.at(-1).content, 'Once')
      if (mode === 'deepseek-prefix') assert.equal(body.messages.at(-1).prefix, true)
      const captured = output.find(chunk => chunk.type === 'block-end' && chunk.block.type === 'text').logprobs
      assert.deepEqual(captured.tokens, ['hello'])
      assert.deepEqual(captured.logprobs, [-0.1])
    }
    assert.equal(requests.length, 2)
  } finally { globalThis.fetch = previousFetch }
})


test('leaves SDK Responses mid-conversation effort to the installed provider catalog', () => {
  assert.throws(() => privateLlm.resolveProfiles({ proof: {
    api: 'openai-responses', baseURL: 'https://loom-proof.invalid/v1',
    compat: { supportsMidConvoEffort: true }, models: [{ id: 'm' }],
  } }), /compat "supportsMidConvoEffort", which is not configurable here/)
})
