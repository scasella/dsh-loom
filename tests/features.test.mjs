/** Host parity through the installed standalone tarball and unmodified published Harness services. */
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { featureHost, signal, ownEvents, textOf, git, textResponse } from '../test-support/features-host.mjs'

const userTexts = agent => ownEvents(agent).filter(event => event.type === 'user/message' && ['user', 'loom'].includes(event.data.source.kind)).map(event => textOf(event.data.content))
const records = (h, agent) => agent.session.snapshotEvents().map(h.session.pluginRecordOf).filter(Boolean)
const toolValue = result => { assert.notEqual(result.isError, true, textOf(result.content)); return JSON.parse(textOf(result.content)) }

test('regenerate, edit, steering and sampled variants retain history, routes, lineage and exact request previews', async () => {
  const h = await featureHost()
  try {
    const source = await h.create('branch-source')
    await h.prompt(source, 'original orchid-lantern')
    const before = source.session.snapshotEvents()
    const request = { sessionId: source.id, requestId: 'regenerate', kind: 'regenerate', turn: 1, count: 2 }
    const value = await h.ctx.loom.branch(request)
    const children = await h.settle(value)
    assert.deepEqual(await h.ctx.loom.branch(request), value)
    assert.equal(children.length, 2)
    assert.deepEqual(source.session.snapshotEvents(), before)
    assert.ok(children.every(agent => agent.session.header.parentSession === source.id))
    assert.ok(children.every(agent => userTexts(agent).join() === 'original orchid-lantern'))
    const edited = (await h.settle(await h.ctx.loom.branch({ sessionId: source.id, requestId: 'edit', kind: 'edit', turn: 1, text: 'edited cobalt-river', selection: { provider: 'mock', model: 'other' } })))[0]
    assert.deepEqual(userTexts(edited), ['edited cobalt-river'])
    const sibling = (await h.settle(await h.ctx.loom.branch({ sessionId: edited.id, requestId: 'sibling', kind: 'regenerate', turn: 1, count: 1 })))[0]
    assert.equal(h.adapter.requests.findLast(request => request.sessionId === sibling.id).model, 'other')
    const variants = await h.settle(await h.ctx.loom.branch({ sessionId: source.id, requestId: 'variants', kind: 'variants', afterTurn: 1, lines: ['left silver-field', 'right amber-hill'], samples: 2 }))
    assert.deepEqual(variants.map(userTexts), [['left silver-field'], ['left silver-field'], ['right amber-hill'], ['right amber-hill']])
    const projections = variants.map(agent => h.ctx.sessionProjections.snapshot(agent.session).values)
    assert.ok(projections.every(value => value.forkLineage && value.loomBranch))
    assert.equal(projections[0].loomBranch.variantKey, projections[1].loomBranch.variantKey)
    assert.notEqual(projections[0].loomBranch.variantKey, projections[2].loomBranch.variantKey)
    const child = variants[0]
    const settlement = ownEvents(child).findLast(event => event.type === 'assistant/message')
    const view = await h.ctx.loom.requestAt({ sessionId: child.id, seq: settlement.seq }, signal())
    assert.deepEqual(view.route, { provider: 'mock', model: 'mock' })
    assert.ok(view.messages.some(message => message.inherited))
    assert.ok(view.messages.some(message => !message.inherited && message.preview.includes('left silver-field')))
    assert.ok(h.ctx.sessionProjections.snapshot(child.session).values.tokenUsage.fork.own)
    assert.ok(h.ctx.sessionProjections.snapshot(child.session).values.sessionStats.fork.own)
    const own = await h.ctx.sessionController.search({ query: 'orchid-lantern', sessionIds: [child.id], scope: 'own' }, signal())
    const inherited = await h.ctx.sessionController.search({ query: 'orchid-lantern', sessionIds: [child.id], scope: 'inherited' }, signal())
    assert.equal(own.items.length, 0)
    assert.ok(inherited.items.some(item => item.sessionId === child.id))
    const count = h.adapter.requests.length
    await assert.rejects(h.ctx.loom.branch({ ...request, requestId: 'invalid', count: 0 }), error => error.code === 'gateway/bad-request')
    assert.equal(h.adapter.requests.length, count)
  } finally { await h.close() }
})

test('real Git worktrees compare changes and list prices, reject a dirty apply, then apply, adopt and discard', async () => {
  const h = await featureHost()
  try {
    const source = await h.create('workspace-source')
    await h.prompt(source, 'start workspace')
    const estimate = await h.ctx.loom.estimate({ sessionId: source.id, kind: 'regenerate', turn: 1, count: 2 }, signal())
    assert.deepEqual(estimate, { priced: true, perBranch: { low: 0.000025, high: 0.00004 }, total: { low: 0.00005, high: 0.00008 }, cacheShare: 0, basis: 'own-turn' })
    await writeFile(path.join(h.repo, 'context.txt'), 'tracked working change\n')
    await writeFile(path.join(h.repo, 'scratch.txt'), 'untracked scratch\n')
    const value = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'workspace', kind: 'steer', afterTurn: 1, lines: ['write notes.txt: alpha', 'write notes.txt: beta'], isolation: 'worktree' })
    const [a, b] = await h.settle(value)
    const isolation = agent => records(h, agent).find(record => record.type === 'plugin:loom/isolation').data
    const [ia, ib] = [isolation(a), isolation(b)]
    assert.notEqual(ia.worktreePath, ib.worktreePath)
    assert.equal(await readFile(path.join(ia.worktreePath, 'context.txt'), 'utf8'), 'tracked working change\n')
    await assert.rejects(access(path.join(ia.worktreePath, 'scratch.txt')), error => error.code === 'ENOENT')
    assert.equal(await readFile(path.join(ia.worktreePath, 'notes.txt'), 'utf8'), 'alpha\n')
    assert.equal(await readFile(path.join(ib.worktreePath, 'notes.txt'), 'utf8'), 'beta\n')
    assert.equal(await readFile(path.join(h.repo, 'notes.txt'), 'utf8'), 'base\n')
    const compare = await h.ctx.loom.compare({ sessionId: a.id, setId: value.setId }, signal())
    assert.equal(compare.rows.length, 2)
    assert.ok(compare.rows.every(row => row.own.usd.label === 'list price' && row.own.usd.amount > 0))
    assert.match(JSON.stringify(await h.ctx.loom.diff({ sessionId: a.id }, signal())), /alpha/)
    await writeFile(path.join(h.repo, 'notes.txt'), 'dirty\n')
    await assert.rejects(h.ctx.loom.apply({ sessionId: a.id }), error => error.code === 'loom/apply-dirty')
    assert.equal(await readFile(path.join(ia.worktreePath, 'notes.txt'), 'utf8'), 'alpha\n')
    await git(h.repo, 'restore', 'notes.txt', 'context.txt')
    assert.deepEqual(await h.ctx.loom.apply({ sessionId: a.id }), { applied: [{ path: 'notes.txt' }] })
    assert.equal(await readFile(path.join(h.repo, 'notes.txt'), 'utf8'), 'alpha\n')
    await assert.rejects(access(ia.worktreePath), error => error.code === 'ENOENT')
    await git(h.repo, 'add', 'notes.txt')
    await git(h.repo, 'commit', '-m', 'Keep applied choice')
    await assert.rejects(h.ctx.loom.apply({ sessionId: b.id }), error => error.code === 'loom/apply-conflict')
    assert.equal(await readFile(path.join(h.repo, 'notes.txt'), 'utf8'), 'alpha\n')
    assert.deepEqual(await h.ctx.loom.adopt({ sessionId: a.id }), { adopted: a.id, archived: [b.id] })
    assert.deepEqual(h.archived, [b.id])
    await h.ctx.loom.discard({ sessionId: b.id })
    await assert.rejects(access(ib.worktreePath), error => error.code === 'ENOENT')
    assert.ok(records(h, a).some(record => record.type === 'plugin:loom/adopt'))
    assert.ok((await h.ctx.sessionController.inspect(b.id, signal())).events.length > 0)
  } finally { await h.close() }
})

test('counterfactual tool content continues a child without a human message or changing its source', async () => {
  const h = await featureHost()
  try {
    const source = await h.create('counterfactual-source')
    await h.prompt(source, 'lookup')
    const before = source.session.snapshotEvents()
    const original = before.find(event => event.type === 'tool/result')
    assert.ok(original)
    const fork = await h.ctx.loom.counterfactual({ sessionId: source.id, resultSeq: original.seq, content: [{ type: 'text', text: 'edited result' }] }, signal())
    const child = h.ctx.agents.get(fork.sessionId)
    await child.whenIdle()
    assert.ok(child.session.deriveMessages().some(message => message.role === 'tool' && textOf(message.content) === 'edited result'))
    assert.equal(child.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 1)
    assert.equal(ownEvents(child).filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length, 0)
    assert.ok(ownEvents(child).some(event => event.type === 'turn/start' && event.data.continuation))
    assert.ok(records(h, child).some(record => record.type === 'plugin:loom/tool-result-override'))
    assert.equal(textOf(child.session.deriveMessages().at(-1).content), 'Observed: edited result')
    assert.deepEqual(source.session.snapshotEvents(), before)
  } finally { await h.close() }
})

test('Weave logs exact prefixes before dispatch, retains probabilities and choices, probes bounded alternatives and exports', async () => {
  const h = await featureHost({ loom: { probe: { maxRequests: 2 } } })
  try {
    const agent = await h.create('weave-source')
    const request = { sessionId: agent.id, parent: null, prefix: [{ text: 'Once ', author: 'user' }], n: 2 }
    const start = h.adapter.requests.length
    const loggedAtDispatch = []
    h.adapter.onRequest = options => {
      if (options.assistantPrefix !== undefined) {
        const last = records(h, agent).findLast(record => record.type === 'plugin:loom/weave-request')
        assert.equal(last.type, 'plugin:loom/weave-request')
        assert.equal(last.data.assistantPrefix, options.assistantPrefix)
        loggedAtDispatch.push(last)
      }
    }
    const value = await h.ctx.loom.weave(request, signal())
    assert.equal(value.schedule, 'lead-then-burst')
    assert.deepEqual(value.nodes.map(node => [node.text, node.status]), [['A', 'completed'], ['B', 'completed']])
    assert.ok(value.nodes.every(node => node.prefix[0].text === 'Once ' && node.logprobs))
    assert.equal(h.adapter.requests.length - start, 2)
    assert.equal(loggedAtDispatch.length, 2)
    assert.equal(h.adapter.requests[start].assistantPrefix, 'Once ')
    assert.equal(h.adapter.requests[start].tools, undefined)
    assert.equal(agent.session.deriveMessages().length, 0)
    const first = value.nodes[0], second = value.nodes[1]
    assert.deepEqual(await h.ctx.loom.choose({ sessionId: agent.id, nodeId: first.id }, signal()), { curationBits: 1, modelTokens: 1 })
    const seq = agent.session.seq
    await h.ctx.loom.choose({ sessionId: agent.id, nodeId: first.id }, signal())
    assert.equal(agent.session.seq, seq)
    await h.ctx.loom.choose({ sessionId: agent.id, nodeId: second.id }, signal())
    const state = await h.ctx.loom.weaveState({ sessionId: agent.id }, signal())
    assert.deepEqual(state.choices.map(choice => choice.nodeId), [second.id])
    assert.equal((await h.ctx.loom.weave(request, signal())).schedule, 'burst')
    for (const mode of ['path', 'siblings', 'kept']) {
      const file = await h.ctx.loom.export({ sessionId: agent.id, nodeId: second.id, mode }, signal())
      const response = await h.download(file)
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.nodes.length, mode === 'siblings' ? 2 : 1)
      assert.equal(body.curationBits, 1)
      assert.equal(body.choices[0].nodeId, second.id)
    }
    const probe = await h.ctx.loom.probe({ sessionId: agent.id, parent: null, prefix: [{ text: 'Probe ', author: 'user' }], depth: 3 }, signal())
    assert.equal(probe.requests, 2)
    assert.equal(probe.truncated, true)
    assert.ok(probe.nodes.some(node => node.token === 'A'))
    assert.ok(probe.nodes.some(node => node.token === 'B'))
    assert.ok(records(h, agent).some(record => record.type === 'plugin:loom/weave-request'))
    assert.ok(records(h, agent).some(record => record.type === 'plugin:loom/weave-node'))
  } finally { await h.close() }
})

test('cold marks and Weave choices survive independent Host reloads with real JSONL persistence', async () => {
  let h = await featureHost()
  const directory = h.root
  try {
    const source = await h.create('cold-source')
    await h.prompt(source, 'persist me')
    const woven = await h.ctx.loom.weave({ sessionId: source.id, parent: null, prefix: [], n: 2 }, signal())
    await h.ctx.loom.choose({ sessionId: source.id, nodeId: woven.nodes[0].id }, signal())
    await h.close(false)
    h = await featureHost({ directory })
    assert.equal(h.ctx.agents.get('cold-source'), undefined)
    assert.deepEqual(await h.ctx.loom.mark({ sessionId: 'cold-source', mark: 'keep' }), { mark: 'keep' })
    await h.ctx.loom.mark({ sessionId: 'cold-source', mark: 'keep' })
    await h.close(false)
    h = await featureHost({ directory })
    const resolved = await h.ctx.sessionController.resolveAgent('cold-source')
    assert.ok(!('error' in resolved))
    assert.deepEqual(h.ctx.sessionProjections.snapshot(resolved.agent.session).values.loomMark, { mark: 'keep' })
    assert.equal(records(h, resolved.agent).filter(record => record.type === 'plugin:loom/mark').length, 1)
    const state = await h.ctx.loom.weaveState({ sessionId: 'cold-source' }, signal())
    assert.equal(state.curationBits, 1)
    assert.equal(state.nodes.length, 2)
  } finally { await h.close(true) }
})

test('all five autoloom tools run through the stock tool pipeline and enforce branch budget before creating a fork', async () => {
  const h = await featureHost({ autoloom: { autoloom: { maxBranches: 2 } } })
  try {
    const source = await h.create('autoloom-source')
    await h.prompt(source, 'story begins')
    const weaver = await h.create('weaver')
    const expanded = toolValue(await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, lines: ['darker', 'brighter'] }))
    const children = await h.settle(expanded)
    const waited = toolValue(await h.tool(weaver, 'loom_wait', { setId: expanded.setId, timeoutMs: 1000 }))
    assert.ok(waited)
    assert.ok(children.every(child => ownEvents(child).some(event => event.type === 'user/message' && event.data.source.kind === 'loom')))
    assert.ok(children.every(child => ownEvents(child).findIndex(event => event.type === 'permission/preset') < ownEvents(child).findIndex(event => event.type === 'user/message')))
    assert.ok(toolValue(await h.tool(weaver, 'loom_read', { sessionId: children[0].id })))
    assert.ok(toolValue(await h.tool(weaver, 'loom_keep', { sessionId: children[0].id })))
    assert.ok(toolValue(await h.tool(weaver, 'loom_cull', { sessionId: children[1].id })))
    assert.ok(h.archived.includes(children[1].id))
    const before = (await h.ctx.sessionController.list({}, signal())).items.length
    const refused = await h.tool(weaver, 'loom_expand', { sessionId: source.id, afterTurn: 1, count: 1 })
    assert.equal(refused.isError, true)
    assert.match(textOf(refused.content), /branch budget|branches/i)
    assert.equal((await h.ctx.sessionController.list({}, signal())).items.length, before)
  } finally { await h.close() }
})


test('shared writable branches queue without creating children, and queued cancellation never starts a model call', async () => {
  const h = await featureHost({ loom: { maxConcurrentBranches: 1 } })
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  try {
    const source = await h.create('queue-source')
    await h.prompt(source, 'seed')
    h.adapter.respond = async function* (options) {
      entered.resolve()
      await release.promise
      yield* textResponse('released')
    }
    const value = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'queue', kind: 'steer', afterTurn: 1, lines: ['first', 'never start'] })
    await entered.promise
    assert.deepEqual(value.children.map(child => child.state), ['started', 'queued'])
    assert.equal(value.children[1].sessionId, undefined)
    const calls = h.adapter.requests.length
    assert.deepEqual(h.ctx.loom.cancel({ setId: value.setId, indices: [1] }), { cancelled: [1] })
    assert.deepEqual(h.ctx.loom.cancel({ setId: value.setId, indices: [1] }), { cancelled: [] })
    release.resolve()
    const first = h.ctx.agents.get(value.children[0].sessionId)
    await first.whenIdle()
    assert.equal(h.adapter.requests.length, calls)
    assert.equal(h.ctx.loom.setStatus({ setId: value.setId }).children[1].state, 'cancelled')
  } finally { release.resolve(); await h.close() }
})

test('Compare parses the branch own real command output instead of tool presentation metadata', async () => {
  const h = await featureHost({ loom: { outcomes: { testSummary: [{ name: 'node-tap', summary: String.raw`^# tests \d+\n# suites \d+\n# pass \d+\n# fail \d+`, total: String.raw`# tests (\d+)`, passed: String.raw`# pass (\d+)`, failed: String.raw`# fail (\d+)` }] } } })
  try {
    const source = await h.create('outcomes-source')
    await h.prompt(source, 'seed')
    const [child] = await h.settle(await h.ctx.loom.branch({ sessionId: source.id, requestId: 'outcomes', kind: 'steer', afterTurn: 1, lines: ['bash node --test check.test.cjs'], isolation: 'worktree' }))
    const row = (await h.ctx.loom.compare({ sessionId: child.id }, signal())).rows[0]
    assert.deepEqual(row.tests, { total: 1, passed: 1, failed: 0, ok: true, command: 'node --test check.test.cjs' })
    const result = ownEvents(child).find(event => event.type === 'tool/result')
    assert.match(textOf(result.data.message.content), /# pass 1/)
    assert.match(JSON.stringify(result.data.meta), /99 passed/)
    await h.ctx.loom.discard({ sessionId: child.id })
  } finally { await h.close() }
})
