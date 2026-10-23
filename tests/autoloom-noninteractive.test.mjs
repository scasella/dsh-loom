/** Autoloom interaction refusals through the installed official loop, tools, and question service. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { featureHost, ownEvents, project, signal, stock, stockModules, textOf, textResponse, toolResponse } from '../test-support/features-host.mjs'

let temporary
let plugin
const resolveStock = createRequire(path.join(stockModules, 'autoloom-proof.cjs')).resolve
const questions = [{ id: 'choice', question: 'Which continuation?' }]

before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'loom-autoloom-proof-'))
  const host = JSON.parse(await readFile(path.join(project, 'host-plan.json'), 'utf8'))
  const llm = JSON.parse(await readFile(path.join(project, 'llm-plan.json'), 'utf8'))
  const aliases = { ...host.aliases, ...llm.aliases }
  const outfile = path.join(temporary, 'plugin.mjs')
  await build({
    entryPoints: [path.join(project, 'vendor/harness/packages/experimental/tool-loom/src/index.ts')], outfile,
    bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node22', logLevel: 'silent',
    plugins: [{ name: 'official-autoloom-proof', setup(builder) {
      builder.onResolve({ filter: /^@loom\/stock\// }, args => ({ path: resolveStock(args.path.slice('@loom/stock/'.length)), external: true }))
      builder.onResolve({ filter: /^(?:@deepseek-ai\/|zod$)/ }, args => {
        const alias = aliases[args.path]
        return alias === undefined ? { path: resolveStock(args.path), external: true } : { path: path.join(project, alias) }
      })
    } }],
  })
  plugin = await import(pathToFileURL(outfile).href)
})

after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })

async function mountAutoloom(h, limits = {}) {
  h.ctx.provide('permissionPresets', {
    names: ['loom-child'], resolve: () => ({ sandbox: 'read-only', approval: 'never' }),
    set: (session, preset) => session.append('permission/preset', { preset }),
  })
  return h.ctx.plugin(plugin, { autoloom: { childPermissionPreset: 'loom-child', ...limits } })
}

async function mountQuestions(h) {
  const module = await stock('@deepseek-ai/dsh-user-questions')
  await h.ctx.plugin(module.default ?? module, {})
  const tool = await stock('@deepseek-ai/dsh-tool-ask-user')
  await h.ctx.plugin(tool.default ?? tool, {})
}

function value(result) {
  assert.notEqual(result.isError, true, textOf(result.content))
  return JSON.parse(textOf(result.content))
}

function answer(request) {
  return { answers: request.questions.map(question => ({ id: question.id, selected: [], custom: 'human answer' })) }
}

function questionResponder(h) {
  let calls = 0
  h.adapter.respond = async function* (options) {
    const last = options.messages.at(-1)
    if (last.role === 'tool') { yield* textResponse(`Observed: ${textOf(last.content)}`); return }
    const prompt = textOf(options.messages.findLast(message => message.role === 'user' && ['user', 'loom'].includes(message.source?.kind))?.content ?? [])
    if (prompt === 'ask-native') { yield* toolResponse(`question-${++calls}`, 'ask_user_question', { questions }); return }
    if (prompt === 'ask-custom') { yield* toolResponse(`question-${++calls}`, 'custom_question', {}); return }
    yield* textResponse(`Reply: ${prompt}`)
  }
}

test('native questions are refused before dispatch, release the only branch slot, and retain model-visible errors', { timeout: 30_000 }, async () => {
  const h = await featureHost({ loom: { maxConcurrentBranches: 1 } })
  try {
    await mountQuestions(h)
    let requests = 0
    h.ctx.on('user-questions/request', async request => { requests++; return answer(request) }, { global: true })
    await mountAutoloom(h)
    questionResponder(h)
    const source = await h.create('question-source')
    await h.prompt(source, 'seed')
    const weaver = await h.create('question-weaver')
    const expanded = value(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['ask-native', 'second finishes'] }))
    const children = await h.settle(expanded)
    const waited = value(await h.tool(weaver, 'loom_wait', { setId: expanded.setId, timeoutMs: 1000 }))
    assert.equal(waited.timedOut, false)
    assert.equal(requests, 0)
    const result = ownEvents(children[0]).find(event => event.type === 'tool/result')
    assert.equal(result.data.message.isError, true)
    assert.match(textOf(result.data.message.content), /Autoloom children cannot ask for human input/)
    assert.match(textOf(children[0].session.deriveMessages().at(-1).content), /unresolved question/)
    assert.match(textOf(children[1].session.deriveMessages().at(-1).content), /second finishes/)
    assert.ok(children.every(child => child.status === 'idle'))
    await h.prompt(source, 'ask-native')
    assert.equal(requests, 1, 'ordinary human-owned Sessions still ask normally')
  } finally { await h.close() }
})

test('custom tools cannot bypass the user-question refusal, while ordinary callers delegate', { timeout: 30_000 }, async () => {
  const h = await featureHost()
  try {
    await mountQuestions(h)
    let requests = 0
    h.ctx.on('user-questions/request', async request => { requests++; return answer(request) }, { global: true })
    const tools = await stock('@deepseek-ai/dsh-tools')
    h.ctx.tools.register(tools.defineContentToolFixture({
      name: 'custom_question', description: 'Ask through the question service.', parameters: {},
      execute: async (_args, exec) => [{ type: 'text', text: JSON.stringify(await h.ctx.userQuestions.ask({ questions, agent: exec.agent, signal: exec.signal })) }],
    }))
    await mountAutoloom(h)
    questionResponder(h)
    const source = await h.create('custom-source')
    await h.prompt(source, 'seed')
    const weaver = await h.create('custom-weaver')
    const [child] = await h.settle(value(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['ask-custom'] })))
    assert.equal(requests, 0)
    const result = ownEvents(child).find(event => event.type === 'tool/result')
    assert.equal(result.data.message.isError, true)
    assert.match(textOf(result.data.message.content), /unresolved question/)
    assert.equal(result.data.error.code, 'autoloom/non-interactive')
    await assert.rejects(h.ctx.userQuestions.askTimed({ agent: child, questions, signal: signal() }, h.llm.ToolCallId('timed-question'), 10_000), error => error.code === 'autoloom/non-interactive')
    assert.deepEqual(await h.ctx.userQuestions.attachWait(child, h.llm.ToolCallId('timed-question'), signal()).next(), { done: true, value: undefined })
    const outcome = await h.ctx.waterfall('approval/request', { agent: child, toolName: 'custom_question' }, () => Promise.resolve('allowed-once'))
    assert.equal(outcome, 'rejected')
    const humanOutcome = await h.ctx.waterfall('approval/request', { agent: source, toolName: 'custom_question' }, () => Promise.resolve('allowed-once'))
    assert.equal(humanOutcome, 'allowed-once')
    await h.prompt(source, 'ask-custom')
    assert.equal(requests, 1)
  } finally { await h.close() }
})

test('resumed autoloom children retain non-interactive policy from their durable first own prompt', { timeout: 30_000 }, async () => {
  let h = await featureHost()
  const directory = h.root
  try {
    await mountAutoloom(h)
    const source = await h.create('persisted-source')
    await h.prompt(source, 'seed')
    const weaver = await h.create('persisted-weaver')
    const [child] = await h.settle(value(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['child seed'] })))
    const id = child.id
    await h.close(false)
    h = await featureHost({ directory })
    await mountQuestions(h)
    let requests = 0
    h.ctx.on('user-questions/request', async request => { requests++; return answer(request) }, { global: true })
    await mountAutoloom(h)
    questionResponder(h)
    const resolved = await h.ctx.sessionController.resolveAgent(id)
    assert.ok(!('error' in resolved))
    await h.prompt(resolved.agent, 'ask-native')
    assert.equal(requests, 0)
    assert.match(textOf(resolved.agent.session.deriveMessages().at(-1).content), /unresolved question/)
  } finally { await h.close(true) }
})

test('depth refusals leave the Session family unchanged before any fork', { timeout: 30_000 }, async () => {
  const h = await featureHost()
  try {
    await mountAutoloom(h, { maxDepth: 1 })
    const source = await h.create('depth-source')
    await h.prompt(source, 'seed')
    const weaver = await h.create('depth-weaver')
    const [child] = await h.settle(value(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['child seed'] })))
    const before = (await h.ctx.sessionController.list({}, signal())).items.map(item => item.sessionId).sort()
    const result = await h.tool(weaver, 'loom_expand', { sessionId: child.id, afterTurn: 2, lines: ['too deep'] })
    assert.equal(result.isError, true)
    assert.match(textOf(result.content), /generation 2.*limit is 1/s)
    assert.deepEqual((await h.ctx.sessionController.list({}, signal())).items.map(item => item.sessionId).sort(), before)
  } finally { await h.close() }
})

test('unloading autoloom removes its interaction guards after its children settle', { timeout: 30_000 }, async () => {
  const h = await featureHost()
  try {
    await mountQuestions(h)
    let requests = 0
    h.ctx.on('user-questions/request', async request => { requests++; return answer(request) }, { global: true })
    const fiber = await mountAutoloom(h)
    const source = await h.create('unload-source')
    await h.prompt(source, 'seed')
    const weaver = await h.create('unload-weaver')
    const [child] = await h.settle(value(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['child seed'] })))
    await fiber.dispose()
    assert.equal(h.ctx.tools.get('loom_expand'), undefined)
    questionResponder(h)
    await h.prompt(child, 'ask-native')
    assert.equal(requests, 1)
    assert.match(textOf(child.session.deriveMessages().at(-1).content), /human answer/)
  } finally { await h.close() }
})
